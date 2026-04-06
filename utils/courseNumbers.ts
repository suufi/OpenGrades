// Matches MIT subject numbers like 6.7900, 21A.500, HST.151, 6.S191, CC.1801, and 6.100A.
const MIT_SUBJECT_LEFT = String.raw`(?:\d{1,2}[A-Z]?|[A-Z]{2,4})`
const MIT_SUBJECT_RIGHT_STRICT = String.raw`[A-Z]?\d{1,4}[A-Z]?`

const MIT_COURSE_NUMBER_SOURCE = String.raw`\b${MIT_SUBJECT_LEFT}\.${MIT_SUBJECT_RIGHT_STRICT}\b`

/**
 * First column of registrar grade reports: same as course scan, plus letter-heavy RHS (e.g. GEN.APCR).
 * Anchored with ^$ via isMitGradeReportSubjectNumber / matchMitGradeReportSubjectLinePrefix.
 */
export const MIT_GRADE_REPORT_SUBJECT_SOURCE = String.raw`${MIT_SUBJECT_LEFT}\.(?:${MIT_SUBJECT_RIGHT_STRICT}|[A-Z][A-Z0-9]{1,7})`

const MIT_GRADE_REPORT_SUBJECT_RE = new RegExp(`^${MIT_GRADE_REPORT_SUBJECT_SOURCE}$`, 'i')
const MIT_GRADE_REPORT_SUBJECT_LINE_PREFIX_RE = new RegExp(
    `^(${MIT_GRADE_REPORT_SUBJECT_SOURCE})\\s+(.+)$`,
    'i'
)

export function isMitGradeReportSubjectNumber(value: string): boolean {
    return MIT_GRADE_REPORT_SUBJECT_RE.test((value || '').trim())
}

/** Leading subject + remainder for space-separated fallback lines (html extract). */
export function matchMitGradeReportSubjectLinePrefix(line: string): { subject: string; rest: string } | null {
    const m = line.trim().match(MIT_GRADE_REPORT_SUBJECT_LINE_PREFIX_RE)
    if (!m) return null
    return { subject: m[1], rest: m[2] }
}

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
