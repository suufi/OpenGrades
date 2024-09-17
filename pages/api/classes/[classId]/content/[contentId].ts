// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '../../../../../utils/mongoConnection'

import Class from '../../../../../models/Class'
import ContentSubmission from '../../../../../models/ContentSubmission'

import { auth } from '@/utils/auth'

import z from 'zod'

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
    // const session = await getServerSession(req, res, authOptions)
    const session = await auth(req, res)

    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':
            try {
                if (session.user && session.user?.trustLevel < 1) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                if (!(await Class.exists({ _id: req.query.classId }))) {
                    return res.status(404).json({ success: false, message: 'Class does not exist.' })
                }

                const content = await ContentSubmission.findById(req.query.contentId).populate(['class', 'author']).lean()
                if (!content) {
                    return res.status(404).json({ success: false, message: 'Content not found.' })
                }
                return res.status(200).json({ success: true, data: content })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
        case 'PUT':
            try {
                if (session.user && session.user?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                if (!(await Class.exists({ _id: req.query.classId }))) {
                    return res.status(404).json({ success: false, message: 'Class does not exist.' })
                }

                const schema = z.object({
                    approved: z.boolean().optional(),
                    type: z.enum(['Syllabus', 'Grade Calculation Spreadsheet', 'Course Schedule', 'Textbook Reading Assignments', 'Miscellaneous']).optional(),
                    contentTitle: z.string().optional(),
                    contentURL: z.string().trim().url({ message: 'Please provide a valid URL.' }).refine((val) => !val.includes('canvas.mit.edu'), { message: 'Canvas is not a valid website for filehosting.' }).optional(),
                }).refine((obj) => {
                    for (const val of Object.values(obj)) {
                        if (val !== undefined) return true
                    }
                    return false
                }, {
                    message: "Object must have at least one property defined"
                })

                const data = schema.parse(body)

                await ContentSubmission.updateOne({ _id: req.query.contentId }, { $set: data })

                return res.status(200).json({ success: true, message: 'Content updated.' })

            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }

        default:
            return res.status(400).json({ success: false, message: 'Invalid method.' })

    }
}
