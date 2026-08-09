import { decode } from 'html-entities'

/** Strip all HTML tags (strict), then decode entities. */
export function removeTags(content: string): string {
    if (!content) return ''
    const stripped = content.replace(/<[^>]*>/g, '')
    return decode(stripped).trim()
}

/** Allow basic formatting tags; strip scripts and dangerous attrs. */
export function sanitizeHtml(content: string): string {
    if (!content) return ''
    let out = content
    out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    out = out.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    out = out.replace(/javascript:/gi, '')
    return out.trim()
}

/** Plain text for Mongo description / search (tags removed). */
export function plainTextFromHtml(content: string): string {
    return removeTags(sanitizeHtml(content))
}
