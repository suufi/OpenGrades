// @ts-nocheck

import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '../../../../../utils/mongoConnection'

import Class from '../../../../../models/Class'
import ContentSubmission from '../../../../../models/ContentSubmission'
import User from '../../../../../models/User'

import { z } from 'zod'

import { auth } from '@/utils/auth'

import mongoose from 'mongoose'

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
        // const classExists = await Class.exists()
        console.log(body)
        console.log(typeof body)
        // console.log(session)

        if (!session.user || session.user?.trustLevel < 1) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        if (!(await Class.exists({ _id: req.query.classId }))) {
          return res.status(404).json({ success: false, message: 'Class does not exist.' })
        }

        const schema = z.object({
          contentURL: z.string().trim().url({ message: 'Please provide a valid URL.' }).refine((val) => !val.includes('canvas.mit.edu'), { message: 'Canvas is not a valid website for filehosting.' }),
          contentTitle: z.string(),
          type: z.enum(['Syllabus', 'Grade Calculation Spreadsheet', 'Course Schedule', 'Textbook Reading Assignments', 'Miscellaneous'])
        }).required()

        const data = schema.parse(body)

        const author = await User.findOne({ email: session.user?.email })

        await ContentSubmission.create({
          class: new mongoose.Types.ObjectId(req.query.classId as string),
          author: author._id,
          contentURL: data.contentURL,
          contentTitle: data.contentTitle,
          type: data.type
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
