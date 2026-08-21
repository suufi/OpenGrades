import type { NextApiResponse } from 'next'
import { AuthenticatedRequest, getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import ScheduledNotification from '@/models/ScheduledNotification'
import User from '@/models/User'
import { z } from 'zod'
import { sendPushNotification } from '@/utils/sendPushNotification'
import type { NotificationCategory } from '@/types'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  await mongoConnection()

  const user = await getUserFromRequest(req, res)
  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' })
  }

  // Admin check (trustLevel >= 2)
  const userDoc = await User.findOne({ email: user.email?.toLowerCase() }).select('trustLevel _id').lean()
  if (!userDoc || (userDoc.trustLevel ?? 0) < 2) {
    return res.status(403).json({ success: false, message: 'Admin access required.' })
  }

  switch (req.method) {
    case 'GET': {
      const page = parseInt(req.query.page as string) || 1
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
      const skip = (page - 1) * limit

      const [notifications, total] = await Promise.all([
        ScheduledNotification.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('createdBy', 'name kerb')
          .lean(),
        ScheduledNotification.countDocuments()
      ])

      return res.status(200).json({
        success: true,
        data: notifications,
        meta: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total
        }
      })
    }

    case 'POST': {
      const schema = z.object({
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(1000),
        category: z.enum(['feature_updates', 'catalog_updates', 'pe_updates', 'academic_calendar']),
        scheduledAt: z.string().nullable().optional(),
        data: z.record(z.string(), z.unknown()).optional().refine(
          d => d === undefined || d.targetPath === undefined ||
            (typeof d.targetPath === 'string' && d.targetPath.startsWith('/')),
          { message: 'data.targetPath must be a string starting with "/"' }
        ),
      })

      const parsed = schema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: 'Invalid request body.', errors: parsed.error.issues })
      }

      const { title, body, category, data } = parsed.data
      const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null
      const isImmediate = !scheduledAt || scheduledAt.getTime() <= Date.now()

      const notification = await ScheduledNotification.create({
        title,
        body,
        category,
        data: data || null,
        scheduledAt,
        status: 'pending',
        createdBy: userDoc._id,
      })

      if (isImmediate) {
        try {
          const result = await sendPushNotification({
            title,
            body,
            category: category as NotificationCategory,
            data,
            notificationId: notification._id.toString(),
          })
          return res.status(200).json({
            success: true,
            message: `Notification sent to ${result.sent} devices.`,
            data: { ...notification.toObject(), recipientCount: result.sent, status: 'sent', sentAt: new Date() }
          })
        } catch (error) {
          await ScheduledNotification.findByIdAndUpdate(notification._id, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          })
          return res.status(500).json({ success: false, message: 'Failed to send notification.' })
        }
      } else {
        // The polling scheduler (utils/notificationScheduler.ts) picks this up
        return res.status(201).json({
          success: true,
          message: `Notification scheduled for ${scheduledAt!.toISOString()}.`,
          data: notification
        })
      }
    }

    default:
      return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }
}

export default withApiLogger(handler)
