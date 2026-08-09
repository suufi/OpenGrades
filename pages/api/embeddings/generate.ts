import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/utils/authMiddleware'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import ContentSubmission from '@/models/ContentSubmission'
import CourseEmbedding from '@/models/CourseEmbedding'
import { generateEmbeddingsBatch, OLLAMA_EMBEDDING_DIMENSIONS, OLLAMA_EMBEDDING_MODEL } from '@/utils/ollama'
import {
    generateOpenAIEmbedding,
    generateOpenAIEmbeddingsBatch,
    OPENAI_PUBLIC_EMBEDDING_DIMENSIONS,
    OPENAI_PUBLIC_EMBEDDING_MODEL
} from '@/utils/openaiEmbeddings'
import { buildPublicDescriptionText } from '@/utils/embeddingText'

type EmbeddingScope = 'public' | 'private' | 'all'
type EmbeddingType = 'all' | 'descriptions' | 'reviews' | 'content'

function buildPrivateReviewText(cls: any, reviews: any[]): string {
    const lines: string[] = []
    lines.push('[PRIVATE_REVIEW]')
    lines.push(`Course: ${cls.subjectNumber} — ${cls.subjectTitle || ''}`.trim())
    lines.push(`Review count: ${reviews.length}`)

    reviews.slice(0, 8).forEach((review, idx) => {
        const tags: string[] = []
        if (review.firstYear) tags.push('first_year')
        if (review.retaking) tags.push('retaking')
        if (review.droppedClass) tags.push('dropped')
        if (review.recommendationLevel) tags.push(`recommendation:${review.recommendationLevel}/5`)
        if (review.overallRating) tags.push(`overall:${review.overallRating}/7`)
        if (review.hoursPerWeek) tags.push(`hours:${review.hoursPerWeek}`)

        lines.push(`[review] #${idx + 1} ${tags.join(', ')}`.trim())
        if (review.classComments) lines.push(review.classComments)
        if (review.backgroundComments) lines.push(`Background: ${review.backgroundComments}`)
    })

    return lines.join('\n').substring(0, 8000)
}

function chunkTextForEmbedding(text: string, maxLength = 5000, maxChunks = 3): string[] {
    const clean = (text || '').replace(/\s+/g, ' ').trim()
    if (!clean) return []
    if (clean.length <= maxLength) return [clean]

    const chunks: string[] = []
    let cursor = 0
    while (cursor < clean.length && chunks.length < maxChunks) {
        let end = Math.min(clean.length, cursor + maxLength)
        if (end < clean.length) {
            const breakpoint = clean.lastIndexOf(' ', end)
            if (breakpoint > cursor + Math.floor(maxLength * 0.65)) {
                end = breakpoint
            }
        }
        chunks.push(clean.slice(cursor, end).trim())
        cursor = end
    }
    return chunks.filter(Boolean)
}

function buildPrivateContentTexts(content: any): string[] {
    const raw = content.contentSummary || content.extractedText || ''
    if (!raw) return []
    const metadata = `[PRIVATE_CONTENT]\nCourse: ${content.classData?.subjectNumber || content.class || ''}\nContent: ${content.contentTitle || 'Untitled'} (${content.type || 'Unknown'})`
    const chunks = chunkTextForEmbedding(raw, 5000, 3)
    return chunks.map((chunk, idx) => `${metadata}\n[content] part ${idx + 1}\n${chunk}`.substring(0, 8000))
}

