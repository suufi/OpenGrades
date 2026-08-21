import { decode } from 'html-entities'

export function decodeHtmlEntities(text: string | null | undefined): string {
    if (!text) return ''
    return decode(text).replace(/\u00a0/g, ' ')
}

export function decodeHtmlEntitiesDeep(text: string | null | undefined, maxPasses = 3): string {
    let current = decodeHtmlEntities(text)
    for (let i = 1; i < maxPasses; i++) {
        const next = decodeHtmlEntities(current)
        if (next === current) break
        current = next
    }
    return current
}
