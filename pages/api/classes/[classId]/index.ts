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
        const classDoc = await Class.findById(req.query.classId).lean()
        if (!classDoc) {
          return res.status(404).json({ success: false, message: 'Class not found' })
        }
        const userCount = await ClassReview.countDocuments({ class: classDoc._id })
        return res.status(200).json({ success: true, data: { ...classDoc, userCount } })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'PATCH':
      try {
        if (user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }
        const classId = req.query.classId
        if (!classId || typeof classId !== 'string') {
          return res.status(400).json({ success: false, message: 'Invalid class ID' })
        }
        const body = req.body || {}
        const update: Record<string, unknown> = {}
        if (Array.isArray(body.instructors)) {
          update.instructors = body.instructors.filter((s: unknown) => typeof s === 'string' && s.trim())
        }
        if (typeof body.description === 'string') {
          update.description = body.description
        }
        if (Array.isArray(body.aliases)) {
          update.aliases = body.aliases.filter((s: unknown) => typeof s === 'string' && s.trim())
        }
        if (typeof body.subjectTitle === 'string') {
          update.subjectTitle = body.subjectTitle.trim()
        }
        if (typeof body.display === 'boolean') {
          update.display = body.display
        }
        if (Object.keys(update).length === 0) {
          return res.status(400).json({ success: false, message: 'No valid fields to update' })
        }
        const updated = await Class.findByIdAndUpdate(
          classId,
          { $set: update },
          { new: true, runValidators: true }
        ).lean()
        if (!updated) {
          return res.status(404).json({ success: false, message: 'Class not found' })
        }
        return res.status(200).json({ success: true, data: updated })
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
