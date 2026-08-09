import assert from 'node:assert/strict'
import { test } from 'node:test'

import { interleaveBySubjectNumber } from './interleaveBySubjectNumber.ts'

type Item = { id: string; subjectNumber: string }

test('returns empty array for empty input', () => {
  assert.deepEqual(interleaveBySubjectNumber([]), [])
})

test('single-subject list keeps relative order', () => {
  const items: Item[] = [
    { id: 'a1', subjectNumber: '6.100A' },
    { id: 'a2', subjectNumber: '6.100A' },
    { id: 'a3', subjectNumber: '6.100A' },
  ]
  assert.deepEqual(
    interleaveBySubjectNumber(items).map((i) => i.id),
    ['a1', 'a2', 'a3']
  )
})

test('round-robins so same subjectNumbers are not adjacent when others exist', () => {
  const items: Item[] = [
    { id: 'a1', subjectNumber: '6.100A' },
    { id: 'a2', subjectNumber: '6.100A' },
    { id: 'b1', subjectNumber: '8.01' },
    { id: 'a3', subjectNumber: '6.100A' },
    { id: 'c1', subjectNumber: '18.06' },
  ]
  const ids = interleaveBySubjectNumber(items).map((i) => i.id)
  assert.deepEqual(ids, ['a1', 'b1', 'c1', 'a2', 'a3'])
  assert.notEqual(
    items.find((x) => x.id === ids[0])!.subjectNumber,
    items.find((x) => x.id === ids[1])!.subjectNumber
  )
  assert.notEqual(
    items.find((x) => x.id === ids[1])!.subjectNumber,
    items.find((x) => x.id === ids[2])!.subjectNumber
  )
})

test('preserves first-seen group order from popularity-sorted input', () => {
  const items: Item[] = [
    { id: 'b1', subjectNumber: '8.01' },
    { id: 'a1', subjectNumber: '6.100A' },
    { id: 'b2', subjectNumber: '8.01' },
  ]
  assert.deepEqual(
    interleaveBySubjectNumber(items).map((i) => i.id),
    ['b1', 'a1', 'b2']
  )
})

test('preserves all items (no dedupe)', () => {
  const items: Item[] = [
    { id: '1', subjectNumber: 'A' },
    { id: '2', subjectNumber: 'A' },
    { id: '3', subjectNumber: 'B' },
  ]
  const out = interleaveBySubjectNumber(items)
  assert.equal(out.length, 3)
  assert.deepEqual(new Set(out.map((i) => i.id)), new Set(['1', '2', '3']))
})

test('does not mutate the input array', () => {
  const items: Item[] = [
    { id: 'a1', subjectNumber: 'A' },
    { id: 'b1', subjectNumber: 'B' },
    { id: 'a2', subjectNumber: 'A' },
  ]
  const snapshot = items.map((i) => ({ ...i }))
  interleaveBySubjectNumber(items)
  assert.deepEqual(items, snapshot)
})

test('allows adjacent leftovers when one subject outnumbers groups', () => {
  const items: Item[] = [
    { id: 'a1', subjectNumber: 'A' },
    { id: 'a2', subjectNumber: 'A' },
    { id: 'a3', subjectNumber: 'A' },
    { id: 'a4', subjectNumber: 'A' },
    { id: 'b1', subjectNumber: 'B' },
  ]
  assert.deepEqual(
    interleaveBySubjectNumber(items).map((i) => i.id),
    ['a1', 'b1', 'a2', 'a3', 'a4']
  )
})
