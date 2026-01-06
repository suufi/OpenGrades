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

export const ES_EMBEDDINGS_INDEX = process.env.ELASTICSEARCH_EMBEDDINGS_INDEX || 'opengrades_prod.courseembeddings'

// Embedding dimensions for qwen3-embedding:4b (must match index mapping)
export const ES_EMBEDDING_DIMENSIONS = 2560
