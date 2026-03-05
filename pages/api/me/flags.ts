// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '../../../utils/mongoConnection'

import { getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'

import User from '../../../models/User'

async function handler (
    req: NextApiRequest,
    res: NextApiResponse
) {
    await mongoConnection()
    const { method, body } = req

    const requestUser = await getUserFromRequest(req, res)
    if (!requestUser?.email) return res.status(403).json({ success: false, message: 'Please sign in.' })
    const email = requestUser.email.toLowerCase()

    switch (method) {
        case 'GET':
            try {
                const user = await User.findOne({ email }).populate('classesTaken').lean()

                return res.status(200).json({ success: true, data: { flags: user.flags } })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'PATCH':
            try {
                if (await User.exists({ email })) {

                    await User.findOneAndUpdate({ email }, {
                        flags: body.flags
                    })

                    return res.status(200).json({ success: true, data: await User.findOne({ email }).populate('classesTaken').lean() })
                } else {
                    throw new Error('User does not exist.')
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        default:
            return res.status(405).json({ success: false, message: 'Method not allowed.' })
    }
}

export default withApiLogger(handler)