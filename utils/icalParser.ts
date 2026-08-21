/**
 * Minimal iCalendar parser for the MIT Registrar academic calendar feed
 * https://registrar.mit.edu/calendar-ical/current/all/all/calendar.ics
 */

import { decodeHtmlEntitiesDeep } from './htmlEntities.ts'

export interface RegistrarCalendarEvent {
    uid: string
    date: string
    endDate?: string
    summary: string
}

function unfoldLines(ics: string): string[] {
    const lines = ics.split(/\r?\n/)
    const out: string[] = []
    for (const line of lines) {
        if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
            out[out.length - 1] += line.slice(1)
        } else {
            out.push(line)
        }
    }
    return out
}

function unescapeIcsText(value: string): string {
    return value
        .replace(/\\n/gi, ' ')
        .replace(/\\([,;\\])/g, '$1')
        .trim()
}


/** Pulls YYYY-MM-DD out of an ICS date or datetime value (e.g. 20260911). */
function toIsoDate(icsValue: string): string | null {
    const match = icsValue.trim().match(/^(\d{4})(\d{2})(\d{2})/)
    if (!match) return null
    return `${match[1]}-${match[2]}-${match[3]}`
}

/** Previous calendar day of a YYYY-MM-DD string, computed in UTC to avoid DST drift. */
function previousDay(isoDate: string): string {
    const [y, m, d] = isoDate.split('-').map(Number)
    const utc = new Date(Date.UTC(y, m - 1, d) - 24 * 3600 * 1000)
    const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(utc.getUTCDate()).padStart(2, '0')
    return `${utc.getUTCFullYear()}-${mm}-${dd}`
}

export function parseRegistrarIcs(ics: string): RegistrarCalendarEvent[] {
    const events: RegistrarCalendarEvent[] = []
    let current: { uid?: string; date?: string; endExclusive?: string; summary?: string } | null = null

    for (const line of unfoldLines(ics)) {
        if (line === 'BEGIN:VEVENT') {
            current = {}
            continue
        }
        if (line === 'END:VEVENT') {
            if (current?.date && current.summary) {
                const event: RegistrarCalendarEvent = {
                    uid: current.uid ?? `${current.date}-${current.summary.slice(0, 24)}`,
                    date: current.date,
                    summary: current.summary,
                }
                if (current.endExclusive) {
                    const inclusiveEnd = previousDay(current.endExclusive)
                    if (inclusiveEnd > current.date) event.endDate = inclusiveEnd
                }
                events.push(event)
            }
            current = null
            continue
        }
        if (!current) continue

        const sep = line.indexOf(':')
        if (sep === -1) continue
        const nameWithParams = line.slice(0, sep)
        const value = line.slice(sep + 1)
        const name = nameWithParams.split(';')[0].toUpperCase()

        switch (name) {
            case 'UID':
                current.uid = value.trim()
                break
            case 'DTSTART':
                current.date = toIsoDate(value) ?? undefined
                break
            case 'DTEND':
                current.endExclusive = toIsoDate(value) ?? undefined
                break
            case 'SUMMARY':
                current.summary = decodeHtmlEntitiesDeep(unescapeIcsText(value))
                break
        }
    }

    return events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid))
}

/** Local calendar date of `d` as YYYY-MM-DD. */
function localIsoDate(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
}

/** Events from `from`'s calendar day through `weeks` weeks out, inclusive. */
export function filterUpcoming(
    events: RegistrarCalendarEvent[],
    from: Date,
    weeks: number
): RegistrarCalendarEvent[] {
    const start = localIsoDate(from)
    const end = localIsoDate(new Date(from.getTime() + weeks * 7 * 24 * 3600 * 1000))
    return events.filter(e => e.date >= start && e.date <= end)
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-01" -> "Sep 1", with no Date construction */
export function formatEventDate(isoDate: string): string {
    const [, m, d] = isoDate.split('-').map(Number)
    return `${MONTH_NAMES[m - 1]} ${d}`
}
