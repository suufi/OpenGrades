import type { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import User from '@/models/User'
import ScheduledNotification from '@/models/ScheduledNotification'

const CATEGORIES = ['feature_updates', 'catalog_updates', 'pe_updates', 'academic_calendar'] as const

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }

  await mongoConnection()

  const user = req.user
  if (!user?.email) {
    return res.status(401).json({ success: false, message: 'Authentication required.' })
  }

  const userDoc = await User.findOne({ email: user.email.toLowerCase() })
    .select('notificationPreferences')
    .lean()
  const prefs = userDoc?.notificationPreferences as Partial<Record<typeof CATEGORIES[number], boolean>> | undefined
  const enabledCategories = CATEGORIES.filter(category => prefs?.[category] !== false)

  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
  const skip = (page - 1) * limit

  const filter = { status: 'sent', category: { $in: enabledCategories } }

  const [notifications, total] = await Promise.all([
    ScheduledNotification.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title body category sentAt data')
      .lean(),
    ScheduledNotification.countDocuments(filter)
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

export default withApiLogger(withAuth(handler))
