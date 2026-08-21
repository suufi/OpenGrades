import { chatCompletion } from './ollama'

export async function generateOptimizedQuery(userQuery: string): Promise<string> {
    const systemPrompt = `You are a search query optimizer for an MIT course catalog.
Your task is to transform a user's natural language question into an optimized search query that will work well with semantic vector search.

Guidelines:
1. Preserve the user's intent and key requirements
2. Expand with relevant synonyms and related terms
3. Add context-specific keywords (e.g., "HASS" for humanities/arts queries)
4. Include course attributes when relevant (GIR, HASS, CI-H, etc.)
5. Keep it concise but comprehensive (2-4 key phrases)
6. Focus on course content, topics, and learning outcomes

Examples:
- "easy HASS classes for engineers" → "HASS humanities arts social sciences easy introductory courses for engineering students"
- "machine learning courses" → "machine learning artificial intelligence neural networks deep learning data science"
- "writing classes" → "writing communication CI-H expository writing creative writing"
- "calculus" → "calculus mathematics differential equations mathematical analysis"

Return ONLY the optimized query, no explanation.`

    try {
        const optimizedQuery = await chatCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `User query: "${userQuery}"\n\nOptimized search query:` }
        ], 8_000)

        const cleaned = (optimizedQuery || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .trim()
            .replace(/^["']|["']$/g, '')

        const lastLine = cleaned
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .slice(-1)[0]

        return (lastLine || userQuery).trim()
    } catch (error) {
        console.error('Error generating optimized query:', error)
        return userQuery
    }
}

export async function generateQueryVariations(userQuery: string): Promise<string[]> {
    const optimized = await generateOptimizedQuery(userQuery)
    return [userQuery, optimized]
}


