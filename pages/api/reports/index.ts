import { withApiLogger } from '@/utils/apiLogger'
import { getUserFromRequest } from '@/utils/authMiddleware'

import type { NextApiRequest, NextApiResponse } from 'next'
import Report from '../../../models/Report'
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

                return res.status(200).json({ success: true, data: { reports: await Report.find({}).populate('reporter contentId classReview').lean() } })
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
                if (requestUser?.trustLevel < 1) {
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
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'DELETE':
            try {
                if (requestUser?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                const report = await Report.findByIdAndUpdate(body.reportId, {
                    resolved: true,
                    outcome: body.outcome
                })

                return res.status(200).json({ success: true, data: report })
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
