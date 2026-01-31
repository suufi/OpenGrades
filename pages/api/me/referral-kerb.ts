import User from '@/models/User'
import { auth } from '@/utils/auth'
import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '../../../utils/mongoConnection'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

export default async function handler (
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    await mongoConnection()
    const { method, body, query } = req

    const session = await auth(req, res)

    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':

            try {
                if (query.kerb === session.user.kerb) {
                    throw new Error('You cannot refer yourself.')
                }
                const exists = await User.exists({ kerb: query.kerb })
                return res.status(200).json({ success: true, data: !!exists })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            return res.status(200).json({ success: true, data: {} })
        default:
            res.status(405).json({ success: false, message: 'Method not allowed' })

    }
}