// @ts-nocheck

import { withApiLogger } from '@/utils/apiLogger'
import { getUserFromRequest } from '@/utils/authMiddleware'
import type { NextApiRequest, NextApiResponse } from 'next'
import AuditLog from '../../../models/AuditLog'
import User from '../../../models/User'
import mongoConnection from '../../../utils/mongoConnection'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

async function handler (
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    await mongoConnection()
    const { method, body } = req

    const requestUser = await getUserFromRequest(req, res)
    if (!requestUser) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':
            try {
                if (requestUser?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                const reports = await AuditLog.find({}).populate('actor').lean()
                return res.status(200).json({ success: true, data: { reports } })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'POST':
            try {
                const author = await User.findOne({ email: requestUser?.email })
                if (!author) throw new Error("User doesn't have ID.")

                if (requestUser?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }
                console.log("body", body)
                if (!body.description || !body.type) {
                    return res.status(400).json({ success: false, message: 'Missing required fields.' })
                }

                const log = await AuditLog.create({
                    actor: author,
                    description: body.description,
                    type: body.type
                })

                return res.status(200).json({ success: true, data: log })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        default:
            res.status(400).json({ success: false })
            break
    }
}

export default withApiLogger(handler)
