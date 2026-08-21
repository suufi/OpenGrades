import { parseRegistrarIcs } from './icalParser.ts'
import { decodeHtmlEntitiesDeep } from './htmlEntities.ts'
import type { RegistrarCalendarEvent } from './icalParser.ts'

export const REGISTRAR_ICS_URL = 'https://registrar.mit.edu/calendar-ical/current/all/all/calendar.ics'
export const REGISTRAR_HTML_URL = 'https://registrar.mit.edu/calendar'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000

export function parseRegistrarHtmlEventTexts(html: string): Map<string, string[]> {
    const map = new Map<string, string[]>()
    const anchors = [...html.matchAll(/calendar-link-(\d{4}-\d{2}-\d{2})/g)]
        .map(m => ({ date: m[1], index: m.index ?? 0 }))

    anchors.forEach((anchor, i) => {
        const segment = html.slice(anchor.index, anchors[i + 1]?.index ?? html.length)
        for (const p of segment.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
            const text = decodeHtmlEntitiesDeep(p[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
            if (text) {
                const list = map.get(anchor.date) ?? []
                list.push(text)
                map.set(anchor.date, list)
            }
        }
    })

    return map
}

export function enrichTruncatedSummaries(
    events: RegistrarCalendarEvent[],
    fullTextsByDate: Map<string, string[]>
): RegistrarCalendarEvent[] {
    return events.map((event) => {
        if (!/(\.\.\.|…)\s*$/.test(event.summary)) return event
        const prefix = event.summary
            .replace(/(\.\.\.|…)\s*$/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
        if (!prefix) return event
        const full = (fullTextsByDate.get(event.date) ?? [])
            .find(t => t.toLowerCase().startsWith(prefix))
        return full ? { ...event, summary: full } : event
    })
}

export interface RegistrarCalendarCache {
    events: RegistrarCalendarEvent[]
    fetchedAt: number
    enriched: boolean
}

const CACHE_KEY = Symbol.for('opengrades.registrarCalendarCache.v3')
const UNENRICHED_RETRY_MS = 10 * 60 * 1000

function getCache(): RegistrarCalendarCache | undefined {
    return (globalThis as { [CACHE_KEY]?: RegistrarCalendarCache })[CACHE_KEY]
}

function setCache(cache: RegistrarCalendarCache): void {
    (globalThis as { [CACHE_KEY]?: RegistrarCalendarCache })[CACHE_KEY] = cache
}

export async function loadRegistrarCalendar(): Promise<RegistrarCalendarCache> {
    const cached = getCache()
    const cacheAge = cached ? Date.now() - cached.fetchedAt : Infinity
    if (cached && cacheAge < (cached.enriched ? CACHE_TTL_MS : UNENRICHED_RETRY_MS)) {
        return cached
    }

    try {
        const headers = { 'User-Agent': 'MIT-OpenGrades (academic calendar preview)' }
        const [icsResponse, htmlText] = await Promise.all([
            fetch(REGISTRAR_ICS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers }),
    
            fetch(REGISTRAR_HTML_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers })
                .then(r => (r.ok ? r.text() : null))
                .catch(() => null),
        ])
        if (!icsResponse.ok) throw new Error(`Registrar feed returned ${icsResponse.status}`)
        let events = parseRegistrarIcs(await icsResponse.text())
        if (events.length === 0) throw new Error('Registrar feed parsed to zero events')
        let enriched = false
        if (htmlText) {
            try {
                events = enrichTruncatedSummaries(events, parseRegistrarHtmlEventTexts(htmlText))
                enriched = true
            } catch (error) {
                console.error('Registrar HTML enrichment failed; keeping feed summaries:', error)
            }
        } else {
            console.error('Registrar HTML calendar unavailable; serving feed summaries and retrying soon')
        }
        const fresh = { events, fetchedAt: Date.now(), enriched }
        setCache(fresh)
        return fresh
    } catch (error) {
        if (cached) return cached
        throw error
    }
}

export function easternIsoDate(offsetDays = 0): string {
    return new Date(Date.now() + offsetDays * 24 * 3600 * 1000)
        .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