async function embedPublicTextsWithFallback(texts: string[]): Promise<{ embeddings: number[][]; errors: number }> {
    if (texts.length === 0) return { embeddings: [], errors: 0 }

    try {
        const embeddings = await generateOpenAIEmbeddingsBatch(texts, { batchSize: 32, retries: 3 })
        return { embeddings, errors: 0 }
    } catch (batchError) {
        const embeddings: number[][] = []
        let errors = 0
        for (const text of texts) {
            try {
                embeddings.push(await generateOpenAIEmbedding(text))
            } catch (error) {
                console.error('OpenAI single embedding fallback failed:', error)
                embeddings.push([])
                errors += 1
            }
        }
        return { embeddings, errors }
    }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const user = await getUserFromRequest(req, res)
        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        if (user.trustLevel < 2) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' })
        }

        const {
            type = 'all',
            scope = 'all',
            force = false,
            limit = 200,
            institution = 'all'
        }: {
            type?: EmbeddingType
            scope?: EmbeddingScope
            force?: boolean
            limit?: number
            institution?: 'all' | 'mit' | 'harvard'
        } = req.body

        const shouldRunPublicDescriptions =
            (scope === 'all' || scope === 'public') &&
            (type === 'all' || type === 'descriptions')

        const shouldRunPrivateReviews =
            (scope === 'all' || scope === 'private') &&
            (type === 'all' || type === 'reviews')

        const shouldRunPrivateContent =
            (scope === 'all' || scope === 'private') &&
            (type === 'all' || type === 'content')

        const stats = {
            public: {
                descriptions: 0,
                candidates: 0
            },
            private: {
                reviews: 0,
                content: 0,
                reviewCandidates: 0,
                contentCandidates: 0
            },
            skipped: 0,
            errors: 0
        }

        if (shouldRunPublicDescriptions) {
            const institutionMatch =
                institution === 'harvard'
                    ? { institution: 'harvard' }
                    : institution === 'mit'
                        ? { $or: [{ institution: { $exists: false } }, { institution: 'mit' }] }
                        : {}

            const courses = await Class.aggregate([
                {
                    $match: {
                        offered: true,
                        ...institutionMatch,
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
                                            { $eq: ['$scope', 'public'] }
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
                ...(force ? [] : [{
                    $match: {
                        $or: [
                            { embedding: { $size: 0 } },
                            { 'embedding.model': { $ne: OPENAI_PUBLIC_EMBEDDING_MODEL } },
                            { $expr: { $gt: ['$updatedAt', { $arrayElemAt: ['$embedding.lastUpdated', 0] }] } }
                        ]
                    }
                }]),
                { $limit: limit }
            ])

            stats.public.candidates = courses.length

            const publicTexts = courses.map((course: any) => buildPublicDescriptionText(course))
            const { embeddings, errors } = await embedPublicTextsWithFallback(publicTexts)
            stats.errors += errors

            const ops: any[] = []
            courses.forEach((course: any, idx: number) => {
                const embedding = embeddings[idx]
                if (!embedding || embedding.length === 0) {
                    stats.errors += 1
                    return
                }

                const text = publicTexts[idx]
                ops.push({
                    updateOne: {
                        filter: { class: course._id, embeddingType: 'description', scope: 'public' },
                        update: {
                            $set: {
                                class: course._id,
                                embeddingType: 'description',
                                scope: 'public',
                                sourceKind: 'class_catalog',
                                provider: 'openai',
                                model: OPENAI_PUBLIC_EMBEDDING_MODEL,
                                dimension: OPENAI_PUBLIC_EMBEDDING_DIMENSIONS,
                                embedding,
                                embeddingModel: OPENAI_PUBLIC_EMBEDDING_MODEL,
                                embeddingDimensions: OPENAI_PUBLIC_EMBEDDING_DIMENSIONS,
                                sourceText: text.substring(0, 5000),
                                text: text.substring(0, 5000),
                                lastUpdated: new Date()
                            }
                        },
                        upsert: true
                    }
                })
            })

            if (ops.length > 0) {
                await CourseEmbedding.bulkWrite(ops)
            }

            stats.public.descriptions += ops.length
            stats.skipped += Math.max(0, courses.length - ops.length)
        }

        if (shouldRunPrivateReviews) {
            const classesWithReviews = await ClassReview.distinct('class', {
                classComments: { $exists: true, $ne: '' },
                display: true
            })

            const classes = await Class.aggregate([
                { $match: { offered: true, _id: { $in: classesWithReviews } } },
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
                                            { $eq: ['$embeddingType', 'reviews'] },
                                            { $eq: ['$scope', 'private'] }
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
                ...(force ? [] : [{
                    $match: {
                        $or: [
                            { embedding: { $size: 0 } },
                            { 'embedding.model': { $ne: OLLAMA_EMBEDDING_MODEL } }
                        ]
                    }
                }]),
                { $limit: limit }
            ])

            stats.private.reviewCandidates = classes.length

            const reviewPayload: Array<{ cls: any; text: string }> = []
            for (const cls of classes as any[]) {
                const reviews = await ClassReview.find({
                    class: cls._id,
                    classComments: { $exists: true, $ne: '' },
                    display: true
                }).populate('author', 'aiEmbeddingOptOut').lean()

                const allowedReviews = reviews.filter((review: any) => {
                    const author = review.author as any
                    return !author || !author.aiEmbeddingOptOut
                })

                if (allowedReviews.length === 0) {
                    stats.skipped += 1
                    continue
                }

                reviewPayload.push({
                    cls,
                    text: buildPrivateReviewText(cls, allowedReviews)
                })
            }

            const reviewEmbeddings = await generateEmbeddingsBatch(
                reviewPayload.map(payload => payload.text),
                6
            )

            const ops: any[] = []
            reviewPayload.forEach((payload, idx) => {
                const embedding = reviewEmbeddings[idx]
                if (!embedding || embedding.length === 0) {
                    stats.errors += 1
                    return
                }

                ops.push({
                    updateOne: {
                        filter: { class: payload.cls._id, embeddingType: 'reviews', scope: 'private' },
                        update: {
                            $set: {
                                class: payload.cls._id,
                                embeddingType: 'reviews',
                                scope: 'private',
                                sourceKind: 'class_review',
                                provider: 'ollama',
                                model: OLLAMA_EMBEDDING_MODEL,
                                dimension: OLLAMA_EMBEDDING_DIMENSIONS,
                                embedding,
                                embeddingModel: OLLAMA_EMBEDDING_MODEL,
                                embeddingDimensions: OLLAMA_EMBEDDING_DIMENSIONS,
                                sourceText: payload.text.substring(0, 5000),
                                lastUpdated: new Date()
                            }
                        },
                        upsert: true
                    }
                })
            })

            if (ops.length > 0) {
                await CourseEmbedding.bulkWrite(ops)
            }

            stats.private.reviews += ops.length
            stats.skipped += Math.max(0, reviewPayload.length - ops.length)
        }

        if (shouldRunPrivateContent) {
            const contentSubmissions = await ContentSubmission.aggregate([
                {
                    $match: {
                        display: true,
                        class: { $exists: true, $ne: null },
                        $or: [
                            { contentSummary: { $exists: true, $ne: '' } },
                            { extractedText: { $exists: true, $ne: '' } }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: 'classes',
                        localField: 'class',
                        foreignField: '_id',
                        as: 'classData'
                    }
                },
                { $unwind: { path: '$classData', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'courseembeddings',
                        let: { sourceId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$sourceId', '$$sourceId'] },
                                            { $eq: ['$embeddingType', 'content'] },
                                            { $eq: ['$scope', 'private'] },
                                            { $eq: ['$model', OLLAMA_EMBEDDING_MODEL] }
                                        ]
                                    }
                                }
                            },
                            { $limit: 1 }
                        ],
                        as: 'embedding'
                    }
                },
                ...(force ? [] : [{ $match: { embedding: { $size: 0 } } }]),
                { $limit: limit }
            ])

            stats.private.contentCandidates = contentSubmissions.length

            for (const content of contentSubmissions as any[]) {
                const texts = buildPrivateContentTexts(content)
                if (texts.length === 0) {
                    stats.skipped += 1
                    continue
                }

                try {
                    const embeddings = await generateEmbeddingsBatch(texts, 4)

                    await CourseEmbedding.deleteMany({
                        sourceId: content._id,
                        embeddingType: 'content',
                        scope: 'private'
                    })

                    const docs = embeddings.map((embedding: number[], idx: number) => ({
                        class: content.classData?._id || content.class,
                        embeddingType: 'content',
                        scope: 'private',
                        sourceKind: 'content_submission',
                        provider: 'ollama',
                        model: OLLAMA_EMBEDDING_MODEL,
                        dimension: OLLAMA_EMBEDDING_DIMENSIONS,
                        embedding,
                        embeddingModel: OLLAMA_EMBEDDING_MODEL,
                        embeddingDimensions: OLLAMA_EMBEDDING_DIMENSIONS,
                        sourceText: texts[idx].substring(0, 5000),
                        sourceId: content._id,
                        chunkIndex: idx,
                        totalChunks: texts.length,
                        lastUpdated: new Date()
                    }))

                    if (docs.length > 0) {
                        await CourseEmbedding.insertMany(docs)
                    }

                    stats.private.content += docs.length
                } catch (error) {
                    console.error(`Content embedding failed for ${content._id}:`, error)
                    stats.errors += 1
                }
            }
        }

        const processedTotal =
            stats.public.descriptions +
            stats.private.reviews +
            stats.private.content

        return res.status(200).json({
            success: true,
            message: 'Embedding generation complete',
            modelConfig: {
                public: {
                    provider: 'openai',
                    model: OPENAI_PUBLIC_EMBEDDING_MODEL,
                    dimensions: OPENAI_PUBLIC_EMBEDDING_DIMENSIONS
                },
                private: {
                    provider: 'ollama',
                    model: OLLAMA_EMBEDDING_MODEL,
                    dimensions: OLLAMA_EMBEDDING_DIMENSIONS
                }
            },
            stats,
            processed: {
                descriptions: stats.public.descriptions,
                reviews: stats.private.reviews,
                content: stats.private.content,
                total: processedTotal
            }
        })
    } catch (error: any) {
        console.error('Embedding generation error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}

export default withApiLogger(handler)
