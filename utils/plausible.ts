/**
 * Plausible Analytics types and utilities using next-plausible
 * 
 * Custom Events tracked:
 * - File Open: When a student opens/views a file (syllabus, PDF, etc.)
 * - AI Query: When a student submits a query to the AI search
 * - Review Submit: When a student submits a class review
 * - Grade Report Upload: When a student uploads a grade report
 * - Recommendation Click: When a student clicks a recommended class
 * - Content Upload: When a student uploads course content
 * 
 * @see https://github.com/4lejandrito/next-plausible
 */

import { usePlausible } from 'next-plausible'

/**
 * Type-safe custom events for Plausible analytics
 */
export type PlausibleEvents = {
  'File Open': {
    contentType: string
    classNumber: string
    fileName: string
  }
  'AI Query': {
    queryLength: string
    isFollowUp: string
  }
  'Review Submit': {
    classNumber: string
    hasNumericGrade: string
  }
  'Grade Report Upload': {
    classCount: string
    term: string
  }
  'Recommendation Click': {
    classNumber: string
    source: string
  }
  'Content Upload': {
    contentType: string
    classNumber: string
  }
}

/**
 * React hook for tracking Plausible events with type safety
 * Use this inside React components
 *
 * @example
 * const plausible = usePlausibleTracker()
 * plausible('File Open', { props: { contentType: 'Syllabus', classNumber: '6.100A', fileName: 'syllabus.pdf' } })
 */
export function usePlausibleTracker() {
  return usePlausible<PlausibleEvents>()
}

const PLAUSIBLE_QUERY_URL = process.env.PLAUSIBLE_API_DOMAIN ? `${process.env.PLAUSIBLE_API_DOMAIN}/api/v2/query` : 'https://analytics.mit.edu/api/v2/query'

export type PlausiblePageStat = {
  path: string
  pageviews: number

  classId: string | null
  subjectNumber: string | null
}

/**
 * Fetch pageview stats for pages under /classes/ (e.g. /classes/507f...).
 * Uses PLAUSIBLE_DOMAIN (site_id) and PLAUSIBLE_API_KEY.
 * Returns [] if env is missing or the API request fails.
 */
export async function getClassesPageStats(options?: {
  dateRange?: string
  limit?: number
}): Promise<PlausiblePageStat[]> {
  const apiKey = process.env.PLAUSIBLE_API_KEY
  const siteId = process.env.PLAUSIBLE_DOMAIN
  if (!apiKey || !siteId) {
    return []
  }

  const dateRange = options?.dateRange ?? '30d'
  const limit = options?.limit ?? 50

  try {
    const res = await fetch(PLAUSIBLE_QUERY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site_id: siteId,
        metrics: ['pageviews'],
        date_range: dateRange,
        dimensions: ['event:page'],
        filters: [['contains', 'event:page', ['/classes/']]],
        order_by: [['pageviews', 'desc']],
        pagination: { limit, offset: 0 },
      }),
    })

    if (!res.ok) {
      console.error('[Plausible] API error:', res.status, await res.text())
      return []
    }

    const data = await res.json()
    const results = data?.results ?? []
    const metricsIdx = data?.query?.metrics?.indexOf?.('pageviews') ?? 0
    const stats: PlausiblePageStat[] = results.map((row: { dimensions?: string[]; metrics?: number[] }) => {
      const path = Array.isArray(row.dimensions) ? row.dimensions[0] ?? '' : ''
      const pageviews = Array.isArray(row.metrics) ? row.metrics[metricsIdx] ?? 0 : 0
      let classId: string | null = null
      let subjectNumber: string | null = null
      if (path.startsWith('/classes/aggregate/')) {
        subjectNumber = path.replace(/^\/classes\/aggregate\//, '').trim() || null
      } else if (path.startsWith('/classes/')) {
        const suffix = path.replace(/^\/classes\//, '').trim()
        if (suffix && /^[a-fA-F0-9]{24}$/.test(suffix)) classId = suffix // cost intensive to query the database, just check 24 chars
      }
      return { path, pageviews, classId, subjectNumber }
    })

    return stats.filter((s) => (s.classId != null || s.subjectNumber != null) && s.pageviews > 0)
  } catch (err) {
    console.error('[Plausible] fetch error:', err)
    return []
  }
}
