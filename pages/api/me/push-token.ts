import type { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import PushToken from '@/models/PushToken'
import { z } from 'zod'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  await mongoConnection()

  const user = req.user
  if (!user?._id && !user?.email) {
    return res.status(401).json({ success: false, message: 'Authentication required.' })
  }

  let userId = user._id
  if (!userId && user.email) {
    const User = (await import('@/models/User')).default
    const userDoc = await User.findOne({ email: user.email }).select('_id').lean()
    if (!userDoc) return res.status(404).json({ success: false, message: 'User not found.' })
    userId = userDoc._id
  }

  switch (req.method) {
    case 'POST': {
      const schema = z.object({
        token: z.string().min(1),
        platform: z.enum(['ios', 'android']),
      })

      const parsed = schema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: 'Invalid request body.', errors: parsed.error.issues })
      }

      const { token, platform } = parsed.data

      await PushToken.findOneAndUpdate(
        { token },
        { user: userId, token, platform },
        { upsert: true, new: true }
      )

      return res.status(200).json({ success: true, message: 'Push token registered.' })
    }

    case 'DELETE': {
      const { token } = req.body || {}
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required.' })
      }

      await PushToken.deleteOne({ token, user: userId })
      return res.status(200).json({ success: true, message: 'Push token removed.' })
    }

    default:
      return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }
}

export default withApiLogger(withAuth(handler))
