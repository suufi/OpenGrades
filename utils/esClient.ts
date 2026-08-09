import { Client } from '@elastic/elasticsearch'

const ES_URL = process.env.ELASTIC_SEARCH_URI || 'https://localhost:9200'

let esClient: Client | null = null

export function getESClient(): Client {
    if (!esClient) {
        esClient = new Client({
            node: ES_URL,
        })
    }
    return esClient
}

export const ES_PUBLIC_EMBEDDINGS_INDEX =
    process.env.ELASTICSEARCH_PUBLIC_EMBEDDINGS_INDEX || 'opengrades_prod.courseembeddings_public'

export const ES_PRIVATE_EMBEDDINGS_INDEX =
    process.env.ELASTICSEARCH_PRIVATE_EMBEDDINGS_INDEX || process.env.ELASTICSEARCH_EMBEDDINGS_INDEX || 'opengrades_prod.courseembeddings_private'

export const ES_PUBLIC_EMBEDDING_DIMENSIONS =
    Number(process.env.OPENAI_PUBLIC_EMBEDDING_DIMENSIONS || 3072)

export const ES_PRIVATE_EMBEDDING_DIMENSIONS = 2560

export const ES_EMBEDDINGS_INDEX = ES_PRIVATE_EMBEDDINGS_INDEX
export const ES_EMBEDDING_DIMENSIONS = ES_PRIVATE_EMBEDDING_DIMENSIONS

export type EmbeddingScope = 'public' | 'private'

export function getEmbeddingsIndex(scope: EmbeddingScope): string {
    return scope === 'public' ? ES_PUBLIC_EMBEDDINGS_INDEX : ES_PRIVATE_EMBEDDINGS_INDEX
}

export function getEmbeddingDimensions(scope: EmbeddingScope): number {
    return scope === 'public' ? ES_PUBLIC_EMBEDDING_DIMENSIONS : ES_PRIVATE_EMBEDDING_DIMENSIONS
}
