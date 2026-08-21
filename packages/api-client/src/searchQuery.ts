/**
 * Search query grammar shared by web and mobile.
 */

export type SearchField = 'instructor' | 'title' | 'number'

const FIELD_ALIASES: Record<string, SearchField> = {
  instructor: 'instructor',
  instructors: 'instructor',
  prof: 'instructor',
  professor: 'instructor',
  teacher: 'instructor',
  title: 'title',
  name: 'title',
  subject: 'number',
}

export const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  instructor: 'Instructor',
  title: 'Title',
  number: 'Number',
}

export interface SearchFieldTerm {
  field: SearchField
  value: string
  phrase: boolean
  raw: string
  start: number
  end: number

  unterminated?: boolean
}

export interface FreeTextToken {
  value: string
  phrase: boolean
}

export interface ParsedSearchQuery {
  fieldTerms: SearchFieldTerm[]
  freeTextTokens: FreeTextToken[]
  freeText: string
}

const TOKEN_PATTERN = /([a-zA-Z]+):"([^"]*)"|([a-zA-Z]+):(\S+)|"([^"]*)"|(\S+)/g

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const fieldTerms: SearchFieldTerm[] = []
  const freeTextTokens: FreeTextToken[] = []

  if (!input || !input.trim()) {
    return { fieldTerms, freeTextTokens, freeText: '' }
  }

  TOKEN_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = TOKEN_PATTERN.exec(input)) !== null) {
    const raw = match[0]
    const quotedField = match[1]
    const quotedFieldValue = match[2]
    const bareField = match[3]
    const bareFieldValue = match[4]
    const quotedFreeText = match[5]
    const bareFreeText = match[6]
    const start = match.index
    const end = match.index + raw.length

    if (quotedField !== undefined) {
      const field = FIELD_ALIASES[quotedField.toLowerCase()]
      const value = (quotedFieldValue ?? '').trim()
      if (field && value) {
        fieldTerms.push({ field, value, phrase: true, raw, start, end })
      } else if (value) {
        // Unknown prefix — keep the quoted part as a free-text phrase
        freeTextTokens.push({ value, phrase: true })
      }
      continue
    }

    if (bareField !== undefined) {
      const field = FIELD_ALIASES[bareField.toLowerCase()]
      const rawValue = (bareFieldValue ?? '').trim()
      // A leading quote here means the closing quote hasn't been typed yet
      const unterminated = rawValue.startsWith('"')
      const value = unterminated ? rawValue.slice(1).trim() : rawValue
      if (field && value) {
        fieldTerms.push({ field, value, phrase: false, raw, start, end, unterminated })
      } else if (!field) {
        freeTextTokens.push({ value: raw, phrase: false })
      }
      continue
    }

    if (quotedFreeText !== undefined) {
      const value = quotedFreeText.trim()
      if (value) freeTextTokens.push({ value, phrase: true })
      continue
    }

    if (bareFreeText !== undefined) {
      freeTextTokens.push({ value: bareFreeText, phrase: false })
    }
  }

  return {
    fieldTerms,
    freeTextTokens,
    freeText: freeTextTokens.map((token) => token.value).join(' '),
  }
}

/** Renders a term back into query syntax, quoting when the value has spaces. */
export function serializeFieldTerm(term: Pick<SearchFieldTerm, 'field' | 'value'>): string {
  return /\s/.test(term.value)
    ? `${term.field}:"${term.value}"`
    : `${term.field}:${term.value}`
}

export function buildSearchQuery(
  fieldTerms: Array<Pick<SearchFieldTerm, 'field' | 'value'>>,
  freeText: string
): string {
  return [...fieldTerms.map(serializeFieldTerm), freeText.trim()]
    .filter(Boolean)
    .join(' ')
}

export function extractCompletedFieldTerms(input: string): {
  terms: SearchFieldTerm[]
  rest: string
} {
  const { fieldTerms } = parseSearchQuery(input)
  const completed = fieldTerms.filter(
    (term) => !term.unterminated && (term.phrase || term.end < input.length)
  )

  if (completed.length === 0) {
    return { terms: [], rest: input }
  }

  let rest = ''
  let cursor = 0
  for (const term of completed) {
    rest += input.slice(cursor, term.start)
    cursor = term.end
  }
  rest += input.slice(cursor)

  return { terms: completed, rest: rest.replace(/\s+/g, ' ').trimStart() }
}

export function dedupeFieldTerms(terms: SearchFieldTerm[]): SearchFieldTerm[] {
  const seen = new Set<string>()
  return terms.filter((term) => {
    const key = `${term.field}:${term.value.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
