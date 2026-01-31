// @ts-nocheck
import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '../auth/[...nextauth]'
import CourseEmbedding from '@/models/CourseEmbedding'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import ContentSubmission from '@/models/ContentSubmission'

// Must match the model in generate.ts
const EMBEDDING_MODEL = 'qwen3-embedding:4b'

/**
 * Get embedding generation status
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const session = await getServerSession(req, res, authOptions)
        if (!session) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        // Count total items that can be embedded
        const totalClasses = await Class.countDocuments({
            offered: true,
            description: { $exists: true, $ne: '' }
        })

        const totalContent = await ContentSubmission.countDocuments({
            display: true,
            class: { $exists: true, $ne: null },
            $or: [
                { contentSummary: { $exists: true, $ne: '' } },
                { extractedText: { $exists: true, $ne: '' } }
            ]
        })

        const classesWithReviews = await ClassReview.distinct('class', {
            classComments: { $exists: true, $ne: '' },
            display: true
        })

        // Filter to only offered classes
        const totalReviewTargets = await Class.countDocuments({
            offered: true,
            _id: { $in: classesWithReviews }
        })

        // Count embeddings that are up-to-date with current model
        const upToDateDescriptions = await CourseEmbedding.countDocuments({
            embeddingType: 'description',
            embeddingModel: EMBEDDING_MODEL
        })

        const upToDateReviews = await CourseEmbedding.countDocuments({
            embeddingType: 'reviews',
            embeddingModel: EMBEDDING_MODEL
        })

        const upToDateContent = await CourseEmbedding.countDocuments({
            embeddingType: 'content',
            embeddingModel: EMBEDDING_MODEL
        })

        return res.status(200).json({
            success: true,
            data: {
                descriptions: {
                    total: totalClasses,
                    embedded: Math.min(upToDateDescriptions, totalClasses),
                    pending: Math.max(0, totalClasses - upToDateDescriptions)
                },
                reviews: {
                    total: totalReviewTargets,
                    embedded: Math.min(upToDateReviews, totalReviewTargets),
                    pending: Math.max(0, totalReviewTargets - upToDateReviews)
                },
                content: {
                    total: totalContent,
                    embedded: Math.min(upToDateContent, totalContent),
                    pending: Math.max(0, totalContent - upToDateContent)
                },
                overall: {
                    total: totalClasses + totalReviewTargets + totalContent,
                    embedded: Math.min(upToDateDescriptions, totalClasses) +
                        Math.min(upToDateReviews, totalReviewTargets) +
                        Math.min(upToDateContent, totalContent),
                    pending: Math.max(0, totalClasses - upToDateDescriptions) +
                        Math.max(0, totalReviewTargets - upToDateReviews) +
                        Math.max(0, totalContent - upToDateContent)
                },
                model: EMBEDDING_MODEL,
                skipped: 0
            }
        })

    } catch (error) {
        console.error('Status API error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}

export default withApiLogger(handler)
