// @ts-nocheck
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import mongoConnection from '@/utils/mongoConnection'
import { auth } from '@/utils/auth'
import { withApiLogger } from '@/utils/apiLogger'
import type { NextApiRequest, NextApiResponse } from 'next'

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
    const { method } = req

    const session = await auth(req, res)
    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })
    if (!session.user || session.user?.trustLevel < 1) {
        return res.status(403).json({ success: false, message: 'Not authorized.' })
    }

    if (method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {

        const subjectNumber = req.query.subjectNumber as string

        const classes = await Class.find({ $or: [{ subjectNumber }, { aliases: { $in: [subjectNumber] } }] }).lean()
        const classIds = classes.map(c => c._id)

        const reviews = await ClassReview.find({ class: { $in: classIds } }).lean()

        return res.status(200).json({ success: true, data: { classes, reviews } })

    } catch (error) {
        console.error('Error fetching class counts:', error)
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

export default withApiLogger(handler)
