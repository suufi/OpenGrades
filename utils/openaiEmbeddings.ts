const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'

export const OPENAI_PUBLIC_EMBEDDING_MODEL =
    process.env.OPENAI_PUBLIC_EMBEDDING_MODEL || 'text-embedding-3-large'

export const OPENAI_PUBLIC_EMBEDDING_DIMENSIONS =
    Number(process.env.OPENAI_PUBLIC_EMBEDDING_DIMENSIONS || 3072)

function getOpenAIApiKey(): string {
    const key = process.env.OPENAI_API_KEY
    if (!key) {
        throw new Error('OPENAI_API_KEY is required for public embedding generation')
    }
    return key
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function requestOpenAIEmbeddings(input: string[]): Promise<number[][]> {
    const key = getOpenAIApiKey()
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: OPENAI_PUBLIC_EMBEDDING_MODEL,
            input,
            dimensions: OPENAI_PUBLIC_EMBEDDING_DIMENSIONS
        })
    })

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`OpenAI embeddings error (${response.status}): ${body}`)
    }

    const json = await response.json()
    if (!json?.data || !Array.isArray(json.data)) {
        throw new Error('OpenAI embeddings response missing data array')
    }

    const byIndex = [...json.data]
        .sort((a: any, b: any) => (a.index || 0) - (b.index || 0))
        .map((item: any) => item.embedding as number[])

    return byIndex
}

async function withRetries<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    let lastError: any
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn()
        } catch (error: any) {
            lastError = error
            if (attempt === retries) break
            const backoffMs = Math.min(4000, 400 * (2 ** attempt)) + Math.floor(Math.random() * 150)
            await sleep(backoffMs)
        }
    }
    throw lastError
}

export async function generateOpenAIEmbedding(text: string): Promise<number[]> {
    const embeddings = await withRetries(() => requestOpenAIEmbeddings([text]), 3)
    return embeddings[0]
}

export async function generateOpenAIEmbeddingsBatch(
    texts: string[],
    options?: {
        batchSize?: number
        retries?: number
    }
): Promise<number[][]> {
    const batchSize = Math.max(1, options?.batchSize || 32)
    const retries = options?.retries ?? 3

    const results: number[][] = []
    for (let i = 0; i < texts.length; i += batchSize) {
        const chunk = texts.slice(i, i + batchSize)
        const chunkEmbeddings = await withRetries(() => requestOpenAIEmbeddings(chunk), retries)
        results.push(...chunkEmbeddings)
    }
    return results
}

export async function generatePublicQueryEmbedding(query: string): Promise<number[]> {
    return generateOpenAIEmbedding(query)
}
