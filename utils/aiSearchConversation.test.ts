import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizeConversationHistory,
  resolveContextualSearchIntent,
  type SearchConversationTurn,
} from './aiSearchConversation.ts'

test('normalizeConversationHistory keeps only valid turns, last 8 messages, and trims content', () => {
  const value: unknown = [
    { role: 'user', content: ' first ' },
    { role: 'assistant', content: 'second' },
    { role: 'assistant', content: '   ' },
    { role: 'system', content: 'ignored' },
    { role: 'user', content: 'third' },
    { role: 'assistant', content: 'fourth' },
    { role: 'user', content: 'fifth' },
    { role: 'assistant', content: 'sixth' },
    { role: 'user', content: 'seventh' },
    { role: 'assistant', content: 'eighth' },
    { role: 'user', content: 'ninth' },
    { role: 'assistant', content: 'tenth' },
  ]

  assert.deepEqual(
    normalizeConversationHistory(value).map((turn) => turn.content),
    ['third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
  )
})

test('resolveContextualSearchIntent expands affirmative follow-up to Harvard-only search', () => {
  const history: SearchConversationTurn[] = [
    { role: 'user', content: 'machine learning classes' },
    { role: 'assistant', content: 'Would you like Harvard cross-registration courses related to machine learning as well?' },
  ]

  assert.deepEqual(
    resolveContextualSearchIntent('yes', history),
    {
      searchQuery: 'Harvard cross-registration courses related to machine learning',
      harvardOnly: true,
      usedConversationContext: true,
    }
  )
})

test('resolveContextualSearchIntent keeps Harvard mention but not harvardOnly for compare queries', () => {
  assert.deepEqual(
    resolveContextualSearchIntent('Compare MIT and Harvard AI courses', []),
    {
      searchQuery: 'Compare MIT and Harvard AI courses',
      harvardOnly: false,
      usedConversationContext: false,
    }
  )
})

test('resolveContextualSearchIntent enriches short context-dependent follow-ups', () => {
  const history: SearchConversationTurn[] = [
    { role: 'user', content: 'robotics classes' },
    { role: 'assistant', content: 'I found a few options. Want me to compare them by workload?' },
  ]

  assert.deepEqual(
    resolveContextualSearchIntent('more', history),
    {
      searchQuery: 'robotics classes. I found a few options. Want me to compare them by workload?. more',
      harvardOnly: false,
      usedConversationContext: true,
    }
  )
})

test('resolveContextualSearchIntent falls back to direct query when context is not needed', () => {
  assert.deepEqual(
    resolveContextualSearchIntent('advanced distributed systems', []),
    {
      searchQuery: 'advanced distributed systems',
      harvardOnly: false,
      usedConversationContext: false,
    }
  )
})
