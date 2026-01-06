import CourseEmbedding from '@/models/CourseEmbedding'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import ContentSubmission from '@/models/ContentSubmission'
import { IClass, IClassReview } from '@/types'
import { generateQueryEmbedding } from './ollama'

export interface SearchResult {
    class: IClass
    score: number
    embeddingType: string
    snippet: string
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
        return 0
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i]
        normA += vecA[i] * vecA[i]
        normB += vecB[i] * vecB[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Perform vector similarity search using local in-memory calculation
 * Fetches embeddings from DB and calculates similarity locally
 * (Since dataset is small <10k items, this is fast and avoids Atlas dependency)
 */
export async function vectorSearch(
    queryEmbedding: number[],
    limit: number = 10,
    embeddingType?: 'description' | 'reviews' | 'content'
): Promise<SearchResult[]> {
    const filter = embeddingType ? { embeddingType } : {}

    const allEmbeddings = await CourseEmbedding.find(filter)
        .select('embedding class embeddingType sourceText')
        .lean() as Array<{
            _id: any
            embedding: number[]
            class: any
            embeddingType: string
            sourceText: string
        }>

    const scored = allEmbeddings.map(record => ({
        ...record,
        score: cosineSimilarity(queryEmbedding, record.embedding)
    }))

    scored.sort((a, b) => b.score - a.score)

    const topResults = scored.slice(0, limit * 2)

    const classIds = topResults.map(r => r.class)
    const classes = await Class.find({ _id: { $in: classIds } }).lean()

    const results: SearchResult[] = []

    for (const result of topResults) {
        const classData = classes.find(c => c._id.toString() === result.class.toString())

        if (classData && classData.offered) {
            results.push({
                class: classData as IClass,
                score: result.score,
                embeddingType: result.embeddingType,
                snippet: result.sourceText.substring(0, 200) + '...'
            })
        }

        if (results.length >= limit) break
    }

    return results
}

/**
 * Get relevant context for LLM from vector search results
 * Uses hybrid search (vector + BM25) for best retrieval quality
 * Returns descriptions + content/reviews based on semantic + keyword similarity
 */
export async function getRelevantContext(
    query: string,
    limit: number = 5
): Promise<{
    classes: Array<IClass & { relevance: string }>
    reviews: IClassReview[]
    contentSnippets: string[]
}> {
    const { hybridSearchES, vectorSearchES } = await import('./vectorSearchES')

    const queryEmbedding = await generateQueryEmbedding(query)

    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        console.error('Failed to generate embedding for query:', query)
        return { classes: [], reviews: [], contentSnippets: [] }
    }

    const descriptionResults = await hybridSearchES(queryEmbedding, query, limit * 5, 'description')
    const contentResults = await hybridSearchES(queryEmbedding, query, limit, 'content')

    // Only keep reviews for classes already found via descriptions
    const descriptionClassIds = new Set(descriptionResults.map(r => r.class._id.toString()))
    let reviewResults: typeof contentResults = []

    const allReviewResults = await hybridSearchES(queryEmbedding, query, limit * 2, 'reviews')
    reviewResults = allReviewResults.filter(r => descriptionClassIds.has(r.class._id.toString()))

    const allSearchResults = [...descriptionResults, ...contentResults, ...reviewResults]

    if (allSearchResults.length === 0) {
        return { classes: [], reviews: [], contentSnippets: [] }
    }

    const classIds = [...new Set(allSearchResults.map(r => r.class._id))]

    const reviews = await ClassReview.find({
        class: { $in: classIds },
        display: true,
        classComments: { $exists: true, $ne: '' }
    })
        .populate('class')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean() as IClassReview[]

    const contentSnippets = contentResults
        .map(r => r.snippet)
        .slice(0, 5)

    // Deduplicate by subjectNumber + aliases, keeping the highest-scoring instance
    const subjectToBestResult = new Map<string, { result: any; score: number }>()
    const seenSubjectNumbers = new Set<string>()

    for (const result of allSearchResults) {
        const cls = result.class
        const subjectNumber = cls.subjectNumber || ''
        const aliases = cls.aliases || []
        const score = result.score || 0

        if (seenSubjectNumbers.has(subjectNumber)) {
            const existing = subjectToBestResult.get(subjectNumber)
            if (existing && score > existing.score) {
                subjectToBestResult.set(subjectNumber, { result, score })
            } else if (existing) {
                existing.result.snippet += ` | ${result.snippet}`
            }
            continue
        }

        const seenAlias = aliases.find(alias => seenSubjectNumbers.has(alias))
        if (seenAlias) {
            const existing = subjectToBestResult.get(seenAlias)
            if (existing && score > existing.score) {
                subjectToBestResult.delete(seenAlias)
                subjectToBestResult.set(subjectNumber, { result, score })
                seenSubjectNumbers.delete(seenAlias)
                seenSubjectNumbers.add(subjectNumber)
                aliases.forEach(alias => {
                    if (alias !== seenAlias) seenSubjectNumbers.add(alias)
                })
            } else if (existing) {
                existing.result.snippet += ` | ${result.snippet}`
            }
            continue
        }

        subjectToBestResult.set(subjectNumber, { result, score })
        seenSubjectNumbers.add(subjectNumber)
        aliases.forEach(alias => seenSubjectNumbers.add(alias))
    }

    const classMap = new Map<string, IClass & { relevance: string }>()
    const sortedEntries = Array.from(subjectToBestResult.entries())
        .sort((a, b) => b[1].score - a[1].score)

    for (const [subjectNumber, { result }] of sortedEntries) {
        const cls = result.class
        const classId = cls._id.toString()
        classMap.set(classId, {
            ...cls,
            relevance: result.snippet
        })
    }

    const classes = Array.from(classMap.values())

    return {
        classes,
        reviews,
        contentSnippets
    }
}

