export type SearchConversationTurn = {
    role: 'user' | 'assistant'
    content: string
}

export type ResolvedSearchIntent = {
    searchQuery: string
    harvardOnly: boolean
    usedConversationContext: boolean
}

const AFFIRMATIVE_FOLLOW_UP = /^(?:yes|yeah|yep|yup|sure|okay|ok|please|please do|do that|go ahead|sounds good|i would|i'd like that|absolutely|definitely)[.!\s]*$/i
const CONTEXT_DEPENDENT_FOLLOW_UP = /^(?:yes|no|why|how so|which one|what about (?:those|them|that)|show me|tell me more|more|anything else|the first one|the second one|compare them)[.!?\s]*$/i

export function normalizeConversationHistory(value: unknown): SearchConversationTurn[] {
    if (!Array.isArray(value)) return []

    return value
        .filter((turn): turn is SearchConversationTurn => (
            Boolean(turn) &&
            (turn.role === 'user' || turn.role === 'assistant') &&
            typeof turn.content === 'string' &&
            Boolean(turn.content.trim())
        ))
        .slice(-8)
        .map(turn => ({
            role: turn.role,
            content: turn.content.trim().slice(-6000)
        }))
}

export function resolveContextualSearchIntent(
    query: string,
    history: SearchConversationTurn[]
): ResolvedSearchIntent {
    const trimmedQuery = query.replace(/\s+/g, ' ').trim()
    const lastAssistant = [...history].reverse().find(turn => turn.role === 'assistant')?.content || ''
    const priorUserQuery = [...history].reverse().find(turn => turn.role === 'user')?.content || ''
    const assistantQuestion = findLastQuestion(lastAssistant)
    const assistantOfferedHarvard = /\b(?:harvard|cross-registration)\b/i.test(assistantQuestion || lastAssistant)
    const isAffirmative = AFFIRMATIVE_FOLLOW_UP.test(trimmedQuery)

    if (isAffirmative && assistantOfferedHarvard) {
        const topic = extractHarvardOfferTopic(assistantQuestion || lastAssistant) || compactTopic(priorUserQuery)
        return {
            searchQuery: topic
                ? `Harvard cross-registration courses related to ${topic}`
                : 'Harvard cross-registration course options',
            harvardOnly: true,
            usedConversationContext: true
        }
    }

    const explicitlyMentionsHarvard = /\b(?:harvard|cross-registration)\b/i.test(trimmedQuery)
    const asksForBothInstitutions = /\b(?:both|compare|versus|vs\.?|MIT\s+and\s+Harvard|Harvard\s+and\s+MIT)\b/i.test(trimmedQuery)
    if (explicitlyMentionsHarvard) {
        return {
            searchQuery: trimmedQuery,
            harvardOnly: !asksForBothInstitutions,
            usedConversationContext: false
        }
    }

    const wordCount = trimmedQuery.split(/\s+/).filter(Boolean).length
    const dependsOnContext = CONTEXT_DEPENDENT_FOLLOW_UP.test(trimmedQuery) || wordCount <= 3
    if (dependsOnContext && history.length > 0) {
        const contextParts = [compactTopic(priorUserQuery), assistantQuestion, trimmedQuery]
            .filter(Boolean)
        return {
            searchQuery: contextParts.join('. '),
            harvardOnly: false,
            usedConversationContext: true
        }
    }

    return {
        searchQuery: trimmedQuery,
        harvardOnly: false,
        usedConversationContext: false
    }
}

function findLastQuestion(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim()
    if (!normalized) return ''

    const questions = normalized.match(/[^?]+\?/g)
    return questions?.at(-1)?.trim() || ''
}

function extractHarvardOfferTopic(question: string): string {
    const normalized = question.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim()
    const relatedMatch = normalized.match(/\brelated to\s+(.+?)(?:\s+as well)?\s*\?$/i)
    if (relatedMatch?.[1]) return relatedMatch[1].trim()

    return normalized
        .replace(/^.*?\b(?:search|find|show|explore)\s+(?:specifically\s+)?(?:for\s+)?/i, '')
        .replace(/^(?:more\s+)?harvard\s+(?:cross-registration\s+)?(?:courses|options)\s*/i, '')
        .replace(/\?$/, '')
        .trim()
}

function compactTopic(content: string): string {
    const normalized = content.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim()
    if (!normalized) return ''
    return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized
}
