import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  constraintsToMongoFilter,
  describeConstraints,
  extractSearchConstraints,
  hasConstraints,
} from './searchConstraints.ts'

test('extractSearchConstraints captures combined query constraints used by search API', () => {
  assert.deepEqual(
    extractSearchConstraints('undergrad spring half-term p/f classes at most 12 units small classes'),
    {
      levels: ['U'],
      seasons: ['spring'],
      halfTerm: true,
      pdfOnly: true,
      unitsMax: 12,
      enrollmentMax: 30,
    }
  )
})

test('extractSearchConstraints keeps exact units when no max cue is present', () => {
  assert.deepEqual(extractSearchConstraints('graduate ai seminar 9 units'), {
    levels: ['G'],
    unitsExact: 9,
  })
})

test('extractSearchConstraints ignores out-of-range unit values', () => {
  assert.deepEqual(extractSearchConstraints('under 60 units for undergrad classes'), {
    levels: ['U'],
  })
})

test('constraintsToMongoFilter returns null when no constraints are present', () => {
  assert.equal(constraintsToMongoFilter({}), null)
})

test('constraintsToMongoFilter builds stable mongo filters for mixed constraints', () => {
  assert.deepEqual(
    constraintsToMongoFilter({
      levels: ['U'],
      seasons: ['fall', 'spring'],
      halfTerm: true,
      pdfOnly: true,
      unitsMax: 12,
      enrollmentMin: 100,
    }),
    {
      $and: [
        { level: { $in: ['U'] } },
        { $or: [{ 'seasonsOffered.fall': true }, { 'seasonsOffered.spring': true }] },
        { termDuration: { $in: ['First Half Term Subject', 'Second Half Term Subject', 'Partial Term Subject'] } },
        { gradeType: 'P/D/F' },
        { 'unitsBreakdown.lecture': { $exists: true } },
        {
          $expr: {
            $lte: [
              {
                $add: [
                  '$unitsBreakdown.lecture',
                  '$unitsBreakdown.lab',
                  '$unitsBreakdown.design',
                  '$unitsBreakdown.preparation',
                ],
              },
              12,
            ],
          },
        },
        { enrollment: { $gte: 100 } },
      ],
    }
  )
})

test('hasConstraints and describeConstraints provide clear summary text', () => {
  const constraints = {
    levels: ['U', 'G'] as const,
    seasons: ['fall'] as const,
    unitsExact: 12,
    enrollmentMax: 30,
  }
  assert.equal(hasConstraints(constraints), true)
  assert.equal(
    describeConstraints(constraints),
    'level: undergraduate or graduate; offered in Fall; exactly 12 units; at most 30 students'
  )
})
