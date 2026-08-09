import type { IClass } from '../types'
import type { IHarvardCourse, IHarvardInstructor, IHarvardMeetingPattern } from '../types/harvardCourse'
import { harvardSemesterToMitTerm } from './formatTerm'
import { plainTextFromHtml } from './harvardSanitize'

const HARVARD_COURSE_KEYS: (keyof IHarvardCourse)[] = [
    'id', 'externalId', 'qGuideId', 'title', 'subject', 'subjectDescription',
    'catalogNumber', 'level', 'academicGroup', 'semester', 'academicYear',
    'classSection', 'component', 'description', 'instructors', 'meetingPatterns',
    'genEdArea', 'divisionalDist'
]

/** Deep-clone and normalize to the canonical IHarvardCourse shape (no dropped keys). */
export function normalizeHarvardCourse(raw: IHarvardCourse): IHarvardCourse {
    const instructors: IHarvardInstructor[] = Array.isArray(raw.instructors)
        ? raw.instructors.map(i => ({
            name: String(i?.name ?? ''),
            email: String(i?.email ?? '')
        }))
        : []

    const meetingPatterns: IHarvardMeetingPattern[] = Array.isArray(raw.meetingPatterns)
        ? raw.meetingPatterns.map(p => ({
            startTime: String(p?.startTime ?? ''),
            endTime: String(p?.endTime ?? ''),
            startDate: String(p?.startDate ?? ''),
            endDate: String(p?.endDate ?? ''),
            meetsOnMonday: Boolean(p?.meetsOnMonday),
            meetsOnTuesday: Boolean(p?.meetsOnTuesday),
            meetsOnWednesday: Boolean(p?.meetsOnWednesday),
            meetsOnThursday: Boolean(p?.meetsOnThursday),
            meetsOnFriday: Boolean(p?.meetsOnFriday),
            meetsOnSaturday: Boolean(p?.meetsOnSaturday),
            meetsOnSunday: Boolean(p?.meetsOnSunday)
        }))
        : []

    return {
        id: String(raw.id ?? ''),
        externalId: Number(raw.externalId) || 0,
        qGuideId: Number(raw.qGuideId) || 0,
        title: String(raw.title ?? ''),
        subject: String(raw.subject ?? ''),
        subjectDescription: String(raw.subjectDescription ?? ''),
        catalogNumber: String(raw.catalogNumber ?? '').trim(),
        level: String(raw.level ?? ''),
        academicGroup: String(raw.academicGroup ?? ''),
        semester: String(raw.semester ?? ''),
        academicYear: Number(raw.academicYear) || 0,
        classSection: String(raw.classSection ?? ''),
        component: String(raw.component ?? ''),
        description: String(raw.description ?? ''),
        instructors,
        meetingPatterns,
        genEdArea: Array.isArray(raw.genEdArea) ? [...raw.genEdArea] : [],
        divisionalDist: Array.isArray(raw.divisionalDist) ? [...raw.divisionalDist] : []
    }
}

export function harvardSubjectNumber(course: IHarvardCourse): string {
    const subject = course.subject.trim().toUpperCase()
    const catalog = course.catalogNumber.trim().toUpperCase()
    if (subject && catalog) return `${subject} ${catalog}`
    return subject || catalog || 'UNKNOWN'
}

export function harvardCourseToClassDoc(course: IHarvardCourse): Omit<IClass, '_id' | 'createdAt' | 'updatedAt'> {
    const harvardSource = normalizeHarvardCourse(course)
    const subjectNumber = harvardSubjectNumber(harvardSource)

    return {
        subjectNumber,
        aliases: [],
        subjectTitle: harvardSource.title,
        instructors: harvardSource.instructors.map(i => i.name).filter(Boolean),
        term: harvardSemesterToMitTerm(harvardSource.semester, harvardSource.academicYear),
        academicYear: harvardSource.academicYear,
        display: true,
        description: plainTextFromHtml(harvardSource.description),
        department: harvardSource.subjectDescription || harvardSource.subject,
        crossListedDepartments: [],
        units: '',
        communicationRequirement: null,
        hassAttribute: null,
        girAttribute: [],
        reviewable: false,
        offered: true,
        institution: 'harvard',
        harvardCatalogId: harvardSource.id,
        harvardSource
    }
}

/** Verify normalized course retains all canonical keys (for dry-run). */
export function assertHarvardCourseShape(course: IHarvardCourse): void {
    for (const key of HARVARD_COURSE_KEYS) {
        if (!(key in course)) {
            throw new Error(`Harvard course missing key: ${key}`)
        }
    }
}
