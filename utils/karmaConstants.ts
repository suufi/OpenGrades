/**
 * Karma amounts for earning and spending.
 * Tuned after running scripts/karma-distribution.ts.
 */
export const KARMA_REVIEW_FULL = 5
export const KARMA_REVIEW_PARTIAL = 3
export const KARMA_GRADE_REPORT = 10
export const KARMA_CONTENT_UPLOAD = 5
export const KARMA_UPVOTE_RECEIVED = 2

/** Q&A blast cost is formula-based: base + k * sqrt(recipients), clamped to [MIN, MAX] */
export const QA_BLAST_COST_BASE = 5
export const QA_BLAST_COST_K = 2
export const QA_BLAST_COST_MIN = 5
export const QA_BLAST_COST_MAX = 50

/**
 * Compute karma cost for a Q&A blast based on recipient count.
 * cost = ceil(base + k * sqrt(recipients)), clamped to [MIN, MAX].
 */
export function getQaBlastCost(recipientCount: number): number {
  const raw = QA_BLAST_COST_BASE + QA_BLAST_COST_K * Math.sqrt(Math.max(0, recipientCount))
  const capped = Math.max(QA_BLAST_COST_MIN, Math.min(QA_BLAST_COST_MAX, Math.ceil(raw)))
  return capped
}
