import type { IHarvardCourse } from '../types/harvardCourse'
import { harvardSubjectNumber } from './harvardCourseMapper'

/** Text used for public description embeddings (Harvard catalog). */
export function buildHarvardEmbeddingText(course: IHarvardCourse): string {
    const parts: string[] = []
    const subjectNumber = harvardSubjectNumber(course)

    parts.push(`[PUBLIC_CATALOG]`)
    parts.push(`Course: ${subjectNumber} — ${course.title || ''}`.trim())
    parts.push(`Department: ${course.subjectDescription || course.subject || ''}`.trim())

    if (course.academicYear || course.semester) parts.push(`Term: ${course.academicYear} ${course.semester}`.trim())
    if (course.level) parts.push(`Level: ${course.level}`)
    if (course.component) parts.push(`Component: ${course.component}`)
    if (course.academicGroup) parts.push(`Academic group: ${course.academicGroup}`)
    if (course.divisionalDist.length) parts.push(`Divisional Distribution: ${course.divisionalDist.join(', ')}`)
    if (course.genEdArea.length) parts.push(`GenEd Area: ${course.genEdArea.join(', ')}`)

    parts.push(`Description: ${(course.description || '').replace(/\s+/g, ' ').trim() || 'No description available.'}`)

    return parts.join('\n').slice(0, 8000)
}
