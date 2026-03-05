import ClassReview from '@/models/ClassReview'
import User from '@/models/User'
import mongoConnection from '@/utils/mongoConnection'
import { getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

async function handler(
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    await mongoConnection()
    const { method } = req

    const user = await getUserFromRequest(req, res)
    if (!user) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':
            try {
                const userDoc = await User.findOne({ email: user.email.toLowerCase() }).lean() as { _id: any } | null
                if (!userDoc) {
                    return res.status(404).json({ success: false, message: 'User not found' })
                }

                const reviews = await ClassReview.find({ author: userDoc._id })
                    .populate('class')
                    .lean()

                return res.status(200).json({ success: true, data: reviews })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        default:
            res.status(405).json({ success: false, message: 'Method not allowed' })
            break
    }
}

export default withApiLogger(handler)
