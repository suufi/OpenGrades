// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '../../../utils/mongoConnection'

import { auth } from '@/utils/auth'

import User from '../../../models/User'
export default async function handler (
    req: NextApiRequest,
    res: NextApiResponse
) {
    await mongoConnection()
    const { method, body } = req

    const session = await auth(req, res)
    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':
            try {
                if (session.user?.id) {
                    const user = await User.findOne({ email: session.user.id.toLowerCase() }).populate('classesTaken').lean()

                    return res.status(200).json({ success: true, data: { flags: user.flags } })
                } else {
                    throw new Error("User doesn't have ID.")
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'PATCH':
            try {
                if (await User.exists({ email: session.user?.id })) {

                    await User.findOneAndUpdate({ email: session.user?.id }, {
                        flags: body.flags
                    })

                    return res.status(200).json({ success: true, data: await User.findOne({ email: session.user?.id }).populate('classesTaken').lean() })
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