/**
 * Build context string for LLM from search results
 */
export function buildContextString(context: {
    classes: Array<IClass & { relevance: string }>
    reviews: IClassReview[]
    contentSnippets: string[]
}): string {
    let contextStr = '# Available Course Information\n\n'

    if (context.classes.length > 0) {
        contextStr += '## Relevant Courses:\n\n'
        context.classes.forEach((cls, idx) => {
            contextStr += `${idx + 1}. **${cls.subjectNumber}: ${cls.subjectTitle}**\n`
            if (cls.aliases && cls.aliases.length > 0) {
                contextStr += `   - Also listed as: ${cls.aliases.join(', ')}\n`
            }
            contextStr += `   - Department: ${cls.department}\n`
            if (cls.description) {
                contextStr += `   - Description: ${cls.description}\n`
            }
            contextStr += `   - Units: ${cls.units}\n`
            if (cls.instructors && cls.instructors.length > 0) {
                contextStr += `   - Instructors: ${cls.instructors.join(', ')}\n`
            }
            contextStr += `   - Why relevant: ${cls.relevance}\n\n`
            if (cls.prerequisites) {
                contextStr += `   - Prerequisites: ${cls.prerequisites}\n\n`
            }
            if (cls.corequisites) {
                contextStr += `   - Corequisites: ${cls.corequisites}\n\n`
            }
        })
    } else {
        contextStr += '## Relevant Courses:\n\n'
        contextStr += 'No relevant courses found. Please try a different search query or check if all courses have been filtered out.\n\n'
    }

    if (context.reviews.length > 0) {
        contextStr += '## Reviews FROM OTHER MIT STUDENTS (NOT the student asking):\n'
        contextStr += '(Use these to understand course quality, NOT to infer what the asking student has taken)\n\n'
        context.reviews.slice(0, 5).forEach((review, idx) => {
            const cls = review.class as any
            contextStr += `${idx + 1}. Review of ${cls.subjectNumber} by another student (Rating: ${review.overallRating}/7)\n`
            contextStr += `   "${review.classComments}"\n\n`
        })
    }

    if (context.contentSnippets.length > 0) {
        contextStr += '## Course Materials:\n\n'
        context.contentSnippets.forEach((snippet, idx) => {
            contextStr += `${idx + 1}. ${snippet}\n\n`
        })
    }

    return contextStr
}
