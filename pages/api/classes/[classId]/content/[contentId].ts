// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '../../../../../utils/mongoConnection'

import * as Minio from 'minio'
import Class from '../../../../../models/Class'
import ContentSubmission from '../../../../../models/ContentSubmission'

import { auth } from '@/utils/auth'

import z from 'zod'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    region: process.env.MINIO_REGION,
    accessKey: process.env.MINIO_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_ACCESS_KEY,
})


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
                if (session.user?.trustLevel < 1) {
                    return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
                }

                if (!(await Class.exists({ _id: req.query.classId }))) {
                    return res.status(404).json({ success: false, message: 'Class does not exist.' })
                }

                const content = await ContentSubmission.findById(req.query.contentId).populate(['class', 'author']).lean()
                if (!content) {
                    return res.status(404).json({ success: false, message: 'Content not found.' })
                }

                if (content.bucketPath) {
                    const key = content.bucketPath
                    try {
                        const signedUrl = await minioClient.presignedGetObject(process.env.MINIO_BUCKET_NAME!, key, 60 * 2) // URL valid for 2 minutes
                        content.signedURL = signedUrl
                    } catch (err) {
                        console.error('Error generating signed URL:', err)
                        content.signedURL = null
                    }
                } else if (content.contentURL) {
                    content.signedURL = content.contentURL
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
