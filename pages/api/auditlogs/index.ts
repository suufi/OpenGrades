import { auth } from '@/utils/auth'
import type { NextApiRequest, NextApiResponse } from 'next'
import AuditLog from '../../../models/AuditLog'
import User from '../../../models/User'
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
    const { method, body } = req

    const session = await auth(req, res)

    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':
            try {
                if (!session.user || session.user?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                if (session.user?.email) {
                    const reports = await AuditLog.find({}).populate('actor').lean()
                    return res.status(200).json({ success: true, data: { reports } })
                } else {
                    throw new Error("User doesn't have email.")
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'POST':
            try {
                if (await User.exists({ email: session.user?.email?.toLowerCase() })) {
                    const author = await User.findOne({ email: session.user?.email })

                    if (!session.user || session.user?.trustLevel < 2) {
                        return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                    }
                    if (!body.description || !body.type) {
                        return res.status(400).json({ success: false, message: 'Missing required fields.' })
                    }

                    const log = await AuditLog.create({
                        actor: author,
                        description: body.description,
                        type: body.type
                    })

                    return res.status(200).json({ success: true, data: log })

                } else {
                    throw new Error("User doesn't have ID.")
                }
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
