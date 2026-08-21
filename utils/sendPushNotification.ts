import PushToken from '@/models/PushToken'
import PushReceipt from '@/models/PushReceipt'
import User from '@/models/User'
import ScheduledNotification from '@/models/ScheduledNotification'
import mongoConnection from '@/utils/mongoConnection'
import type { NotificationCategory } from '@/types'
import { decodeHtmlEntities } from '@/utils/htmlEntities'
import {
  backoffMs,
  chunk,
  expoRequestHeaders,
  isRetryableHttpStatus,
  partitionTickets,
  type ExpoPushTicket,
} from '@/utils/expoPushHelpers'

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default' | null
  badge?: number
  channelId?: string
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100
const MAX_SEND_ATTEMPTS = 3
// Expo recommends checking receipts ~15 minutes after sending
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getEligibleTokens(category: NotificationCategory): Promise<string[]> {
  await mongoConnection()

  const prefKey = `notificationPreferences.${category}`

  const eligibleUsers = await User.find({
    $or: [
      { [prefKey]: true },
      { [prefKey]: { $exists: false } }
    ]
  }).select('_id').lean()

  const userIds = eligibleUsers.map(u => u._id)

  const pushTokenDocs = await PushToken.find({
    user: { $in: userIds }
  }).select('token').lean()

  return pushTokenDocs.map(doc => doc.token)
}

async function sendBatchWithRetry(batch: ExpoPushMessage[]): Promise<ExpoPushTicket[] | null> {
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: expoRequestHeaders(process.env.EXPO_ACCESS_TOKEN),
        body: JSON.stringify(batch),
      })

      if (!response.ok) {
        if (isRetryableHttpStatus(response.status) && attempt < MAX_SEND_ATTEMPTS) {
          await sleep(backoffMs(attempt))
          continue
        }
        console.error(`Expo push request failed with status ${response.status}`)
        return null
      }

      const result = await response.json()
      return (result.data || []) as ExpoPushTicket[]
    } catch (error) {
      if (attempt < MAX_SEND_ATTEMPTS) {
        await sleep(backoffMs(attempt))
        continue
      }
      console.error('Error sending batch to Expo Push API:', error)
      return null
    }
  }
  return null
}

async function sendToExpo(messages: ExpoPushMessage[]): Promise<{ sent: number }> {
  let totalSent = 0
  const invalidTokens: string[] = []
  const okTickets: { ticketId: string; token: string }[] = []

  for (const batch of chunk(messages, BATCH_SIZE)) {
    const tickets = await sendBatchWithRetry(batch)
    if (!tickets) continue

    const partition = partitionTickets(batch.map(m => m.to), tickets)
    totalSent += partition.sent
    invalidTokens.push(...partition.invalidTokens)
    okTickets.push(...partition.okTickets)
  }

  if (invalidTokens.length > 0) {
    await PushToken.deleteMany({ token: { $in: invalidTokens } })
    console.log(`Removed ${invalidTokens.length} invalid push tokens`)
  }

  if (okTickets.length > 0) {
    const checkAfter = new Date(Date.now() + RECEIPT_CHECK_DELAY_MS)
    try {
      await PushReceipt.insertMany(
        okTickets.map(t => ({ ticketId: t.ticketId, token: t.token, checkAfter, attempts: 0 })),
        { ordered: false }
      )
    } catch (error) {
      console.error('Error recording push receipts:', error)
    }
  }

  return { sent: totalSent }
}

export async function sendPushNotification(params: {
  title: string
  body: string
  category: NotificationCategory
  data?: Record<string, unknown>
  notificationId?: string
}): Promise<{ sent: number; total: number }> {
  const tokens = await getEligibleTokens(params.category)

  if (tokens.length === 0) {
    console.log(`No eligible tokens for category: ${params.category}`)
    if (params.notificationId) {
      await ScheduledNotification.findByIdAndUpdate(params.notificationId, {
        status: 'sent',
        sentAt: new Date(),
        recipientCount: 0
      })
    }
    return { sent: 0, total: 0 }
  }

  const title = decodeHtmlEntities(params.title)
  const body = decodeHtmlEntities(params.body)

  const messages: ExpoPushMessage[] = tokens.map(token => ({
    to: token,
    title,
    body,
    data: params.data || {},
    sound: 'default' as const,
    channelId: 'default',
  }))

  const { sent } = await sendToExpo(messages)

  if (params.notificationId) {
    await ScheduledNotification.findByIdAndUpdate(params.notificationId, {
      status: 'sent',
      sentAt: new Date(),
      recipientCount: sent
    })
  }

  console.log(`Push notification sent: ${sent}/${tokens.length} for category ${params.category}`)
  return { sent, total: tokens.length }
}
