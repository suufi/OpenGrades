
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

import { z } from 'zod'

import { auth } from '@/utils/auth'

import AuditLog from '@/models/AuditLog'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import Karma from '@/models/Karma'
import User from '@/models/User'

import mongoose from 'mongoose'

type Data = {
  success: boolean,
  data?: object,
  message?: string
}

enum TimeRange {
  '0-2 hours' = '0-2 hours',
  '3-5 hours' = '3-5 hours',
  '6-8 hours' = '6-8 hours',
  '9-11 hours' = '9-11 hours',
  '12-14 hours' = '12-14 hours',
  '15-17 hours' = '15-17 hours',
  '18-20 hours' = '18-20 hours',
  '21-23 hours' = '21-23 hours',
  '24-26 hours' = '24-26 hours',
  '37-40 hours' = '37-40 hours'
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
        if (session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }
        const classes = await ClassReview.find({ class: req.query.classId }).populate(['class', 'author']).lean()
        return res.status(200).json({ success: true, data: classes })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      return res.status(200).json({ success: true, data: {} })
    case 'POST':
      try {
        // const classExists = await Class.exists()
        console.log(body)
        console.log(typeof body)
        console.log(session)

        const user = await User.findOne({ email: session.user?.email }).lean()

        if (session.user && user.trustLevel < 1) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        const reviewedClass = await Class.findOne({ _id: req.query.classId }).lean()
        if (!reviewedClass) {
          return res.status(404).json({ success: false, message: 'Class does not exist.' })
        }

        const schema = z.object({
          overallRating: z.number().min(1).max(7),
          firstYear: z.boolean(),
          retaking: z.boolean(),
          droppedClass: z.boolean(),
          hoursPerWeek: z.nativeEnum(TimeRange),
          recommendationLevel: z.number().min(1).max(5),
          classComments: z.string(),
          backgroundComments: z.string(),
          numericGrade: z.number().min(0).max(100).nullable(),
          letterGrade: z.enum(['A', 'B', 'C', 'D', 'F', 'P', 'DR']),
          methodOfGradeCalculation: z.enum(['Canvas', 'MIT OpenGrades Spreadsheet', 'Self', 'Other']).nullable()
        })

        const data = schema.parse(body)

        const author = await User.findOne({ email: session.user?.email })
        if (!reviewedClass.units.includes('P/D/F') && data.letterGrade === 'P') {
          return res.status(400).json({ success: false, message: 'You cannot give a P grade to a class that is not P/D/F.' })
        }
        if (await ClassReview.exists({ class: req.query.classId, author: author._id })) {
          return res.status(409).json({ success: false, message: 'Class review already exists.' })
        }

        if (!author.classesTaken.includes(req.query.classId as string)) {
          await User.findByIdAndUpdate(author._id, {
            $push: {
              classesTaken: new mongoose.Types.ObjectId(req.query.classId as string)
            }
          })
        }

        await ClassReview.create({
          class: new mongoose.Types.ObjectId(req.query.classId as string),
          overallRating: data.overallRating,
          author: author._id,
          firstYear: data.firstYear,
          retaking: data.retaking,
          droppedClass: data.droppedClass,
          hoursPerWeek: data.hoursPerWeek,
          recommendationLevel: data.recommendationLevel,
          classComments: data.classComments,
          backgroundComments: data.backgroundComments,
          numericGrade: data.numericGrade,
          letterGrade: data.letterGrade,
          methodOfGradeCalculation: data.methodOfGradeCalculation
        })

        await AuditLog.create({
          actor: author._id,
          type: 'AddReview',
          description: `Posting a review for ${req.query.classId}`
        })

        await Karma.create({
          actor: author._id,
          amount: 50,
          description: `Posting a review for a class - ${(await Class.findById(req.query.classId).lean().then((c) => c && !Array.isArray(c) ? c.subjectTitle : 'Unknown'))}`
        })

        return res.status(200).json({
          success: true
        })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'PUT':
      try {
        const user = await User.findOne({ email: session.user?.email }).lean()

        if (session.user && user.trustLevel < 1) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        const reviewedClass = await Class.findOne({ _id: req.query.classId }).lean()
        if (!reviewedClass) {
          return res.status(404).json({ success: false, message: 'Class does not exist.' })
        }

        const schema = z.object({
          overallRating: z.number().min(1).max(7),
          firstYear: z.boolean(),
          retaking: z.boolean(),
          droppedClass: z.boolean(),
          hoursPerWeek: z.nativeEnum(TimeRange),
          recommendationLevel: z.number().min(1).max(5),
          classComments: z.string(),
          backgroundComments: z.string(),
          numericGrade: z.number().min(0).max(100).nullable(),
          letterGrade: z.enum(['A', 'B', 'C', 'D', 'F', 'P', 'DR']),
          methodOfGradeCalculation: z.enum(['Canvas', 'MIT OpenGrades Spreadsheet', 'Self', 'Other']).nullable()
        })

        const data = schema.parse(body)

        const author = await User.findOne({ email: session.user?.email })
        const existingReview = await ClassReview.findOne({ class: req.query.classId, author: author._id }).lean()
        if (!existingReview) {
          return res.status(404).json({ success: false, message: 'Class review does not exist.' })
        }

        if (!reviewedClass.units.includes('P/D/F') && data.letterGrade === 'P') {
          return res.status(400).json({ success: false, message: 'You cannot give a P grade to a class that is not P/D/F.' })
        }

        let changes = {
          overallRating: data.overallRating,
          firstYear: data.firstYear,
          retaking: data.retaking,
          droppedClass: data.droppedClass,
          hoursPerWeek: data.hoursPerWeek,
          recommendationLevel: data.recommendationLevel,
          classComments: data.classComments,
          backgroundComments: data.backgroundComments,
          numericGrade: data.numericGrade,
          letterGrade: data.letterGrade,
          methodOfGradeCalculation: data.methodOfGradeCalculation,
          partial: false
        }

        if (existingReview.partial && !existingReview.display) {
          changes.display = true
        }

        await ClassReview.updateOne({ class: req.query.classId, author: author._id }, changes)
        await AuditLog.create({
          actor: author._id,
          type: 'EditReview',
          description: existingReview.partial ? `Editing a partial review for ${req.query.classId}` : `Editing a review for ${req.query.classId}`
        })

        return res.status(200).json({
          success: true
        })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'DELETE':
      try {
        if (session.user && session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        if (!(await Class.exists({ _id: req.query.classId }))) {
          return res.status(404).json({ success: false, message: 'Class does not exist.' })
        }




      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
    default:
      res.status(400).json({ success: false })
      break
  }
}
