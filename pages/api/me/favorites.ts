import { getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import User from '../../../models/User'
import mongoConnection from '../../../utils/mongoConnection'

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
    const { method, body } = req

    const user = await getUserFromRequest(req, res)
    if (!user) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':
            try {
                const userDoc = await User.findOne({ email: user.email.toLowerCase() }).lean()
                return res.status(200).json({
                    success: true,
                    data: { favorites: userDoc?.favoriteClasses || [] }
                })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break

        case 'POST':
            try {
                const schema = z.object({
                    subjectNumber: z.string().min(1)
                })
                const { subjectNumber } = schema.parse(body)

                await User.updateOne(
                    { email: user.email.toLowerCase() },
                    { $addToSet: { favoriteClasses: subjectNumber } }
                )

                const updatedUser = await User.findOne({ email: user.email.toLowerCase() }).lean()
                return res.status(200).json({
                    success: true,
                    data: { favorites: updatedUser?.favoriteClasses || [] }
                })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break

        case 'DELETE':
            try {
                const schema = z.object({
                    subjectNumber: z.string().min(1)
                })
                const { subjectNumber } = schema.parse(body)

                await User.updateOne(
                    { email: user.email.toLowerCase() },
                    { $pull: { favoriteClasses: subjectNumber } }
                )

                const updatedUser = await User.findOne({ email: user.email.toLowerCase() }).lean()
                return res.status(200).json({
                    success: true,
                    data: { favorites: updatedUser?.favoriteClasses || [] }
                })
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
