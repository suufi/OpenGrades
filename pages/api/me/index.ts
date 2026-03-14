import '@/models/Class'
import ClassReview from '@/models/ClassReview'
import { getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoose from 'mongoose'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import User from '../../../models/User'
import { IClassReview, IdentityFlags, IUser } from '../../../types'
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  await mongoConnection()
  const { method, body } = req

  const user = await getUserFromRequest(req, res)

  if (!user) return res.status(403).json({ success: false, message: 'Please sign in.' })
  const email = user?.email?.toLowerCase()

  switch (method) {
    case 'GET':
      try {
        if (user?.email) {
          const userDoc = await User.findOne({ email: user.email.toLowerCase() }).populate('classesTaken').populate('courseAffiliation').lean()
          const reviewCount = await ClassReview.countDocuments({ author: userDoc?._id })

          return res.status(200).json({ success: true, data: { user: { ...userDoc, reviewCount } } })
        } else {
          throw new Error("User doesn't have email.")
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'PUT':
      try {
        const userDoc = await User.findOne({ email: user?.email.toLowerCase() }).lean()

        if (userDoc) {
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
          const flagsToSet = data.flags ?? data.identityFlags
          if (flagsToSet) updateData.flags = flagsToSet
          if (data.flatClasses && data.flatClasses.length > 0) {
            updateData.classesTaken = data.flatClasses.map((id: string) => new mongoose.Types.ObjectId(id))
            updateData.lastGradeReportUpload = new Date()
          }
          if (data.referredBy) updateData.referredBy = referredByUser ? new mongoose.Types.ObjectId(referredByUser._id) : undefined
          if (typeof data.emailOptIn === 'boolean') updateData.emailOptIn = data.emailOptIn
          const currentTrustLevel = userDoc?.trustLevel ?? 0
          if (currentTrustLevel < 1) updateData.trustLevel = 1

          if (data.undergradProgramIds && data.undergradProgramIds.length > 0) {
            const existingAffiliations = userDoc?.courseAffiliation || []
            const newAffiliations = data.undergradProgramIds.map(id => new mongoose.Types.ObjectId(id))
            const allAffiliations = [...existingAffiliations, ...newAffiliations]
            const uniqueAffiliations = Array.from(new Set(allAffiliations.map(a => a.toString()))).map(id => new mongoose.Types.ObjectId(id))

            updateData.courseAffiliation = uniqueAffiliations
          }

          await User.findOneAndUpdate({ email },
            updateData
          )

          if (data.partialReviews) {
            const reviewsToMake = []
            const authorId = userDoc?._id
            const existingReviews = await ClassReview.find({ author: authorId }).lean()
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
                author: authorId,
                letterGrade: normalizeGrade(review.letterGrade),
                droppedClass: review.droppedClass,
                display: false,
                firstYear: review.firstYear,
                partial: true,
              })
            }
            await ClassReview.create(reviewsToMake)

            if (reviewsToMake.length > 0) {
              await User.updateOne({ email }, { lastGradeReportUpload: new Date() })
            }
          }

          const updatedUser = await User.findOne({ email }).populate('classesTaken').lean()
          return res.status(200).json({ success: true, data: updatedUser })
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

export default withApiLogger(handler)
