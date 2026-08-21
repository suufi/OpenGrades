import ScheduledNotification from '@/models/ScheduledNotification'
import PushReceipt from '@/models/PushReceipt'
import PushToken from '@/models/PushToken'
import mongoConnection from '@/utils/mongoConnection'
import { sendPushNotification } from '@/utils/sendPushNotification'
import { expoRequestHeaders, partitionReceipts, type ExpoPushReceipt } from '@/utils/expoPushHelpers'
import type { NotificationCategory } from '@/types'

const TICK_INTERVAL_MS = 30000

// A 'sending' claim older than this is presumed crashed and retried (at-least-once)
const STALE_CLAIM_MS = 10 * 60 * 1000

// TODO: use our own notification server at some point
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const RECEIPT_BATCH_SIZE = 300
const RECEIPT_RETRY_DELAY_MS = 30 * 60 * 1000
const MAX_RECEIPT_ATTEMPTS = 6

export async function processDueNotifications(now: Date = new Date()): Promise<void> {
  await ScheduledNotification.updateMany(
    { status: 'sending', claimedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
    { $set: { status: 'pending' }, $unset: { claimedAt: 1 } }
  )

  for (;;) {
    const claimed = await ScheduledNotification.findOneAndUpdate(
      { status: 'pending', scheduledAt: { $ne: null, $lte: now } },
      { $set: { status: 'sending', claimedAt: new Date() } },
      { sort: { scheduledAt: 1 }, new: true }
    ).lean()

    if (!claimed) break

    try {
      await sendPushNotification({
        title: claimed.title,
        body: claimed.body,
        category: claimed.category as NotificationCategory,
        data: (claimed.data as Record<string, unknown> | null) ?? undefined,
        notificationId: String(claimed._id),
      })
    } catch (error) {
      console.error(`Error sending scheduled notification ${claimed._id}:`, error)
      await ScheduledNotification.findByIdAndUpdate(claimed._id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

export async function processDueReceipts(now: Date = new Date()): Promise<void> {
  const due = await PushReceipt.find({ checkAfter: { $lte: now } })
    .limit(RECEIPT_BATCH_SIZE)
    .lean()
  if (due.length === 0) return

  let receipts: Record<string, ExpoPushReceipt>
  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: expoRequestHeaders(process.env.EXPO_ACCESS_TOKEN),
      body: JSON.stringify({ ids: due.map(d => d.ticketId) }),
    })
    if (!response.ok) {
      console.error(`Expo receipts request failed with status ${response.status}`)
      return
    }
    receipts = (await response.json()).data || {}
  } catch (error) {
    console.error('Error fetching Expo push receipts:', error)
    return
  }

  const partition = partitionReceipts(
    due.map(d => ({ ticketId: d.ticketId, token: d.token, attempts: d.attempts })),
    receipts,
    MAX_RECEIPT_ATTEMPTS
  )

  if (partition.tokensToRemove.length > 0) {
    await PushToken.deleteMany({ token: { $in: partition.tokensToRemove } })
    console.log(`Removed ${partition.tokensToRemove.length} dead push tokens via receipts`)
  }

  const toDelete = [...partition.resolvedTicketIds, ...partition.expiredTicketIds]
  if (toDelete.length > 0) {
    await PushReceipt.deleteMany({ ticketId: { $in: toDelete } })
  }

  if (partition.retryTicketIds.length > 0) {
    await PushReceipt.updateMany(
      { ticketId: { $in: partition.retryTicketIds } },
      { $inc: { attempts: 1 }, $set: { checkAfter: new Date(now.getTime() + RECEIPT_RETRY_DELAY_MS) } }
    )
  }
}

async function tick(): Promise<void> {
  try {
    await mongoConnection()
    await processDueNotifications()
    await processDueReceipts()
  } catch (error) {
    console.error('Notification scheduler tick failed:', error)
  }
}

const SCHEDULER_STARTED = Symbol.for('opengrades.notificationScheduler.started')

export function startNotificationScheduler(): void {
  const globalState = globalThis as { [SCHEDULER_STARTED]?: boolean }
  if (globalState[SCHEDULER_STARTED]) return
  globalState[SCHEDULER_STARTED] = true

  setInterval(() => { void tick() }, TICK_INTERVAL_MS)
  void tick()
  console.log(`Notification scheduler started (${TICK_INTERVAL_MS / 1000}s interval)`)
}
