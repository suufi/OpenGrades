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

const OLLAMA_HOST = process.env.OLLAMA_BASE_URL || 'https://llms-dev-1.mit.edu'

const HEALTH_TIMEOUT_MS = 5_000
const EMBEDDING_TIMEOUT_MS = 30_000
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || 120_000)

function makeOllama(timeoutMs: number, withAuth: boolean = true): Ollama {
    const apiKey = process.env.OLLAMA_API_KEY
    return new Ollama({
        host: OLLAMA_HOST,
        headers: withAuth && apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
        fetch: (input: any, init?: any) =>
            fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) }),
    })
}

const ollama = makeOllama(HEALTH_TIMEOUT_MS, false)

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

    const ollamaWithAuth = makeOllama(EMBEDDING_TIMEOUT_MS)

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
        host: OLLAMA_HOST,
        headers: { Authorization: 'Bearer ' + apiKey },
    }) : new Ollama({ host: OLLAMA_HOST, headers: {} })

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
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    timeoutMs: number = CHAT_TIMEOUT_MS
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

    const ollamaWithAuth = makeOllama(timeoutMs)

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

const PARLEY_BASE_URL = process.env.PARLEY_BASE_URL || 'https://parley.api.mit.edu'
const PARLEY_DEFAULT_MODEL = 'claude-sonnet-5'
const PARLEY_ANTHROPIC_VERSION = '2023-06-01'
const PARLEY_MAX_TOKENS = Number(process.env.PARLEY_MAX_TOKENS || 4096)

type ChatMessage = {
    role: 'system' | 'user' | 'assistant'
    content: string
}

interface ParleyMessagesResponse {
    content?: Array<{
        type?: string
        text?: string
    }> | string
    usage?: {
        input_tokens?: number
        output_tokens?: number
    }
}

function getParleyMessagesUrl(): string {
    const baseUrl = PARLEY_BASE_URL.replace(/\/+$/, '')
    return baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`
}

function toAnthropicMessages(messages: ChatMessage[]): {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
} {
    const system = messages
        .filter(message => message.role === 'system')
        .map(message => message.content)
        .filter(Boolean)
        .join('\n\n')

    const conversation = messages
        .filter((message): message is ChatMessage & { role: 'user' | 'assistant' } => message.role !== 'system')
        .map(message => ({ role: message.role, content: message.content }))

    if (conversation.length === 0) {
        throw new Error('Parley Messages API requires at least one user or assistant message')
    }

    return {
        ...(system ? { system } : {}),
        messages: conversation
    }
}

function extractParleyMessageText(data: ParleyMessagesResponse): string {
    if (typeof data.content === 'string') return data.content
    if (!Array.isArray(data.content)) return ''

    return data.content
        .filter(block => block?.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('')
}

function parseParleyJsonResponse(raw: string, contentType: string): any {
    const trimmed = raw.trim()
    if (
        !contentType.includes('application/json') ||
        trimmed.startsWith('<!DOCTYPE') ||
        trimmed.startsWith('<html')
    ) {
        throw new Error(
            'Parley returned an HTML page instead of an API response. Check your API key at platform.parley.mit.edu and ensure OpenGrades is using the current Parley API endpoint.'
        )
    }

    try {
        return JSON.parse(trimmed)
    } catch {
        throw new Error(`Parley returned invalid JSON: ${trimmed.slice(0, 180)}`)
    }
}

export const PARLEY_MODELS = [
    { value: 'llama-4-maverick', label: 'Llama 4 Maverick', group: 'Free', inputRate: '$0', outputRate: '$0' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano', group: 'Budget', inputRate: '$0.20', outputRate: '$1.25' },
    { value: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash', group: 'Budget', inputRate: '$0.50', outputRate: '$3' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini', group: 'Budget', inputRate: '$0.75', outputRate: '$4.50' },
    { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', group: 'Budget', inputRate: '$1', outputRate: '$5' },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Recommended)', group: 'Recommended', inputRate: '$2', outputRate: '$10' },
    { value: 'gpt-5.4', label: 'GPT-5.4', group: 'Standard', inputRate: '$2.50', outputRate: '$15' },
    { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', group: 'Standard', inputRate: '$3', outputRate: '$15' },
    { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', group: 'Standard', inputRate: '$4', outputRate: '$18' },
] as const

export type ParleyModelId = typeof PARLEY_MODELS[number]['value']

export interface ParleyChatResult {
    text: string
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
    }
}

export async function parleyChatCompletion(
    messages: ChatMessage[],
    apiKey: string,
    model?: string
): Promise<ParleyChatResult> {
    const selectedModel = model || PARLEY_DEFAULT_MODEL
    const anthropicRequest = toAnthropicMessages(messages)

    const response = await fetch(getParleyMessagesUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': PARLEY_ANTHROPIC_VERSION
        },
        body: JSON.stringify({
            model: selectedModel,
            max_tokens: Number.isFinite(PARLEY_MAX_TOKENS) && PARLEY_MAX_TOKENS > 0
                ? PARLEY_MAX_TOKENS
                : 4096,
            ...anthropicRequest,
            stream: false
        })
    })

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        if (response.status === 401 || response.status === 403) {
            throw new Error('Invalid or expired Parley API key. Please check your key at https://platform.parley.mit.edu')
        }
        if (response.status === 429) {
            throw new Error('Parley rate limit exceeded. Please wait a moment and try again.')
        }
        let errorMessage = errorBody || response.statusText
        try {
            const parsedError = JSON.parse(errorBody)
            errorMessage = parsedError?.error?.message || parsedError?.message || errorMessage
        } catch {
        }
        throw new Error(`Parley API error (${response.status}): ${errorMessage}`)
    }

    const raw = await response.text()
    const data = parseParleyJsonResponse(raw, response.headers.get('content-type') || '') as ParleyMessagesResponse
    const text = extractParleyMessageText(data)
    const usage = data?.usage

    if (!text) {
        throw new Error('Parley Messages API returned no text content')
    }

    return {
        text,
        usage: usage ? {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
        } : undefined
    }
}

export async function chatCompletionWithProvider(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
        useParley?: boolean
        parleyApiKey?: string
        parleyModel?: string
        onParleyFallback?: (error: Error) => void
    } = {}
): Promise<ParleyChatResult & { providerUsed: 'parley' | 'default' }> {
    if (options.useParley && options.parleyApiKey) {
        try {
            const result = await parleyChatCompletion(messages, options.parleyApiKey, options.parleyModel)
            return { ...result, providerUsed: 'parley' }
        } catch (error) {
            const parleyError = error instanceof Error ? error : new Error(String(error))
            options.onParleyFallback?.(parleyError)
            const text = await chatCompletion(messages)
            return { text, providerUsed: 'default' }
        }
    }

    const text = await chatCompletion(messages)
    return { text, providerUsed: 'default' }
}
