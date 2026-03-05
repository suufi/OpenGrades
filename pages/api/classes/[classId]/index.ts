// @ts-nocheck
import { getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'

import type { NextApiRequest, NextApiResponse } from 'next'
import mongoose from 'mongoose'
import Class from '../../../../models/Class'
import mongoConnection from '../../../../utils/mongoConnection'
import ClassReview from '@/models/ClassReview'

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
        const classes = await Class.findById(req.query.classId).lean()
        const userCount = await ClassReview.countDocuments({ class: classes._id })
        if (!classes) {
          return res.status(404).json({ success: false, message: 'Class not found' })
        }
        return res.status(200).json({ success: true, data: { ...classes, userCount } })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'DELETE':
      try {
        if (user && user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        await Class.findByIdAndDelete(req.query.classId)

        return res.status(200).json({ success: true, message: 'Class was deleted.' })
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
