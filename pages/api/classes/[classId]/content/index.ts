// @ts-nocheck

import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '../../../../../utils/mongoConnection'

import { auth } from '@/utils/auth'
import formidable from 'formidable'
import * as Minio from 'minio'
import mongoose from 'mongoose'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import z from 'zod'
import Class from '../../../../../models/Class'
import ContentSubmission from '../../../../../models/ContentSubmission'
import User from '../../../../../models/User'

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
  const session = await auth(req, res)

  if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

  switch (method) {
    case 'GET':
      try {
        const classes = await ContentSubmission.find({ class: req.query.classId }).populate(['class', 'author']).lean()

        return res.status(200).json({ success: true, data: classes })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      return res.status(200).json({ success: true, data: {} })
    case 'POST':
      try {
        const user = await User.findOne({ email: session.user?.email }).lean()
        if (!user || user.trustLevel < 1) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        const classDoc = await Class.findById(req.query.classId).lean()
        if (!classDoc) {
          return res.status(404).json({ success: false, message: 'Class does not exist.' })
        }

        // Parse multipart form data
        const form = formidable({ multiples: false })

        const parsed = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
          form.parse(req, (err, fields, files) => {
            if (err) reject(err)
            else resolve({ fields, files })
          })
        })

        const { contentTitle, type } = parsed.fields
        const file = parsed.files.file[0]

        if (!file || Array.isArray(file)) {
          return res.status(400).json({ success: false, message: 'No file uploaded.' })
        }

        // Validate fields
        const schema = z.object({
          contentTitle: z.string(),
          type: z.enum(['Syllabus', 'Grade Calculation Spreadsheet', 'Course Schedule', 'Textbook Reading Assignments', 'Miscellaneous'])
        })
        schema.parse({ contentTitle: contentTitle[0], type: type[0] })

        // Define object path
        const ext = path.extname(file.originalFilename || '') || '.dat'
        const fileName = `${uuidv4()}${ext}`
        const objectKey = `${classDoc.subjectNumber}/${classDoc.term}/${fileName}`

        // Upload file to storage
        await minioClient.fPutObject(
          process.env.MINIO_BUCKET_NAME!,
          objectKey,
          file.filepath,
          { 'Content-Type': file.mimetype || 'application/octet-stream' }
        )

        // Save metadata to MongoDB
        const newSubmission = await ContentSubmission.create({
          class: new mongoose.Types.ObjectId(req.query.classId as string),
          author: user._id,
          // contentURL: `https://${process.env.MINIO_ENDPOINT}/${process.env.MINIO_BUCKET_NAME}/${objectKey}`,
          bucketPath: objectKey,
          contentTitle: contentTitle[0],
          type: type[0]
        })

        await AuditLog.create({
          type: 'SubmitContent',
          actor: user._id,
          description: `User ${user.kerb} (${user._id}) submitted ${type[0]} for class ${classDoc.subjectNumber} (${classDoc._id})`,
        })

        return res.status(200).json({
          success: true,
          data: {
            contentSubmissionId: newSubmission._id,
            fileKey: objectKey
          }
        })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
    case 'PUT':
      try {
        if (session.user && session.user?.trustLevel < 1) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        if (!(await Class.exists({ _id: req.query.classId }))) {
          return res.status(404).json({ success: false, message: 'Class does not exist.' })
        }

        // const schema = z.object({
        //   _id: z.string(),
        //   contentURL: z.string().trim().url({ message: 'Please provide a valid URL.' }).refine((val) => !val.includes('canvas.mit.edu'), { message: 'Canvas is not a valid website for filehosting.' }),
        //   contentTitle: z.string(),
        //   type: z.enum(['Syllabus', 'Course Description', 'Textbook Reading Assignments', 'Miscellaneous'])
        // })

        // const data = schema.parse(body)

        // const author = await User.findOne({ email: session.user?.email })

        // if (!(await ContentSubmission.exists({ class: req.query.classId, author: author._id }))) {
        //   return res.status(404).json({ success: false, message: 'Class review does not exist.' })
        // }

        // await ContentSubmission.updateOne({ _id: req.query.classId, author: author._id }, {
        //   overallRating: data.overallRating,
        //   author: author._id,
        //   firstYear: data.firstYear,
        //   retaking: data.retaking,
        //   droppedClass: data.droppedClass,
        //   hoursPerWeek: data.hoursPerWeek,
        //   recommendationLevel: data.recommendationLevel,
        //   classComments: data.classComments,
        //   numericGrade: data.numericGrade,
        //   letterGrade: data.letterGrade,
        //   methodOfGradeCalculation: data.methodOfGradeCalculation
        // })

        return res.status(200).json({
          success: true
        })
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

export const config = {
  api: {
    bodyParser: false,
  }
}
