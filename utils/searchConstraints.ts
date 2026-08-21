export interface SearchConstraints {
    levels?: Array<'U' | 'G'>
    seasons?: Array<'fall' | 'iap' | 'spring' | 'summer'>
    halfTerm?: boolean
    pdfOnly?: boolean
    unitsExact?: number
    unitsMax?: number
    enrollmentMax?: number
    enrollmentMin?: number
}

export const HALF_TERM_DURATIONS = [
    'First Half Term Subject',
    'Second Half Term Subject',
    'Partial Term Subject',
]

const SEASON_PATTERNS: Array<[RegExp, 'fall' | 'iap' | 'spring' | 'summer']> = [
    [/\bfall\b|\bautumn\b/, 'fall'],
    [/\biap\b|\bjanuary\b/, 'iap'],
    [/\bspring\b/, 'spring'],
    [/\bsummer\b/, 'summer'],
]

const UNITS_REGEX = /\b(\d{1,2})[\s-]?units?\b/
const UNITS_MAX_CUE = /\b(?:under|less than|at most|max(?:imum)?|no more than|up to|fewer than)\b[^.]{0,16}$/

export function extractSearchConstraints(query: string): SearchConstraints {
    const q = (query || '').toLowerCase()
    const constraints: SearchConstraints = {}

    const levels: Array<'U' | 'G'> = []
    if (/\bundergrad(?:uate)?\b/.test(q)) levels.push('U')
    if (/\bgrad(?:uate)?\b/.test(q)) levels.push('G') // \b keeps "undergrad(uate)" from matching
    if (levels.length) constraints.levels = levels

    const seasons = SEASON_PATTERNS.filter(([re]) => re.test(q)).map(([, season]) => season)
    if (seasons.length) constraints.seasons = seasons

    if (/\bhalf[\s-]?(?:term|semester|class(?:es)?)\b|\bpartial[\s-]?term\b/.test(q)) {
        constraints.halfTerm = true
    }

    if (/\bp\/?d\/?f\b|\bpass[\s/-]?fail\b|\bpass\/no[\s-]?record\b/.test(q)) {
        constraints.pdfOnly = true
    }

    const unitsMatch = q.match(UNITS_REGEX)
    if (unitsMatch) {
        const units = parseInt(unitsMatch[1], 10)
        if (units >= 1 && units <= 48) {
            const before = q.slice(0, unitsMatch.index)
            if (UNITS_MAX_CUE.test(before)) {
                constraints.unitsMax = units
            } else {
                constraints.unitsExact = units
            }
        }
    }

    if (/\bsmall(?:er)?(?:\s+\S+){0,2}?\s+(?:class(?:es)?|course(?:s)?|seminar(?:s)?|discussion(?:s)?|section(?:s)?)\b/.test(q)) {
        constraints.enrollmentMax = 30
    }
    if (/\b(?:big|large)(?:\s+\S+){0,2}?\s+(?:class(?:es)?|course(?:s)?|lecture(?:s)?)\b/.test(q)) {
        constraints.enrollmentMin = 100
    }

    return constraints
}

export function hasConstraints(constraints: SearchConstraints): boolean {
    return Object.keys(constraints).length > 0
}

const UNITS_TOTAL_EXPR = {
    $add: [
        '$unitsBreakdown.lecture', '$unitsBreakdown.lab',
        '$unitsBreakdown.design', '$unitsBreakdown.preparation',
    ],
}

export function constraintsToMongoFilter(constraints: SearchConstraints): Record<string, unknown> | null {
    const and: Record<string, unknown>[] = []

    if (constraints.levels?.length) {
        and.push({ level: { $in: constraints.levels } })
    }
    if (constraints.seasons?.length) {
        and.push({ $or: constraints.seasons.map((s) => ({ [`seasonsOffered.${s}`]: true })) })
    }
    if (constraints.halfTerm) {
        and.push({ termDuration: { $in: HALF_TERM_DURATIONS } })
    }
    if (constraints.pdfOnly) {
        and.push({ gradeType: 'P/D/F' })
    }
    if (constraints.unitsExact !== undefined || constraints.unitsMax !== undefined) {
        and.push({ 'unitsBreakdown.lecture': { $exists: true } })
        if (constraints.unitsExact !== undefined) {
            and.push({ $expr: { $eq: [UNITS_TOTAL_EXPR, constraints.unitsExact] } })
        }
        if (constraints.unitsMax !== undefined) {
            and.push({ $expr: { $lte: [UNITS_TOTAL_EXPR, constraints.unitsMax] } })
        }
    }
    if (constraints.enrollmentMax !== undefined) {
        and.push({ enrollment: { $gt: 0, $lte: constraints.enrollmentMax } })
    }
    if (constraints.enrollmentMin !== undefined) {
        and.push({ enrollment: { $gte: constraints.enrollmentMin } })
    }

    return and.length > 0 ? { $and: and } : null
}

const LEVEL_LABELS: Record<'U' | 'G', string> = { U: 'undergraduate', G: 'graduate' }
const SEASON_LABELS: Record<string, string> = { fall: 'Fall', iap: 'IAP', spring: 'Spring', summer: 'Summer' }

export function describeConstraints(constraints: SearchConstraints): string {
    const parts: string[] = []
    if (constraints.levels?.length) {
        parts.push(`level: ${constraints.levels.map((l) => LEVEL_LABELS[l]).join(' or ')}`)
    }
    if (constraints.seasons?.length) {
        parts.push(`offered in ${constraints.seasons.map((s) => SEASON_LABELS[s]).join(' or ')}`)
    }
    if (constraints.halfTerm) parts.push('half/partial-term')
    if (constraints.pdfOnly) parts.push('graded P/D/F')
    if (constraints.unitsExact !== undefined) parts.push(`exactly ${constraints.unitsExact} units`)
    if (constraints.unitsMax !== undefined) parts.push(`at most ${constraints.unitsMax} units`)
    if (constraints.enrollmentMax !== undefined) parts.push(`at most ${constraints.enrollmentMax} students`)
    if (constraints.enrollmentMin !== undefined) parts.push(`at least ${constraints.enrollmentMin} students`)
    return parts.join('; ')
}
