import mongoose from 'mongoose'
import type { Client } from '@elastic/elasticsearch'
import type { Model } from 'mongoose'
import type { IClass } from '@/types'
import type { ParsedSearchQuery, SearchField } from '@opengrades/api-client'
import { getInstitutionScope, type Institution } from './institutionFilters'
import { findClassIdsByTokenSearch } from './classTokenSearch'

const CLASSES_INDEX = 'opengrades_prod.classes'

const ALL_SEARCH_FIELDS = [
  'subjectNumber^3',
  'subjectTitle^3',
  'aliases^3',
  'instructors',
  'description',
]

/** Which index fields a `field:value` term is allowed to match. */
const FIELD_TARGETS: Record<SearchField, string[]> = {
  instructor: ['instructors'],
  title: ['subjectTitle'],
  number: ['subjectNumber', 'aliases'],
}

export type ClassSearchResult = {
  classIds: mongoose.Types.ObjectId[]
  highlights: Record<string, { [key: string]: string[] }>
  scores: Record<string, number>
}

function buildElasticsearchQuery(parsed: ParsedSearchQuery, institution?: Institution) {
  const fieldClauses = parsed.fieldTerms.map((term) => ({
    multi_match: {
      query: term.value,
      fields: FIELD_TARGETS[term.field],
      type: (term.phrase ? 'phrase' : 'phrase_prefix') as 'phrase' | 'phrase_prefix',
    },
  }))

  const freeTextClauses = parsed.freeTextTokens.map((token) => ({
    multi_match: {
      query: token.value,
      fields: ALL_SEARCH_FIELDS,
      type: (token.phrase ? 'phrase' : 'phrase_prefix') as 'phrase' | 'phrase_prefix',
    },
  }))

  const mustClauses = [...fieldClauses, ...freeTextClauses]

  const filters: Record<string, unknown>[] = []
  if (institution) {
    filters.push({ term: { institution } })
  }

  const exactBoosts = parsed.freeText
    ? [
      { term: { subjectNumber: { value: parsed.freeText, boost: 6 } } },
      { term: { aliases: { value: parsed.freeText, boost: 3 } } },
    ]
    : []

  return {
    bool: {
      should: [
        ...exactBoosts,
        {
          bool: {
            must: mustClauses,
          },
        },
      ],
      minimum_should_match: 1,
      ...(filters.length > 0 ? { filter: filters } : {}),
    },
  }
}

function mapSearchHits(
  hits: Array<{ _id: string, _score?: number, highlight?: { [key: string]: string[] } }>
): Pick<ClassSearchResult, 'classIds' | 'highlights' | 'scores'> {
  const classIds = hits.map((hit) => new mongoose.Types.ObjectId(hit._id))
  const highlights: Record<string, { [key: string]: string[] }> = {}
  const scores: Record<string, number> = {}

  hits.forEach((hit) => {
    if (hit.highlight) highlights[hit._id] = hit.highlight
    scores[hit._id] = hit._score ?? 0
  })

  return { classIds, highlights, scores }
}

function mergeClassIds(
  primary: mongoose.Types.ObjectId[],
  additional: string[]
): mongoose.Types.ObjectId[] {
  const merged = new Map<string, mongoose.Types.ObjectId>()
  primary.forEach((id) => merged.set(id.toString(), id))
  additional.forEach((id) => merged.set(id, new mongoose.Types.ObjectId(id)))
  return [...merged.values()]
}

export async function resolveClassSearchIds(
  client: Client,
  Class: Model<IClass>,
  parsed: ParsedSearchQuery,
  institutions: Institution[],
  offeredOnly: boolean
): Promise<ClassSearchResult> {
  const { harvardOnly, mitOnly, both } = getInstitutionScope(institutions)

  if (harvardOnly) {
    const ids = await findClassIdsByTokenSearch(Class, parsed, {
      institution: 'harvard',
      offeredOnly,
    })
    return {
      classIds: ids.map((id) => new mongoose.Types.ObjectId(id)),
      highlights: {},
      scores: {},
    }
  }

  const searchResults = await client.search({
    index: CLASSES_INDEX,
    query: buildElasticsearchQuery(parsed, mitOnly ? 'mit' : undefined),
    highlight: {
      fields: {
        description: {},
        subjectTitle: {},
        aliases: {},
        instructors: {},
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      number_of_fragments: 3,
    },
    size: 1000,
  })

  const { classIds, highlights, scores } = mapSearchHits(
    searchResults.hits.hits as Array<{ _id: string, _score?: number, highlight?: { [key: string]: string[] } }>
  )

  if (mitOnly && classIds.length > 0) {
    const mitMatches = await Class.find({
      _id: { $in: classIds },
      institution: 'mit',
    }).select('_id').lean()

    return {
      classIds: mitMatches.map((course) => new mongoose.Types.ObjectId(String(course._id))),
      highlights,
      scores,
    }
  }

  const hasCriteria = parsed.fieldTerms.length > 0 || parsed.freeTextTokens.length > 0
  if (!both || !hasCriteria) {
    return { classIds, highlights, scores }
  }

  const harvardIds = await findClassIdsByTokenSearch(Class, parsed, {
    institution: 'harvard',
    offeredOnly,
    limit: 500,
  })

  return {
    classIds: mergeClassIds(classIds, harvardIds),
    highlights,
    scores,
  }
}
