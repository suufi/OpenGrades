import { Ollama } from 'ollama'
import { embedMany, streamText } from 'ai'
import { google } from '@ai-sdk/google'

/**
 * LLM Provider Configuration
 * 
 * Current setup:
 * - Chat: Configurable via LLM_CHAT_PROVIDER env var ('ollama' or 'gemini')
 *   - Ollama: Uses base ollama package (MIT server doesn't support AI SDK v2)
 *   - Gemini: Uses AI SDK (supports v2, much faster)
 * - Embeddings: ALWAYS uses qwen3-embedding:4b via Ollama (2560 dimensions)
 *   - Best MRR (0.626) in evaluation, runs locally on MIT infrastructure
 * 
 * To switch chat to Gemini, set:
 *   LLM_CHAT_PROVIDER=gemini
 *   GOOGLE_GENERATIVE_AI_API_KEY=<your-key>
 */

const CHAT_PROVIDER = process.env.LLM_CHAT_PROVIDER || 'ollama'

const ollama = new Ollama({
    host: process.env.OLLAMA_BASE_URL || 'https://llms-dev-1.mit.edu',
    headers: {},
})

const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'gpt-oss:20b'
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash'

export const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:4b'
export const OLLAMA_EMBEDDING_DIMENSIONS = 2560
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'

/**
 * Generate embedding using Ollama qwen3-embedding:4b
 * Returns 2560-dimensional vector (best MRR in evaluation)
 * 
 * This is used for ALL embeddings to keep data on MIT infrastructure
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OLLAMA_API_KEY
    if (!apiKey) {
        throw new Error('OLLAMA_API_KEY environment variable is not set. Please set it in your .env file.')
    }

    const ollamaWithAuth = new Ollama({
        host: process.env.OLLAMA_BASE_URL || 'https://llms-dev-1.mit.edu',
        headers: { Authorization: 'Bearer ' + apiKey },
    })

    try {
        const response = await ollamaWithAuth.embeddings({
            model: OLLAMA_EMBEDDING_MODEL,
            prompt: text
        })

        return response.embedding
    } catch (error: any) {
        const ollamaHost = process.env.OLLAMA_BASE_URL || 'https://llms-dev-1.mit.edu'

        if (error.status === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
            throw new Error(`Ollama API 401 Unauthorized: Authentication failed. Check:
1. OLLAMA_API_KEY environment variable is set correctly
2. The API key has proper permissions for the embeddings endpoint
3. The API key format is correct (should be a valid Bearer token)
Server: ${ollamaHost}, Model: ${OLLAMA_EMBEDDING_MODEL}
Original error: ${error.message || error}`)
        }

        if (error.status === 405 || error.message?.includes('405') || error.message?.includes('Method Not Allowed')) {
            throw new Error(`Ollama API 405 Error: The embeddings endpoint may not be available. The server at ${ollamaHost} is an Open WebUI proxy. Ensure:
1. The Ollama backend supports embeddings (model: ${OLLAMA_EMBEDDING_MODEL})
2. The Open WebUI is configured to proxy the /api/embeddings endpoint
3. The API key has proper permissions
Original error: ${error.message || error}`)
        }

        throw error
    }
}

/**
 * Generate embeddings for student reviews
 * 
 * @param texts - Array of review texts to embed
 * @returns Array of 2560-dimensional embedding vectors
 */
export async function generateReviewEmbeddings(texts: string[]): Promise<number[][]> {
    const promises = texts.map(text => generateEmbedding(text))
    return Promise.all(promises)
}

/**
 * Generate embeddings in batch with rate limiting
 * 
 * Uses Ollama qwen3-embedding:4b for all embeddings (best MRR in evaluation)
 * All data stays on MIT infrastructure
 * 
 * Processes with limited concurrency to avoid overwhelming the server
 * 
 * @param texts - Array of texts to embed
 * @param concurrency - Max concurrent requests (default: 5)
 * @returns Array of 2560-dimensional embedding vectors
 */
