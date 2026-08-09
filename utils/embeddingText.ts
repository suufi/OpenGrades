import type { IClass } from '../types'
import { buildHarvardEmbeddingText } from './harvardEmbeddingText'

/** Build catalog embedding text for any Class document (MIT or Harvard). */
export function buildPublicDescriptionText(course: IClass & { harvardSource?: IClass['harvardSource'] }): string {
    if (course.institution === 'harvard' && course.harvardSource) {
        return buildHarvardEmbeddingText(course.harvardSource)
    }

    const parts: string[] = []
    parts.push(`[PUBLIC_CATALOG]`)
    parts.push(`Course: ${course.subjectNumber} — ${course.subjectTitle}`)
    if (course.aliases?.length) parts.push(`Aliases: ${course.aliases.join(', ')}`)
    if (course.department) parts.push(`Department: ${course.department}`)
    if (course.crossListedDepartments?.length) {
        parts.push(`Cross-listed: ${course.crossListedDepartments.join(', ')}`)
    }
    if (course.prerequisites) parts.push(`Prerequisites: ${course.prerequisites}`)
    if (course.corequisites) parts.push(`Corequisites: ${course.corequisites}`)
    if (course.girAttribute?.length) parts.push(`GIR: ${course.girAttribute.join(', ')}`)
    if (course.hassAttribute) parts.push(`HASS: ${course.hassAttribute}`)
    if (course.communicationRequirement) parts.push(`Communication: ${course.communicationRequirement}`)
    parts.push(`Description: ${course.description || 'No description available.'}`)
    return parts.join('\n').substring(0, 8000)
}
