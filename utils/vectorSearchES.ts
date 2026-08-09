import { getESClient, getEmbeddingsIndex } from './esClient'
import type { EmbeddingScope } from './esClient'
import Class from '@/models/Class'
import { IClass } from '@/types'
import { estypes } from '@elastic/elasticsearch'

export interface SearchResult {
    class: IClass
    score: number
    embeddingType: string
    snippet: string
}

/**
 * Vector similarity search using Elasticsearch k-NN
 * @param queryVector - The embedding vector to search with
 * @param limit - Maximum number of results to return
 * @param embeddingType - Type of embedding to search, optional ('description' | 'reviews' | 'content')
 */
export async function vectorSearchES(
    queryVector: number[],
    limit: number = 10,
    embeddingType?: 'description' | 'reviews' | 'content',
    options?: {
        scope?: EmbeddingScope
        classIds?: string[]
    }
): Promise<SearchResult[]> {
    const esClient = getESClient()
    const scope = options?.scope || 'private'
    const index = getEmbeddingsIndex(scope)
    try {
        // Build filter if embeddingType is specified
        const filter: any[] = []
        if (embeddingType) filter.push({ term: { embeddingType } })
        if (options?.classIds && options.classIds.length > 0) {
            filter.push({ terms: { class: options.classIds } })
        }

        // Ensure num_candidates >= k to avoid ES error
        const kValue = limit * 2
        const numCandidates = Math.max(100, kValue)

        const response = await esClient.search({
            index,
            knn: {
                field: 'embedding',
                query_vector: queryVector,
                k: kValue,
                num_candidates: numCandidates,
                filter
            },
            _source: ['class', 'embeddingType', 'text', 'sourceText']
        })

        // Extract class IDs from results
        const hits = response.hits.hits
        const classIds = hits.map((hit: any) => hit._source?.class).filter(Boolean)

        // Fetch full class data from MongoDB
        const classes = await Class.find({
            _id: { $in: classIds },
            offered: true
        }).lean()

        const classMap = new Map(classes.map(c => [c._id.toString(), c]))

        // Build results
        const results: SearchResult[] = []
        for (const hit of hits as estypes.SearchHit<{ class: string, embeddingType: string, text: string, sourceText: string }>[]) {
            const classId = hit._source?.class
            const classData = classMap.get(classId)

            if (classData) {
                results.push({
                    class: classData as IClass,
                    score: hit._score || 0,
                    embeddingType: hit._source?.embeddingType || 'description',
                    snippet: (hit._source?.text || hit._source?.sourceText || '').substring(0, 200) + '...'
                })
            }

            if (results.length >= limit) break
        }

        return results
    } catch (error: any) {
        console.error('ES vector search error:', error.message)
        return []
    }
}

/**
 * No longer hybrid: BM25 was dropped, so this is k-NN plus department boosting.
 * queryText is kept only so existing callers don't have to change.
 */
export async function hybridSearchES(
    queryVector: number[],
    _queryText: string,
    limit: number = 10,
    embeddingType?: 'description' | 'reviews' | 'content',
    departmentBoosts?: Map<string, number>,
    options?: {
        scope?: EmbeddingScope
        classIds?: string[]
    }
): Promise<SearchResult[]> {
    try {
        const esClient = getESClient()
        const scope = options?.scope || 'private'
        const index = getEmbeddingsIndex(scope)
        const filter: any[] = []
        if (embeddingType) filter.push({ term: { embeddingType } })
        if (options?.classIds && options.classIds.length > 0) {
            filter.push({ terms: { class: options.classIds } })
        }

        // Ensure num_candidates >= k to avoid ES error
        const kValue = limit * 3
        const numCandidates = Math.max(100, kValue)
        const knnResponse = await esClient.search({
            index,
            size: kValue,
            knn: {
                field: 'embedding',
                query_vector: queryVector,
                k: kValue,
                num_candidates: numCandidates,
                filter
            },
            _source: ['class', 'embeddingType', 'text', 'sourceText']
        })

        const sortedDocs = knnResponse.hits.hits
            .slice(0, limit * 2)

        // Fetch class data
        const classIds = sortedDocs.map((hit: any) => hit._source?.class).filter(Boolean)
        const classes = await Class.find({
            _id: { $in: classIds },
            offered: true
        }).lean()

        const classMap = new Map(classes.map(c => [c._id.toString(), c]))

        // Build results with department boosting
        const results: SearchResult[] = []
        for (const hit of sortedDocs as any[]) {
            const classId = hit._source?.class
            const classData = classMap.get(classId) as IClass | undefined

            if (classData) {
                let finalScore = hit._score || 0

                if (departmentBoosts) {
                    const dept = classData.subjectNumber?.split('.')[0] || ''
                    const boost = departmentBoosts.get(dept) || 0
                    finalScore *= (1 + boost)
                }

                results.push({
                    class: classData,
                    score: finalScore,
                    embeddingType: hit._source?.embeddingType || 'description',
                    snippet: (hit._source?.text || hit._source?.sourceText || '').substring(0, 200) + '...'
                })
            }

            if (results.length >= limit) break
        }

        // Re-sort by final score (after boosting)
        return results.sort((a, b) => b.score - a.score)

    } catch (error: any) {
        console.error('❌ ES hybrid search error:', error.message)
        console.error('   Error type:', error.constructor.name)
        console.error('   Stack:', error.stack)

        if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
            console.error('⚠️  Elasticsearch connection failed. Is Elasticsearch running?')
        }

        if (error.message?.includes('index_not_found') || error.message?.includes('no such index')) {
            console.error(`⚠️  Elasticsearch embeddings index for scope "${options?.scope || 'private'}" not found. Have embeddings been indexed?`)
        }

        try {
            return await vectorSearchES(queryVector, limit, embeddingType, options)
        } catch (fallbackError: any) {
            console.error('❌ Fallback vectorSearchES also failed:', fallbackError.message)
            return []
        }
    }
}
