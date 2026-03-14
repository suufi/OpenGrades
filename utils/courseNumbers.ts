// Matches MIT subject numbers like 6.7900, 21A.500, HST.151, 6.S191, CC.1801, and 6.100A.
const MIT_COURSE_NUMBER_SOURCE = String.raw`\b(?:\d{1,2}[A-Z]?|[A-Z]{2,4})\.[A-Z]?\d{1,4}[A-Z]?\b`

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createMitCourseNumberRegex(flags: string = 'gi'): RegExp {
    return new RegExp(MIT_COURSE_NUMBER_SOURCE, flags)
}

export function normalizeCourseNumber(value?: string | null): string {
    return (value || '').trim().toUpperCase()
}

export function extractMitCourseNumbers(text: string): string[] {
    if (!text) return []

    const matches = text.match(createMitCourseNumberRegex()) || []
    return Array.from(new Set(matches.map(normalizeCourseNumber).filter(Boolean)))
}

export function buildExactCourseNumberRegex(courseNumber: string, flags: string = 'i'): RegExp {
    return new RegExp(`\\b${escapeRegex(normalizeCourseNumber(courseNumber))}\\b`, flags)
}
