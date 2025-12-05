// @ts-nocheck
import '@/models/Class'
import ClassReview from '@/models/ClassReview'
import { auth } from '@/utils/auth'
import mongoose from 'mongoose'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import User from '../../../models/User'
import { IdentityFlags } from '../../../types'
import mongoConnection from '../../../utils/mongoConnection'

type Data = {
  success: boolean,
  data?: object,
  message?: string
}

function normalizeGrade(grade: string) {
  if (grade === 'DR') return 'DR'

  if (['A', 'B', 'C', 'D', 'F'].includes(grade[0])) {
    return grade[0]
  }

  return grade
}

export default async function handler(
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
          const user = await User.findOne({ email: session.user.id.toLowerCase() }).populate('classesTaken').populate('courseAffiliation').lean()

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
        const user = await User.findOne({ email: session.user?.id.toLowerCase() }).lean()

        if (user) {
          const schema = z.object({
            kerb: z.string().optional(),
            name: z.string().optional(),
            classOf: z.number().optional(),
            affiliation: z.string().optional(),
            identityFlags: z.array(z.nativeEnum(IdentityFlags)).optional(),
            flatClasses: z.array(z.string()).optional(),
            referredBy: z.string().optional(),
            undergradProgramIds: z.array(z.string()).optional(),
            emailOptIn: z.boolean().optional(),
            partialReviews: z.array(z.object({
              class: z.string(),
              letterGrade: z.string(),
              droppedClass: z.boolean(),
              firstYear: z.boolean()
            })).optional()
          }).partial({
            identityFlags: true,
            flatClasses: true,
            referredBy: true,
            undergradProgramIds: true,
          })

          const data = schema.parse(body)

          const referredByUser = data.referredBy ? await User.exists({ kerb: data.referredBy }) : false

          const updateData: any = {}

          if (data.classOf) updateData.classOf = data.classOf
          if (data.identityFlags) updateData.identityFlags = data.identityFlags
          if (data.flatClasses) updateData.classesTaken = data.flatClasses
          if (data.referredBy) updateData.referredBy = referredByUser ? new mongoose.Types.ObjectId(referredByUser._id) : undefined
          if (typeof data.emailOptIn === 'boolean') updateData.emailOptIn = data.emailOptIn
          if (user.trustLevel < 1) updateData.trustLevel = 1

          if (data.undergradProgramIds && data.undergradProgramIds.length > 0) {
            const existingAffiliations = user.courseAffiliation || []
            const newAffiliations = data.undergradProgramIds.map(id => new mongoose.Types.ObjectId(id))
            const allAffiliations = [...existingAffiliations, ...newAffiliations]
            const uniqueAffiliations = Array.from(new Set(allAffiliations.map(a => a.toString()))).map(id => new mongoose.Types.ObjectId(id))

            updateData.courseAffiliation = uniqueAffiliations
          }

          await User.findOneAndUpdate({ email: session.user?.id.toLowerCase() },
            updateData
          )

          if (data.partialReviews) {
            const reviewsToMake = []
            const existingReviews = await ClassReview.find({ author: user._id }).lean()
            const existingReviewsByClass = new Map(existingReviews.map((r: IClassReview) => [r.class.toString(), r]))

            for (const review of data.partialReviews) {
              const existingReview = existingReviewsByClass.get(review.class)

              // If existing review has 'D' but new grade report shows 'DR', update it
              if (existingReview && existingReview.letterGrade === 'D' && review.letterGrade === 'DR') {
                await ClassReview.updateOne(
                  { _id: existingReview._id },
                  { letterGrade: 'DR', droppedClass: true }
                )
                continue
              }

              // Skip if review already exists
              if (existingReview) {
                continue
              }

              reviewsToMake.push({
                class: review.class,
                author: user._id,
                letterGrade: normalizeGrade(review.letterGrade),
                droppedClass: review.droppedClass,
                display: false,
                firstYear: review.firstYear,
                partial: true,
              })
            }
            await ClassReview.create(reviewsToMake)

            if (reviewsToMake.length > 0) {
              await User.updateOne({ email: session.user?.id.toLowerCase() }, { lastGradeReportUpload: new Date() })
            }
          }

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
