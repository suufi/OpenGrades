// @ts-nocheck
import { auth } from '@/utils/auth'
import { withApiLogger } from '@/utils/apiLogger'

import type { NextApiRequest, NextApiResponse } from 'next'
import Class from '../../../../models/Class'
import mongoConnection from '../../../../utils/mongoConnection'

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

  switch (method) {
    case 'GET':
      try {
        const classes = await Class.findById(req.query.classId).lean()
        if (!classes) {
          return res.status(404).json({ success: false, message: 'Class not found' })
        }
        return res.status(200).json({ success: true, data: classes })
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
