import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/utils/authMiddleware'
import CourseEmbedding from '@/models/CourseEmbedding'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import ContentSubmission from '@/models/ContentSubmission'
import { OLLAMA_EMBEDDING_DIMENSIONS, OLLAMA_EMBEDDING_MODEL } from '@/utils/ollama'
import { OPENAI_PUBLIC_EMBEDDING_DIMENSIONS, OPENAI_PUBLIC_EMBEDDING_MODEL } from '@/utils/openaiEmbeddings'
import { ES_PRIVATE_EMBEDDINGS_INDEX, ES_PUBLIC_EMBEDDINGS_INDEX } from '@/utils/esClient'

/**
 * Get embedding generation status
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const user = await getUserFromRequest(req, res)
        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        const publicAggregation = await Class.aggregate([
            {
                $match: {
                    offered: true,
                    $or: [
                        { description: { $exists: true, $ne: '' } },
                        { institution: 'harvard', harvardSource: { $exists: true } }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'courseembeddings',
                    let: { classId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$class', '$$classId'] },
                                        { $eq: ['$embeddingType', 'description'] },
                                        { $eq: ['$scope', 'public'] },
                                        { $eq: ['$model', OPENAI_PUBLIC_EMBEDDING_MODEL] }
                                    ]
                                }
                            }
                        },
                        { $sort: { lastUpdated: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'embedding'
                }
            },
            {
                $project: {
                    hasEmbedding: { $gt: [{ $size: '$embedding' }, 0] },
                    stale: {
                        $and: [
                            { $gt: [{ $size: '$embedding' }, 0] },
                            { $gt: ['$updatedAt', { $arrayElemAt: ['$embedding.lastUpdated', 0] }] }
                        ]
                    }
                }
            }
        ])

        const publicTotal = publicAggregation.length
        const publicEmbedded = publicAggregation.filter(item => item.hasEmbedding).length
        const publicStale = publicAggregation.filter(item => item.stale).length
        const publicMissing = Math.max(0, publicTotal - publicEmbedded)
        const publicPending = publicMissing + publicStale

        const classesWithReviews = await ClassReview.distinct('class', {
            classComments: { $exists: true, $ne: '' },
            display: true
        })
        const reviewTotal = await Class.countDocuments({
            offered: true,
            _id: { $in: classesWithReviews }
        })
        const reviewEmbedded = await CourseEmbedding.countDocuments({
            embeddingType: 'reviews',
            scope: 'private',
            model: OLLAMA_EMBEDDING_MODEL
        })
        const reviewPending = Math.max(0, reviewTotal - reviewEmbedded)

        const contentTotal = await ContentSubmission.countDocuments({
            display: true,
            class: { $exists: true, $ne: null },
            $or: [
                { contentSummary: { $exists: true, $ne: '' } },
                { extractedText: { $exists: true, $ne: '' } }
            ]
        })

        const contentEmbeddedSourceIds = await CourseEmbedding.distinct('sourceId', {
            embeddingType: 'content',
            scope: 'private',
            model: OLLAMA_EMBEDDING_MODEL,
            sourceId: { $exists: true }
        })
        const contentEmbedded = contentEmbeddedSourceIds.length
        const contentPending = Math.max(0, contentTotal - contentEmbedded)

        const privateTotal = reviewTotal + contentTotal
        const privateEmbedded = reviewEmbedded + contentEmbedded
        const privatePending = reviewPending + contentPending

        const overallTotal = publicTotal + privateTotal
        const overallEmbedded = publicEmbedded + privateEmbedded
        const overallPending = publicPending + privatePending

        return res.status(200).json({
            success: true,
            data: {
                public: {
                    descriptions: {
                        total: publicTotal,
                        embedded: publicEmbedded,
                        pending: publicPending,
                        missing: publicMissing,
                        stale: publicStale
                    },
                    model: OPENAI_PUBLIC_EMBEDDING_MODEL,
                    dimensions: OPENAI_PUBLIC_EMBEDDING_DIMENSIONS,
                    provider: 'openai',
                    index: ES_PUBLIC_EMBEDDINGS_INDEX
                },
                private: {
                    reviews: {
                        total: reviewTotal,
                        embedded: reviewEmbedded,
                        pending: reviewPending
                    },
                    content: {
                        total: contentTotal,
                        embedded: contentEmbedded,
                        pending: contentPending
                    },
                    model: OLLAMA_EMBEDDING_MODEL,
                    dimensions: OLLAMA_EMBEDDING_DIMENSIONS,
                    provider: 'ollama',
                    index: ES_PRIVATE_EMBEDDINGS_INDEX
                },
                overall: {
                    total: overallTotal,
                    embedded: overallEmbedded,
                    pending: overallPending
                },
                descriptions: {
                    total: publicTotal,
                    embedded: publicEmbedded,
                    pending: publicPending
                },
                reviews: {
                    total: reviewTotal,
                    embedded: reviewEmbedded,
                    pending: reviewPending
                },
                content: {
                    total: contentTotal,
                    embedded: contentEmbedded,
                    pending: contentPending
                },
                skipped: 0
            }
        })
    } catch (error: any) {
        console.error('Status API error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}

export default withApiLogger(handler)
