// @ts-nocheck

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
  '37-30 hours' = '37-30 hours'
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

        if (!(await Class.exists({ _id: req.query.classId }))) {
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
          letterGrade: z.enum(['A', 'B', 'C', 'D', 'F', 'P']),
          methodOfGradeCalculation: z.enum(['Canvas', 'MIT OpenGrades Spreadsheet', 'Self', 'Other']).nullable()
        })

        const data = schema.parse(body)

        const author = await User.findOne({ email: session.user?.email })

        if (await ClassReview.exists({ class: req.query.classId, author: author._id })) {
          return res.status(409).json({ success: false, message: 'Class review already exists.' })
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
        if (session.user && session.user?.trustLevel < 1) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        if (!(await Class.exists({ _id: req.query.classId }))) {
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
          letterGrade: z.enum(['A', 'B', 'C', 'D', 'F', 'P']),
          methodOfGradeCalculation: z.enum(['Canvas', 'MIT OpenGrades Spreadsheet', 'Self', 'Other']).nullable()
        })

        const data = schema.parse(body)

        const author = await User.findOne({ email: session.user?.email })

        if (!(await ClassReview.exists({ class: req.query.classId, author: author._id }))) {
          return res.status(404).json({ success: false, message: 'Class review does not exist.' })
        }

        await ClassReview.updateOne({ class: req.query.classId, author: author._id }, {
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
          methodOfGradeCalculation: data.methodOfGradeCalculation
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
