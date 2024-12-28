// @ts-nocheck
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

import { auth } from '@/utils/auth'

import ClassReview from '@/models/ClassReview'
import User from '@/models/User'
import { IClassReview } from '@/types'
import mongoose from 'mongoose'

function normalizeGrade (grade: string) {
    if (['A', 'B', 'C', 'D', 'F'].includes(grade[0])) {
        return grade[0]
    }

    return grade
}


export default async function handler (
    req: NextApiRequest,
    res: NextApiResponse
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

                    return res.status(200).json({ success: true, data: { classesTaken: user.classesTaken } })
                } else {
                    throw new Error("User doesn't have ID.")
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'POST':
            try {
                const user = await User.exists({ email: session.user?.id.toLowerCase() })
                if (user) {

                    await User.findOneAndUpdate({ email: session.user?.id.toLowerCase() }, {
                        $addToSet: {
                            classesTaken: {
                                $each: body.classesTaken
                            }
                        }
                    })

                    if (body.partialReviews) {
                        const reviewsToMake = []
                        const existingReviews = await ClassReview.find({ author: new mongoose.Types.ObjectId(user._id) }).lean()
                        const classesWithExistingReviews = existingReviews.map((r: IClassReview) => r.class.toString())

                        for (const review of body.partialReviews) {
                            // Check if the review already exists, if so, skip it
                            if (classesWithExistingReviews.includes(review.class)) {
                                continue
                            }
                            reviewsToMake.push({
                                class: review.class,
                                author: user._id,
                                letterGrade: normalizeGrade(review.letterGrade),
                                dropped: review.dropped,
                                display: false,
                                firstYear: review.firstYear,
                                partial: true,
                            })
                        }
                        await ClassReview.create(reviewsToMake)
                    }

                    return res.status(200).json({ success: true, data: await User.findOne({ email: session.user?.id.toLowerCase() }).populate('classesTaken').lean() })
                } else {
                    throw new Error('User does not exist.')
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break
        case 'DELETE':
            try {
                if (await User.exists({ email: session.user?.id.toLowerCase() })) {

                    await User.findOneAndUpdate({ email: session.user?.id.toLowerCase() }, {
                        $pull: {
                            classesTaken: body.classId
                        }
                    })

                    return res.status(200).json({ success: true, data: await User.findOne({ email: session.user?.id.toLowerCase() }).populate('classesTaken').lean() })
                } else {
                    throw new Error('User does not exist.')
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
        default:
            return res.status(405).json({ success: false, message: 'Method not allowed.' })
    }

}