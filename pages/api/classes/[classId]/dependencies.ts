// @ts-nocheck
import { getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'

import type { NextApiRequest, NextApiResponse } from 'next'
import Class from '../../../../models/Class'
import mongoConnection from '../../../../utils/mongoConnection'
import { getPrerequisiteGraph } from '../../../../utils/prerequisiteGraph'
import mongoose from 'mongoose'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

async function handler(
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    await mongoConnection()
    const { method } = req
    const user = await getUserFromRequest(req, res)

    if (!user) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'GET':
            try {
                let { classId } = req.query

                if (!classId || Array.isArray(classId)) {
                    return res.status(400).json({ success: false, message: 'Invalid class ID' })
                }

                // Resolve subjectNumber to _id if necessary
                if (!mongoose.Types.ObjectId.isValid(classId)) {
                    const cls = await Class.findOne({ subjectNumber: classId }).select('_id').lean();
                    if (cls) {
                        classId = cls._id.toString();
                    } else {
                        return res.status(404).json({ success: false, message: 'Class not found' })
                    }
                }

                const graphData = await getPrerequisiteGraph(classId as string)

                return res.status(200).json({ success: true, data: graphData })
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
