const OPEN_TAG = /<think>/i
const CLOSE_TAG_PATTERNS = [/<\/redacted_thinking>/i, /<\/think>/i]

// e.g. <|channel|>final ... <|message|>
const CHANNEL_HEADER = /(?:<\|start\|>[^<]*)?<\|channel\|>\s*([a-zA-Z_-]+)[\s\S]*?<\|message\|>/g
const HEADING_TRANSITION = /(^|\n[ \t]*\n)([ \t]{0,3}#{1,6}[ \t]+\S)/
const HR_TRANSITION = /(^|\n[ \t]*\n)[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\n+|$)/

type ThinkingParts = { think: string; visible: string }

function stripStrayTokens(text: string): string {
    return text
        .replace(/<\|start\|>\s*(?:assistant|system|developer|user|tool)\b/gi, '')
        .replace(/<\|[a-zA-Z_-]+\|>/g, '')
        .replace(/<\/?think>/gi, '')
        .replace(/<\/redacted_thinking>/gi, '')
        .trim()
}

function segmentByChannel(content: string): { channel: string | null; text: string }[] {
    const segments: { channel: string | null; text: string }[] = []
    let channel: string | null = null
    let index = 0
    for (const match of content.matchAll(CHANNEL_HEADER)) {
        if (match.index === undefined) continue
        segments.push({ channel, text: content.slice(index, match.index) })
        channel = match[1]
        index = match.index + match[0].length
    }
    segments.push({ channel, text: content.slice(index) })
    return segments
}

/** First markdown heading (kept) or HR (dropped) after an unclosed think block. */
function findAnswerTransition(text: string): { thinkEnd: number; visibleStart: number } | null {
    const heading = text.match(HEADING_TRANSITION)
    const rule = text.match(HR_TRANSITION)
    let result: { thinkEnd: number; visibleStart: number } | null = null
    if (heading && heading.index !== undefined) {
        const start = heading.index + heading[1].length
        result = { thinkEnd: heading.index, visibleStart: start }
    }
    if (rule && rule.index !== undefined && (!result || rule.index < result.thinkEnd)) {
        result = { thinkEnd: rule.index, visibleStart: rule.index + rule[0].length }
    }
    return result
}

function splitThinkTags(text: string, closedByFollowingMarker: boolean): ThinkingParts {
    const openMatch = text.match(OPEN_TAG)

    if (!openMatch || openMatch.index === undefined) {
        let closeIndex = -1
        let closeLength = 0
        for (const pattern of CLOSE_TAG_PATTERNS) {
            const match = text.match(pattern)
            if (!match || match.index === undefined) continue
            if (closeIndex === -1 || match.index < closeIndex) {
                closeIndex = match.index
                closeLength = match[0].length
            }
        }
        if (closeIndex !== -1) {
            return { think: text.slice(0, closeIndex), visible: text.slice(closeIndex + closeLength) }
        }
        return { think: '', visible: text }
    }

    const openIndex = openMatch.index
    const afterOpen = openIndex + openMatch[0].length
    const remainder = text.slice(afterOpen)

    let closeIndex = -1
    let closeLength = 0
    for (const pattern of CLOSE_TAG_PATTERNS) {
        const match = remainder.match(pattern)
        if (!match || match.index === undefined) continue
        const absoluteIndex = afterOpen + match.index
        if (closeIndex === -1 || absoluteIndex < closeIndex) {
            closeIndex = absoluteIndex
            closeLength = match[0].length
        }
    }

    if (closeIndex !== -1) {
        return {
            think: text.slice(afterOpen, closeIndex),
            visible: text.slice(0, openIndex) + text.slice(closeIndex + closeLength)
        }
    }

    const before = text.slice(0, openIndex)
    if (!closedByFollowingMarker) {
        const transition = findAnswerTransition(remainder)
        if (transition) {
            return {
                think: remainder.slice(0, transition.thinkEnd),
                visible: before + '\n\n' + remainder.slice(transition.visibleStart)
            }
        }
    }
    return { think: remainder, visible: before }
}

export function splitThinkingContent(content: string): ThinkingParts {
    if (!content) return { think: '', visible: '' }

    const segments = segmentByChannel(content)
    const thinkParts: string[] = []
    const visibleParts: string[] = []

    segments.forEach((segment, i) => {
        if (segment.channel === null) {
            const followedByMarker = i < segments.length - 1
            const { think, visible } = splitThinkTags(segment.text, followedByMarker)
            const cleanThink = stripStrayTokens(think)
            const cleanVisible = stripStrayTokens(visible)
            if (cleanThink) thinkParts.push(cleanThink)
            if (cleanVisible) visibleParts.push(cleanVisible)
        } else {
            const text = stripStrayTokens(segment.text)
            if (!text) return
            if (segment.channel.toLowerCase() === 'final') {
                visibleParts.push(text)
            } else {
                thinkParts.push(text)
            }
        }
    })

    return { think: thinkParts.join('\n\n'), visible: visibleParts.join('\n\n') }
}

/** If everything landed in think with no visible answer, promote think to visible. */
export function resolveThinkingParts(content: string): ThinkingParts {
    const split = splitThinkingContent(content)
    if (split.visible || !content) return split
    return { think: '', visible: split.think || content.trim() }
}

export function stripThinkingTags(content: string): string {
    return splitThinkingContent(content).visible
}
