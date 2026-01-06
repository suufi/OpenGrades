import { getESClient, ES_EMBEDDINGS_INDEX } from './esClient'
import Class from '@/models/Class'
import { IClass } from '@/types'

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
    embeddingType?: 'description' | 'reviews' | 'content'
): Promise<SearchResult[]> {
    const esClient = getESClient()
    try {
        // Build filter if embeddingType is specified
        const filter = embeddingType ? [{ term: { embeddingType } }] : []

        // Ensure num_candidates >= k to avoid ES error
        const kValue = limit * 2
        const numCandidates = Math.max(100, kValue)

        const response = await esClient.search({
            index: ES_EMBEDDINGS_INDEX,
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
        for (const hit of hits as any[]) {
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
 * Hybrid search combining vector similarity + BM25 keyword matching
 * Uses Reciprocal Rank Fusion (RRF) to combine results
 * 
 * @param queryVector - The embedding vector to search with (2560 dimensions for qwen3-embedding:4b)
 * @param queryText - The text query for BM25 matching
 * @param limit - Maximum number of results to return
 * @param embeddingType - Type of embedding to search
 * @param departmentBoosts - Optional map of department prefixes to boost scores
 */
export async function hybridSearchES(
    queryVector: number[],
    queryText: string,
    limit: number = 10,
    embeddingType?: 'description' | 'reviews' | 'content',
    departmentBoosts?: Map<string, number>
): Promise<SearchResult[]> {
    try {
        const esClient = getESClient()
        const RRF_K = 60 // RRF constant, common default
        const filter = embeddingType ? [{ term: { embeddingType } }] : []

        // 1. Get vector (kNN) results
        // Ensure num_candidates >= k to avoid ES error
        const kValue = limit * 3
        const numCandidates = Math.max(100, kValue)
        const knnResponse = await esClient.search({
            index: ES_EMBEDDINGS_INDEX,
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

        // 2. Get BM25 (text) results
        const bm25Response = await esClient.search({
            index: ES_EMBEDDINGS_INDEX,
            size: limit * 3,
            query: {
                bool: {
                    must: [
                        {
                            multi_match: {
                                query: queryText,
                                fields: ['sourceText^3', 'text^2'], // Increased sourceText boost
                                fuzziness: 'AUTO',
                                type: 'best_fields'
                            }
                        }
                    ],
                    filter: embeddingType ? [{ term: { embeddingType } }] : []
                }
            },
            _source: ['class', 'embeddingType', 'text', 'sourceText']
        })

        // Calculate RRF scores with weighted fusion
        const KNN_WEIGHT = 3.0
        const BM25_WEIGHT = 0.25
        const rrfScores = new Map<string, { score: number; hit: any }>()

        // Add kNN rankings
        knnResponse.hits.hits.forEach((hit: any, rank: number) => {
            const docId = hit._id
            const current = rrfScores.get(docId) || { score: 0, hit }
            current.score += KNN_WEIGHT * (1 / (RRF_K + rank + 1))
            rrfScores.set(docId, current)
        })

        // Add BM25 rankings only for documents already in kNN results
        bm25Response.hits.hits.forEach((hit: any, rank: number) => {
            const docId = hit._id
            if (rrfScores.has(docId)) {
                const current = rrfScores.get(docId)!
                current.score += BM25_WEIGHT * (1 / (RRF_K + rank + 1))
            }
        })

        // Sort by RRF score
        const sortedDocs = Array.from(rrfScores.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, limit * 2)

        // Fetch class data
        const classIds = sortedDocs.map(([_, data]) => data.hit._source?.class).filter(Boolean)
        const classes = await Class.find({
            _id: { $in: classIds },
            offered: true
        }).lean()

        const classMap = new Map(classes.map(c => [c._id.toString(), c]))

        // Build results with department boosting
        const results: SearchResult[] = []
        for (const [_, data] of sortedDocs) {
            const classId = data.hit._source?.class
            const classData = classMap.get(classId) as IClass | undefined

            if (classData) {
                let finalScore = data.score

                if (departmentBoosts) {
                    const dept = classData.subjectNumber?.split('.')[0] || ''
                    const boost = departmentBoosts.get(dept) || 0
                    finalScore *= (1 + boost)
                }

                results.push({
                    class: classData,
                    score: finalScore,
                    embeddingType: data.hit._source?.embeddingType || 'description',
                    snippet: (data.hit._source?.text || data.hit._source?.sourceText || '').substring(0, 200) + '...'
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
            console.error(`⚠️  Elasticsearch index "${ES_EMBEDDINGS_INDEX}" not found. Have embeddings been indexed?`)
        }

        try {
            return await vectorSearchES(queryVector, limit, embeddingType)
        } catch (fallbackError: any) {
            console.error('❌ Fallback vectorSearchES also failed:', fallbackError.message)
            return []
        }
    }
}
