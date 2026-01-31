import mongoConnection from '@/utils/mongoConnection'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '../auth/[...nextauth]'
import User from '@/models/User'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import ContentSubmission from '@/models/ContentSubmission'
import CourseEmbedding from '@/models/CourseEmbedding'
import { Ollama } from 'ollama'

const EMBEDDING_MODEL = 'qwen3-embedding:4b'
const EMBEDDING_DIMENSIONS = 2560

function getOllamaClient() {
    return new Ollama({
        host: process.env.OLLAMA_BASE_URL || 'https://llms-dev-1.mit.edu',
        headers: process.env.OLLAMA_API_KEY ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } : {},
    })
}

async function generateEmbedding(text: string): Promise<number[]> {
    const ollama = getOllamaClient()
    const response = await ollama.embeddings({ model: EMBEDDING_MODEL, prompt: text })
    return response.embedding
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const session = await getServerSession(req, res, authOptions)
        if (!session || !session.user?.email) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        const user = await User.findOne({ email: session.user.email })
        if (!user || user.trustLevel < 2) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' })
        }

        const { type = 'all', force = false, limit = 200 } = req.body

        let stats = {
            descriptions: 0,
            reviews: 0,
            content: 0,
            skipped: 0,
            errors: 0
        }

        if (type === 'all' || type === 'descriptions') {
            console.log(`Generating descriptions. Limit: ${limit}. Force: ${force}`)

            let matchStage: any = {}

            if (!force) {
                matchStage = {
                    $or: [
                        { embedding: { $size: 0 } },
                        { 'embedding.embeddingModel': { $ne: EMBEDDING_MODEL } },
                        { $expr: { $gt: ['$updatedAt', { $arrayElemAt: ['$embedding.lastUpdated', 0] }] } }
                    ]
                }
            }

            const courses = await Class.aggregate([
                { $match: { offered: true, description: { $exists: true, $ne: '' } } },
                {
                    $lookup: {
                        from: 'courseembeddings',
                        let: { classId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: ['$class', '$$classId'] }, { $eq: ['$embeddingType', 'description'] }] } } }
                        ],
                        as: 'embedding'
                    }
                },
                ...(force ? [] : [{ $match: matchStage }]),
                { $limit: limit }
            ])

            console.log(`Found ${courses.length} courses that need embedding`)

            if (courses.length === 0) {
                console.log('No courses need embedding - all up to date')
            }

            const bulkOps: any[] = []

            for (const course of courses as any[]) {
                try {
                    const parts: string[] = []
                    parts.push(`${course.subjectNumber}: ${course.subjectTitle}`)
                    if (course.aliases?.length > 0) {
                        parts.push(`Also listed as: ${course.aliases.join(', ')}`)
                    }
                    if (course.department) parts.push(`Department: ${course.department}`)
                    if (course.crossListedDepartments?.length > 0) {
                        parts.push(`Cross-listed: ${course.crossListedDepartments.join(', ')}`)
                    }
                    if (course.prerequisites) parts.push(`Prerequisites: ${course.prerequisites}`)
                    if (course.corequisites) parts.push(`Corequisites: ${course.corequisites}`)
                    if (course.girAttribute?.length > 0) {
                        parts.push(`GIR: ${course.girAttribute.join(', ')}`)
                    }
                    if (course.hassAttribute) parts.push(`HASS: ${course.hassAttribute}`)
                    if (course.communicationRequirement) {
                        parts.push(`Communication: ${course.communicationRequirement}`)
                    }
                    parts.push(course.description || 'No description available')

                    const text = parts.join(' ').substring(0, 8000)

                    const embedding = await generateEmbedding(text)

                    bulkOps.push({
                        updateOne: {
                            filter: { class: course._id, embeddingType: 'description' },
                            update: {
                                $set: {
                                    class: course._id,
                                    embeddingType: 'description',
                                    embedding,
                                    embeddingModel: EMBEDDING_MODEL,
                                    embeddingDimensions: EMBEDDING_DIMENSIONS,
                                    sourceText: text.substring(0, 5000),
                                    text: text.substring(0, 5000),
                                    lastUpdated: new Date()
                                }
                            },
                            upsert: true
                        }
                    })

                    stats.descriptions++

                    if (bulkOps.length >= 200) {
                        await CourseEmbedding.bulkWrite(bulkOps)
                        bulkOps.length = 0
                        console.log(`Progress: ${stats.descriptions} descriptions processed`)
                    }
                } catch (error: any) {
                    console.error(`Error embedding ${course.subjectNumber}:`, error.message)
                    stats.errors++
                }
            }

            if (bulkOps.length > 0) {
                await CourseEmbedding.bulkWrite(bulkOps)
            }

            console.log(`Completed: ${stats.descriptions} descriptions, ${stats.errors} errors`)
        }

        if (type === 'all' || type === 'reviews') {
            console.log(`Generating reviews. Limit: ${limit}. Force: ${force}`)

            const classesWithReviews = await ClassReview.distinct('class', {
                classComments: { $exists: true, $ne: '' },
                display: true
            })

            let matchStage: any = {}

            if (!force) {
                matchStage = {
                    $or: [
                        { embedding: { $size: 0 } },
                        { 'embedding.embeddingModel': { $ne: EMBEDDING_MODEL } }
                    ]
                }
            }

            const classes = await Class.aggregate([
                { $match: { offered: true, _id: { $in: classesWithReviews } } },
                {
                    $lookup: {
                        from: 'courseembeddings',
                        let: { classId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: ['$class', '$$classId'] }, { $eq: ['$embeddingType', 'reviews'] }] } } }
                        ],
                        as: 'embedding'
                    }
                },
                ...(force ? [] : [{ $match: matchStage }]),
                { $limit: limit }
            ])

            console.log(`Found ${classes.length} classes that need review embedding`)

            if (classes.length === 0) {
                console.log('No reviews need embedding - all up to date')
            }

            const bulkOps: any[] = []

            for (const cls of classes as any[]) {
                try {
                    const reviews = await ClassReview.find({
                        class: cls._id,
                        classComments: { $exists: true, $ne: '' },
                        display: true
                    }).populate('author', 'aiEmbeddingOptOut').lean()

                    if (reviews.length === 0) continue

                    const allowedReviews = reviews.filter((r: any) => {
                        const author = r.author as any
                        return !author || !author.aiEmbeddingOptOut
                    })

                    if (allowedReviews.length === 0) {
                        console.log(`Skipping ${cls.subjectNumber} - all reviews opted out`)
                        continue
                    }

                    const reviewText = allowedReviews.map((r: any) => {
                        const tags = []
                        if (r.firstYear) tags.push('[First Year]')
                        if (r.retaking) tags.push('[Retaking]')
                        if (r.droppedClass) tags.push('[Dropped]')

                        let content = tags.join(' ')
                        if (r.classComments) content += ` ${r.classComments}`
                        if (r.backgroundComments) content += ` (Background: ${r.backgroundComments})`

                        return content.trim()
                    }).filter(t => t.length > 0).join(' | ')

                    const text = `Student reviews for ${cls.subjectNumber}: ${reviewText}`.substring(0, 8000)

                    const embedding = await generateEmbedding(text)

                    bulkOps.push({
                        updateOne: {
                            filter: { class: cls._id, embeddingType: 'reviews' },
                            update: {
                                $set: {
                                    class: cls._id,
                                    embeddingType: 'reviews',
                                    embedding,
                                    embeddingModel: EMBEDDING_MODEL,
                                    embeddingDimensions: EMBEDDING_DIMENSIONS,
                                    sourceText: text.substring(0, 5000),
                                    lastUpdated: new Date()
                                }
                            },
                            upsert: true
                        }
                    })

                    stats.reviews++

                    if (bulkOps.length >= 100) {
                        await CourseEmbedding.bulkWrite(bulkOps)
                        bulkOps.length = 0
                        console.log(`Progress: ${stats.reviews} reviews processed`)
                    }
                } catch (error: any) {
                    console.error(`Error embedding reviews for ${cls.subjectNumber}:`, error.message)
                    stats.errors++
                }
            }

            if (bulkOps.length > 0) {
                await CourseEmbedding.bulkWrite(bulkOps)
            }

            console.log(`Completed: ${stats.reviews} reviews, ${stats.errors} errors`)
        }

        if (type === 'all' || type === 'content') {
            console.log(`Generating content. Limit: ${limit}. Force: ${force}`)

            let matchStage: any = {}

            if (!force) {
                matchStage = {
                    $or: [
                        { embedding: { $size: 0 } },
                        { 'embedding.embeddingModel': { $ne: EMBEDDING_MODEL } }
                    ]
                }
            }

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
                        from: 'courseembeddings',
                        let: { sourceId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: ['$sourceId', '$$sourceId'] }, { $eq: ['$embeddingType', 'content'] }] } } }
                        ],
                        as: 'embedding'
                    }
                },
                ...(force ? [] : [{ $match: matchStage }]),
                {
                    $lookup: {
                        from: 'classes',
                        localField: 'class',
                        foreignField: '_id',
                        as: 'classData'
                    }
                },
                { $unwind: { path: '$classData', preserveNullAndEmptyArrays: true } },
                { $limit: limit }
            ])

            console.log(`Found ${contentSubmissions.length} content that need embedding`)

            if (contentSubmissions.length === 0) {
                console.log('No content needs embedding - all up to date')
            }

            const bulkOps: any[] = []

            for (const content of contentSubmissions as any[]) {
                try {
                    const classId = content.classData?._id || content.class
                    if (!classId) continue

                    const text = content.contentSummary || content.extractedText || ''
                    if (!text) continue

                    const embedding = await generateEmbedding(text.substring(0, 8000))

                    bulkOps.push({
                        updateOne: {
                            filter: { sourceId: content._id, embeddingType: 'content' },
                            update: {
                                $set: {
                                    class: classId,
                                    embeddingType: 'content',
                                    embedding,
                                    embeddingModel: EMBEDDING_MODEL,
                                    embeddingDimensions: EMBEDDING_DIMENSIONS,
                                    sourceText: text.substring(0, 5000),
                                    sourceId: content._id,
                                    lastUpdated: new Date()
                                }
                            },
                            upsert: true
                        }
                    })

                    stats.content++

                    if (bulkOps.length >= 100) {
                        await CourseEmbedding.bulkWrite(bulkOps)
                        bulkOps.length = 0
                        console.log(`Progress: ${stats.content} content processed`)
                    }
                } catch (error: any) {
                    console.error(`Error embedding content ${content._id}:`, error.message)
                    stats.errors++
                }
            }

            if (bulkOps.length > 0) {
                await CourseEmbedding.bulkWrite(bulkOps)
            }

            console.log(`Completed: ${stats.content} content, ${stats.errors} errors`)
        }

        return res.status(200).json({
            success: true,
            message: 'Embedding generation complete',
            stats,
            processed: {
                descriptions: stats.descriptions,
                reviews: stats.reviews,
                content: stats.content,
                total: stats.descriptions + stats.reviews + stats.content
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
