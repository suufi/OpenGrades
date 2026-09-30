import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyInstitutionToMongoQuery,
  parseInstitutionFiltersFromRequest,
  parseInstitutionFiltersFromSession,
} from './institutionFilters.ts'

test('parseInstitutionFiltersFromRequest defaults to MIT when parameter is missing', () => {
  assert.deepEqual(parseInstitutionFiltersFromRequest(undefined), ['mit'])
})

test('parseInstitutionFiltersFromRequest normalizes, deduplicates, and drops invalid values', () => {
  assert.deepEqual(
    parseInstitutionFiltersFromRequest(' Harvard,mit,MIT,foo,harvard '),
    ['harvard', 'mit']
  )
})

test('parseInstitutionFiltersFromRequest treats empty parameter as no institutions selected', () => {
  assert.deepEqual(parseInstitutionFiltersFromRequest(''), [])
})

test('parseInstitutionFiltersFromSession supports legacy includeHarvardFilter fallback', () => {
  assert.deepEqual(
    parseInstitutionFiltersFromSession({ schoolFilter: ['unknown'], includeHarvardFilter: true }),
    ['mit', 'harvard']
  )
})

test('applyInstitutionToMongoQuery blocks results when no institutions are selected', () => {
  const query: Record<string, unknown> = { active: true }
  applyInstitutionToMongoQuery(query, [])
  assert.deepEqual(query, { active: true, _id: { $in: [] } })
})

test('applyInstitutionToMongoQuery does not force institution when both schools are selected', () => {
  const query: Record<string, unknown> = { active: true }
  applyInstitutionToMongoQuery(query, ['mit', 'harvard'])
  assert.deepEqual(query, { active: true })
})

test('applyInstitutionToMongoQuery scopes to a single institution when needed', () => {
  const mitQuery: Record<string, unknown> = {}
  const harvardQuery: Record<string, unknown> = {}

  applyInstitutionToMongoQuery(mitQuery, ['mit'])
  applyInstitutionToMongoQuery(harvardQuery, ['harvard'])

  assert.deepEqual(mitQuery, { institution: 'mit' })
  assert.deepEqual(harvardQuery, { institution: 'harvard' })
})
