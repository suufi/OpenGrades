import type { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import User from '@/models/User'

const VALID_KEYS = ['feature_updates', 'catalog_updates', 'pe_updates', 'academic_calendar'] as const

const DEFAULT_PREFERENCES = {
  feature_updates: true,
  catalog_updates: true,
  pe_updates: true,
  academic_calendar: true,
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  await mongoConnection()

  const user = req.user
  if (!user?.email) {
    return res.status(401).json({ success: false, message: 'Authentication required.' })
  }

  const email = user.email.toLowerCase()

  switch (req.method) {
    case 'GET': {
      const userDoc = await User.findOne({ email }).select('notificationPreferences').lean()
      const prefs = userDoc?.notificationPreferences || DEFAULT_PREFERENCES

      return res.status(200).json({
        success: true,
        data: {
          feature_updates: prefs.feature_updates ?? true,
          catalog_updates: prefs.catalog_updates ?? true,
          pe_updates: prefs.pe_updates ?? true,
          academic_calendar: prefs.academic_calendar ?? true,
        }
      })
    }

    case 'PATCH': {
      const updates: Record<string, boolean> = {}
      for (const key of VALID_KEYS) {
        if (typeof req.body[key] === 'boolean') {
          updates[`notificationPreferences.${key}`] = req.body[key]
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid preferences provided.' })
      }

      const updated = await User.findOneAndUpdate(
        { email },
        { $set: updates },
        { new: true }
      ).select('notificationPreferences').lean()

      const prefs = updated?.notificationPreferences || DEFAULT_PREFERENCES

      return res.status(200).json({
        success: true,
        data: {
          feature_updates: prefs.feature_updates ?? true,
          catalog_updates: prefs.catalog_updates ?? true,
          pe_updates: prefs.pe_updates ?? true,
          academic_calendar: prefs.academic_calendar ?? true,
        }
      })
    }

    default:
      return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }
}

export default withApiLogger(withAuth(handler))