export async function generateEmbeddingsBatch(texts: string[], concurrency: number = 5): Promise<number[][]> {
    const results: number[][] = []

    for (let i = 0; i < texts.length; i += concurrency) {
        const chunk = texts.slice(i, i + concurrency)
        const chunkPromises = chunk.map(async (text, idx) => {
            try {
                return await generateEmbedding(text)
            } catch (error: any) {
                console.error(`Error generating embedding for text at index ${i + idx}:`, error.message)
                throw error
            }
        })

        const chunkResults = await Promise.all(chunkPromises)
        results.push(...chunkResults)

        if (i + concurrency < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 50))
        }
    }

    return results
}

/**
 * Generate embedding for user queries (RAG search)
 * 
 * Uses Ollama qwen3-embedding:4b to match all embeddings in ES
 * All embeddings now use the same model for consistency
 * 
 * @param text - Query text to embed
 * @returns Embedding vector (2560 dimensions)
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
    return generateEmbedding(text)
}

/**
 * Stream chat completions using Ollama base package
 * Yields content chunks as they arrive
 * 
 * NOTE: Uses base ollama package (not AI SDK) because local server doesn't support v2
 */
export async function* streamChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): AsyncGenerator<{ type: 'thinking' | 'content'; text: string; isFull: boolean }> {
    if (CHAT_PROVIDER === 'gemini' && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.log(`Using gemini (${GEMINI_CHAT_MODEL}) for chat completion`)
        try {
            const result = await streamText({
                model: google(GEMINI_CHAT_MODEL),
                messages,
            })

            for await (const text of result.textStream) {
                yield { type: 'content', text, isFull: true }
            }
            return
        } catch (error) {
            console.error('Error with gemini:', error)
            throw new Error(`Gemini chat completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    console.log(`Using ollama (${OLLAMA_CHAT_MODEL}) for chat completion`)

    const apiKey = process.env.OLLAMA_API_KEY
    const ollamaWithAuth = apiKey ? new Ollama({
        host: process.env.OLLAMA_BASE_URL || 'https://llms-dev-1.mit.edu',
        headers: { Authorization: 'Bearer ' + apiKey },
    }) : ollama

    try {
        const response = await ollamaWithAuth.chat({
            model: OLLAMA_CHAT_MODEL,
            messages,
            stream: true,
        })

        for await (const part of response) {
            if (part.message?.content) {
                yield { type: 'content', text: part.message.content, isFull: false }
            }
        }
    } catch (error) {
        console.error('Error with ollama:', error)
        throw new Error(`Ollama chat completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

/**
 * Non-streaming chat completion
 * Returns the full response text
 */
export async function chatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<string> {
    if (CHAT_PROVIDER === 'gemini' && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.log(`Using gemini (${GEMINI_CHAT_MODEL}) for chat completion`)
        try {
            const result = await streamText({
                model: google(GEMINI_CHAT_MODEL),
                messages,
            })
            return await result.text
        } catch (error) {
            console.error('Error with gemini:', error)
            throw new Error(`Gemini chat completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    console.log(`Using ollama (${OLLAMA_CHAT_MODEL}) for chat completion`)

    const apiKey = process.env.OLLAMA_API_KEY
    const ollamaWithAuth = apiKey ? new Ollama({
        host: process.env.OLLAMA_BASE_URL || 'https://llms-dev-1.mit.edu',
        headers: { Authorization: 'Bearer ' + apiKey },
    }) : ollama

    try {
        const response = await ollamaWithAuth.chat({
            model: OLLAMA_CHAT_MODEL,
            messages,
            stream: false,
        })

        return response.message.content
    } catch (error) {
        console.error('Error with ollama:', error)
        throw new Error(`Ollama chat completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

/**
 * Return server health status
 */
export async function checkOllamaHealth(): Promise<boolean> {
    try {
        await ollama.version()
        return true
    } catch (error) {
        console.error('Ollama health check failed:', error)
        return false
    }
}
