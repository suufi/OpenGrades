import ClassReview from '@/models/ClassReview'
import ReviewVote from '@/models/ReviewVote'
import { getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import { addKarma } from '@/utils/karma'
import { KARMA_UPVOTE_RECEIVED } from '@/utils/karmaConstants'
import type { NextApiRequest, NextApiResponse } from 'next'
import mongoose from 'mongoose'

type Data = {
    success: boolean
    message?: string
}

async function handler (req: NextApiRequest, res: NextApiResponse<Data>) {
    await mongoConnection()
    const { method, body } = req
    const user = await getUserFromRequest(req, res)

    if (!user) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'POST':
            try {
                const { vote } = body // 1 for upvote, -1 for downvote, 0 for unvote
                if (![1, -1, 0].includes(vote)) {
                    return res.status(400).json({ success: false, message: 'Invalid vote value.' })
                }

                const reviewId = req.query.reviewId as string
                // Check if the user has already voted on this review
                const existingVote = await ReviewVote.findOne({ user: user._id, classReview: reviewId })

                // Fetch only the author of the ClassReview to avoid fetching the entire document
                const classReview = await ClassReview.findById(reviewId).select('author').lean()
                const classReviewAuthor = Array.isArray(classReview) ? undefined : classReview?.author

                if (!classReviewAuthor) {
                    return res.status(400).json({ success: false, message: 'Class review author not found.' })
                }

                const authorId: string | mongoose.Types.ObjectId =
                    classReviewAuthor != null &&
                    typeof classReviewAuthor === 'object' &&
                    !(classReviewAuthor instanceof mongoose.Types.ObjectId)
                        ? (classReviewAuthor as unknown as { _id: string | mongoose.Types.ObjectId })._id
                        : (classReviewAuthor as string | mongoose.Types.ObjectId)

                if (existingVote) {
                    // If vote is 0, clear the user's vote (keep document so re-upvoting doesn't grant karma again)
                    if (vote === 0) {
                        const hadUp = existingVote.vote === 1
                        const hadDown = existingVote.vote === -1
                        existingVote.vote = 0
                        await existingVote.save()

                        await ClassReview.updateOne(
                            { _id: reviewId },
                            {
                                $inc: {
                                    upvotes: hadUp ? -1 : 0,
                                    downvotes: hadDown ? -1 : 0,
                                },
                            }
                        )
                        return res.status(200).json({ success: true, message: 'Vote removed successfully.' })
                    }

                    // If the user has voted before and the new vote is different, update the vote
                    if (existingVote.vote !== vote) {
                        existingVote.vote = vote
                        // Grant karma only once per (voter, review) when upvoting
                        if (vote === 1 && !existingVote.karmaGranted) {
                            await addKarma(authorId, KARMA_UPVOTE_RECEIVED, 'Upvote on review')
                            existingVote.karmaGranted = true
                        }
                        await existingVote.save()

                        // Update the review's upvote/downvote count
                        await ClassReview.updateOne(
                            { _id: reviewId },
                            {
                                $inc: {
                                    upvotes: vote === 1 ? 1 : -1,
                                    downvotes: vote === -1 ? 1 : -1,
                                },
                            }
                        )
                        return res.status(200).json({ success: true, message: 'Vote updated successfully.' })
                    }

                    return res.status(200).json({ success: false, message: 'You already cast this vote.' })
                }

                // If the user has not voted yet, create a new vote
                const newVote = new ReviewVote({
                    classReviewAuthor: classReviewAuthor.toString(),
                    user: user._id,
                    classReview: reviewId,
                    vote,
                    karmaGranted: vote === 1
                })

                const validationError = newVote.validateSync() // Validate the document manually
                if (validationError) {
                    return res.status(400).json({ success: false, message: validationError.message })
                }

                try {
                    await newVote.save()
                } catch (err) {
                    console.error('Error saving ReviewVote:', err)
                    return res.status(400).json({ success: false, message: err.message })
                }

                // Update the review's upvote/downvote count
                await ClassReview.updateOne(
                    { _id: reviewId },
                    { $inc: { upvotes: vote === 1 ? 1 : 0, downvotes: vote === -1 ? 1 : 0 } }
                )

                if (vote === 1) {
                    await addKarma(authorId, KARMA_UPVOTE_RECEIVED, 'Upvote on review')
                }
                return res.status(200).json({ success: true, message: 'Vote recorded.' })
            } catch (error: unknown) {
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.toString() })
                }
            }
            break

        default:
            return res.status(400).json({ success: false, message: 'Invalid method.' })
    }
}

export default withApiLogger(handler)
