// @ts-nocheck
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'

import { auth } from '@/utils/auth'

import z from 'zod'

type Data = {
    success: boolean,
    data?: object | null,
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
                if (session.user && session.user?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                if (!(await Class.exists({ _id: req.query.classId }))) {
                    return res.status(404).json({ success: false, message: 'Class does not exist.' })
                }

                const content = await ClassReview.findById(req.query.reviewId).populate(['class', 'author']).lean()

                const upvotes = await ReviewVote.countDocuments({ classReview: content._id, vote: 1 })
                const downvotes = await ReviewVote.countDocuments({ classReview: content._id, vote: -1 })

                return res.status(200).json({ success: true, data: { ...content, upvotes, downvotes } })

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
                    display: z.boolean().optional(),
                }).required()

                const data = schema.parse(body)

                await ClassReview.updateOne({ _id: req.query.reviewId }, { $set: data })

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
