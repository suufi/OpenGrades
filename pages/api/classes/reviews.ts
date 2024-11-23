// @ts-nocheck
require('better-logging')(console)

import type { NextApiRequest, NextApiResponse } from 'next'
import Class from '../../../models/Class'
import ClassReview from '../../../models/ClassReview'
import mongoConnection from '../../../utils/mongoConnection'

import { z } from 'zod'
import { TimeRange } from '../../../types'

import { auth } from '@/utils/auth'

import mongoose from 'mongoose'
import AuditLog from '../../../models/AuditLog'
import Karma from '../../../models/Karma'
import User from '../../../models/User'

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
        const classes = await ClassReview.find({}).populate(['class', 'author']).lean()
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

        if (session.user && session.user?.trustLevel < 1) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        // Validate body here

        //     class: Class;
        //     author: User;
        //     approved: boolean;
        //     overallRating: number;
        //     firstYear: boolean;
        //     retaking: boolean;
        //     droppedClass: boolean;
        //     hoursPerWeek: string;
        //     recommendationLevel: number;
        //     classComments: string;

        const schema = z.object({
          class: z.string(),
          overallRating: z.number().min(1).max(7),
          firstYear: z.boolean(),
          retaking: z.boolean(),
          droppedClass: z.boolean(),
          hoursPerWeek: z.nativeEnum(TimeRange),
          recommendationLevel: z.number().min(1).max(5),
          classComments: z.string(),
          backgroundComments: z.string()
        }).partial({
          classComments: true,
          backgroundComments: true
        })

        const data = schema.parse(body)

        const author = await User.findOne({ email: session.user?.email })

        if (!(await Class.exists({ _id: data.class }))) {
          return res.status(404).json({ success: false, message: 'Class does not exist.' })
        }

        if (await ClassReview.exists({ _id: data.class, author: author._id })) {
          return res.status(409).json({ success: false, message: 'Class review already exists.' })
        }

        await ClassReview.create({
          class: new mongoose.Types.ObjectId(data.class),
          overallRating: data.overallRating,
          author: author._id,
          firstYear: data.firstYear,
          retaking: data.retaking,
          droppedClass: data.droppedClass,
          hoursPerWeek: data.hoursPerWeek,
          recommendationLevel: data.recommendationLevel,
          classComments: data.classComments,
          backgroundComments: data.backgroundComments
        })

        await AuditLog.create({
          actor: author._id,
          type: 'AddReview',
          description: `Posting a review for ${data.class}`
        })

        await Karma.create({
          actor: author._id,
          amount: 50,
          description: `Posting a review for a class - ${await Class.findOne({ id: data.class }).lean().then((c) => c?.name) || 'Unknown'}`
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
    default:
      res.status(400).json({ success: false })
      break
  }
}
