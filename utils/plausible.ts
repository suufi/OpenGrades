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
