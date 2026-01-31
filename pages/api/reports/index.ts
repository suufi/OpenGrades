import { auth } from '@/utils/auth'

import type { NextApiRequest, NextApiResponse } from 'next'
import Report from '../../../models/Report'
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

                if (session.user?.id) {
                    // const user = await User.findOne({ sub: session.user.id }).lean()

                    return res.status(200).json({ success: true, data: { reports: await Report.find({}).populate('reporter contentId classReview').lean() } })
                } else {
                    throw new Error("User doesn't have ID.")
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'POST':
            try {
                if (await User.exists({ email: session.user?.id.toLowerCase() })) {
                    const author = await User.findOne({ email: session.user?.email })

                    if (!session.user || session.user?.trustLevel < 1) {
                        return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                    }

                    if ((!body.contentSubmission && !body.classReview) || !body.reason) {
                        return res.status(400).json({ success: false, message: 'Missing required fields.' })
                    }

                    console.log("body", body)


                    const report = await Report.create(body.contentSubmission ? {
                        reporter: author._id,
                        contentSubmission: body.contentSubmission,
                        reason: body.reason,
                    } : {
                        reporter: author._id,
                        classReview: body.classReview,
                        reason: body.reason,
                    })

                    return res.status(200).json({ success: true, data: report })

                } else {
                    throw new Error("User doesn't have ID.")
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'DELETE':
            try {
                if (!session.user || session.user?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                if (await User.exists({ email: session.user?.id.toLowerCase() })) {
                    const report = await Report.findByIdAndUpdate(body.reportId, {
                        resolved: true,
                        outcome: body.outcome
                    })

                    return res.status(200).json({ success: true, data: report })
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
            res.status(400).json({ success: false })
            break
    }
}
