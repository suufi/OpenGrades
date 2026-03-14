const TERM_METADATA = {
  FA: { name: 'Fall', emoji: '🍁', rank: 0, calendarYearOffset: -1, gradeReportHeader: 'Fall Term' },
  JA: { name: 'IAP', emoji: '❄️', rank: 1, calendarYearOffset: 0, gradeReportHeader: 'January Term' },
  SP: { name: 'Spring', emoji: '🌸', rank: 2, calendarYearOffset: 0, gradeReportHeader: 'Spring Term' },
  SU: { name: 'Summer', emoji: '☀️', rank: 3, calendarYearOffset: 0, gradeReportHeader: 'Summer Term' },
} as const

type TermSuffix = keyof typeof TERM_METADATA

export const MIT_TERM_CODE_REGEX = /^\d{4}(FA|JA|SP|SU)$/i
const GRADE_REPORT_TERM_HEADER_PATTERN = '(Fall Term|Spring Term|January Term|Summer Term) \\d{4}-\\d{4}'

export const TERM_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: 'FA', label: '🍁 Fall' },
  { value: 'SP', label: '🌸 Spring' },
  { value: 'JA', label: '❄️ IAP' },
]

function normalizeTermSuffix(term?: string | null): string {
  return (term?.slice(-2) || '').toUpperCase()
}

function getTermMetadata(term?: string | null) {
  const suffix = normalizeTermSuffix(term)
  return TERM_METADATA[suffix as TermSuffix]
}

export function isMitTermCode(term?: string | null): term is string {
  return typeof term === 'string' && MIT_TERM_CODE_REGEX.test(term)
}

export function getTermLabel(term?: string | null, options?: { withEmoji?: boolean }): string {
  const metadata = getTermMetadata(term)
  const suffix = normalizeTermSuffix(term)

  if (!metadata) return suffix || term || ''
  return options?.withEmoji ? `${metadata.emoji} ${metadata.name}` : metadata.name
}

export function getTermEmoji(term?: string | null): string {
  return getTermMetadata(term)?.emoji ?? ''
}

export function getTermRank(term?: string | null): number {
  return getTermMetadata(term)?.rank ?? Object.keys(TERM_METADATA).length
}

export function compareTermsSequential(aTerm?: string | null, bTerm?: string | null): number {
  const aYear = parseInt(aTerm?.slice(0, 4) || '', 10) || 0
  const bYear = parseInt(bTerm?.slice(0, 4) || '', 10) || 0

  if (aYear !== bYear) return aYear - bYear
  return getTermRank(aTerm) - getTermRank(bTerm)
}

export function compareTermsLatest(aTerm?: string | null, bTerm?: string | null): number {
  return compareTermsSequential(bTerm, aTerm)
}

/**
 * Format academic year (e.g. 2025) as an academic-year label.
 * 2025 = 2024-2025
 * @param academicYear - Academic year (e.g. 2025)
 * @param separator - Separator between years (default: " - ")
 * @returns Formatted academic year label (e.g. "2024-2025")
 */
export function formatAcademicYear(academicYear: number | string, separator = ' - '): string {
  const year = Number(academicYear)
  if (!Number.isFinite(year) || year <= 0) return String(academicYear ?? '')
  return `${year - 1}${separator}${year}`
}

/**
 * Format MIT term code (e.g. 2025FA) as an academic-year label.
 * 2025FA = Fall 2024-2025, 2025JA = IAP 2024-2025, 2025SP = Spring 2024-2025
 */
export function formatTermDisplay(term: string, options?: { withEmoji?: boolean }): string {
  if (!isMitTermCode(term)) return term

  const year = parseInt(term.substring(0, 4), 10) || 0
  const label = getTermLabel(term, options)
  return `${label} ${year - 1}-${year}`
}

/**
 * Format MIT term code (e.g. 2025FA) as a season-year label.
 * 2025FA = Fall 2024, 2025JA = IAP 2025, 2025SP = Spring 2025
 * @param term - MIT term code (e.g. 2025FA)
 * @param options - Options for formatting
 * @returns Formatted term label (e.g. "Fall 2024")
 */
export function formatTermSeasonYear(term: string, options?: { withEmoji?: boolean }): string {
  if (!isMitTermCode(term)) return term

  const year = parseInt(term.substring(0, 4), 10) || 0
  const metadata = getTermMetadata(term)
  const label = getTermLabel(term, options)

  if (!metadata) return `${label} ${year}`
  return `${label} ${year + metadata.calendarYearOffset}`
}

/**
 * Build MIT term code from academic year and suffix.
 * @param academicYear - Academic year (e.g. 2025)
 * @param suffix - Term suffix (e.g. "FA")
 * @returns MIT term code (e.g. "2025FA")
 */
export function buildTermCode(academicYear: number | string, suffix: string): string {
  return `${Number(academicYear)}${normalizeTermSuffix(suffix)}`
}

export function createGradeReportTermHeaderRegex(): RegExp {
  return new RegExp(GRADE_REPORT_TERM_HEADER_PATTERN, 'g')
}

export function getAcademicYearFromGradeReportHeader(termHeader: string): number | null {
  const match = termHeader.match(/(\d{4})-(\d{4})/)
  return match ? parseInt(match[1], 10) + 1 : null
}

export function getTermSuffixFromGradeReportHeader(termHeader: string): string | null {
  const metadataEntries = Object.entries(TERM_METADATA) as [TermSuffix, (typeof TERM_METADATA)[TermSuffix]][]
  const match = metadataEntries.find(([, metadata]) => termHeader.includes(metadata.gradeReportHeader))
  return match?.[0] ?? null
}
