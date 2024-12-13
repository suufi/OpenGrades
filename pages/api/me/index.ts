// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import User from '../../../models/User'
import { IdentityFlags } from '../../../types'
import mongoConnection from '../../../utils/mongoConnection'

import { auth } from '@/utils/auth'
import { z } from 'zod'

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
        if (session.user?.id) {
          const user = await User.findOne({ email: session.user.id.toLowerCase() }).populate('classesTaken').lean()

          return res.status(200).json({ success: true, data: { session, user } })
        } else {
          throw new Error("User doesn't have ID.")
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'PUT':
      try {
        if (await User.exists({ email: session.user?.id.toLowerCase() })) {
          const schema = z.object({
            kerb: z.string(),
            name: z.string(),
            classOf: z.number(),
            affiliation: z.string(),
            identityFlags: z.array(z.nativeEnum(IdentityFlags)),
            flatClasses: z.array(z.string())
          }).partial({
            identityFlags: true,
            flatClasses: true
          })

          const data = schema.parse(body)

          await User.findOneAndUpdate({ email: session.user?.id.toLowerCase() }, {
            classOf: data.classOf,
            classesTaken: data.flatClasses,
            identityFlags: data.identityFlags,
            trustLevel: 1
          })

          return res.status(200).json({ success: true, data: await User.findOne({ email: session.user?.id.toLowerCase() }).populate('classesTaken').lean() })
        } else {
          throw new Error("User doesn't have ID.")
        }
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
