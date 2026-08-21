import type { NextApiResponse } from 'next'
import { AuthenticatedRequest, getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import ScheduledNotification from '@/models/ScheduledNotification'
import User from '@/models/User'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  await mongoConnection()

  const user = await getUserFromRequest(req, res)
  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' })
  }

  const userDoc = await User.findOne({ email: user.email?.toLowerCase() }).select('trustLevel').lean()
  if (!userDoc || (userDoc.trustLevel ?? 0) < 2) {
    return res.status(403).json({ success: false, message: 'Admin access required.' })
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, message: 'Notification ID required.' })
  }

  switch (req.method) {
    case 'DELETE': {
      // Atomic: only cancels while still pending, so it can't race the scheduler's claim
      const cancelled = await ScheduledNotification.findOneAndUpdate(
        { _id: id, status: 'pending' },
        { $set: { status: 'cancelled' } },
        { new: true }
      )

      if (!cancelled) {
        const existing = await ScheduledNotification.findById(id).lean()
        if (!existing) {
          return res.status(404).json({ success: false, message: 'Notification not found.' })
        }
        return res.status(400).json({ success: false, message: `Cannot cancel notification with status: ${existing.status}` })
      }

      return res.status(200).json({ success: true, message: 'Notification cancelled.', data: cancelled })
    }

    default:
      return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }
}

export default withApiLogger(handler)
