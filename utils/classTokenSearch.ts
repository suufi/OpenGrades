import type { Model } from 'mongoose'
import type { IClass } from '@/types'
import type { ParsedSearchQuery, SearchField } from '@opengrades/api-client'
import type { Institution } from './institutionFilters'

const ALL_TOKEN_FIELDS = [
  'subjectNumber',
  'subjectTitle',
  'description',
  'instructors',
  'department',
]

const FIELD_TARGETS: Record<SearchField, string[]> = {
  instructor: ['instructors'],
  title: ['subjectTitle'],
  number: ['subjectNumber', 'aliases'],
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function orClause(fields: string[], value: string, exactPhrase: boolean) {
  const escaped = escapeRegExp(value)
  const pattern = exactPhrase ? `\\b${escaped}\\b` : escaped
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: pattern, $options: 'i' },
    })),
  }
}

export function buildTokenSearchClauses(parsed: ParsedSearchQuery) {
  const fieldClauses = parsed.fieldTerms.map((term) =>
    orClause(FIELD_TARGETS[term.field], term.value, term.phrase)
  )

  const freeTextClauses = parsed.freeTextTokens.map((token) =>
    orClause(ALL_TOKEN_FIELDS, token.value, token.phrase)
  )

  return [...fieldClauses, ...freeTextClauses]
}

type TokenSearchOptions = {
  institution?: Institution
  offeredOnly?: boolean
  limit?: number
}

export async function findClassIdsByTokenSearch(
  Class: Model<IClass>,
  parsed: ParsedSearchQuery,
  options: TokenSearchOptions = {}
): Promise<string[]> {
  const clauses = buildTokenSearchClauses(parsed)
  if (clauses.length === 0) return []

  const filter: Record<string, unknown> = {
    $and: clauses,
  }

  if (options.institution) {
    filter.institution = options.institution
  }

  if (options.offeredOnly) {
    filter.offered = true
  }

  const matches = await Class.find(filter)
    .select('_id')
    .limit(options.limit ?? 1000)
    .lean()

  return matches.map((course) => String(course._id))
}
