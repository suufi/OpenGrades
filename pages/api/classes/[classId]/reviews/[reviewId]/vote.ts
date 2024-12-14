import ClassReview from '@/models/ClassReview'
import ReviewVote from '@/models/ReviewVote'
import { auth } from '@/utils/auth'
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
    success: boolean
    message?: string
}

export default async function handler (req: NextApiRequest, res: NextApiResponse<Data>) {
    await mongoConnection()
    const { method, body } = req
    const session = await auth(req, res)

    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    switch (method) {
        case 'POST':
            try {
                const { vote } = body // 1 for upvote, -1 for downvote, 0 for unvote
                if (![1, -1, 0].includes(vote)) {
                    return res.status(400).json({ success: false, message: 'Invalid vote value.' })
                }

                const reviewId = req.query.reviewId as string
                // Check if the user has already voted on this review
                const existingVote = await ReviewVote.findOne({ user: session.user._id, classReview: reviewId })

                // Fetch only the author of the ClassReview to avoid fetching the entire document
                const classReview = await ClassReview.findById(reviewId).select('author').lean()
                const classReviewAuthor = Array.isArray(classReview) ? undefined : classReview?.author

                if (!classReviewAuthor) {
                    return res.status(400).json({ success: false, message: 'Class review author not found.' })
                }

                if (existingVote) {
                    // If vote is 0, remove the user's vote
                    if (vote === 0) {
                        await ReviewVote.deleteOne({ _id: existingVote._id })

                        // Update the review's upvote/downvote count
                        await ClassReview.updateOne(
                            { _id: reviewId },
                            {
                                $inc: {
                                    upvotes: existingVote.vote === 1 ? -1 : 0,
                                    downvotes: existingVote.vote === -1 ? -1 : 0,
                                },
                            }
                        )
                        return res.status(200).json({ success: true, message: 'Vote removed successfully.' })
                    }

                    // If the user has voted before and the new vote is different, update the vote
                    if (existingVote.vote !== vote) {
                        existingVote.vote = vote
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
                    user: session.user._id,
                    classReview: reviewId,
                    vote
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
