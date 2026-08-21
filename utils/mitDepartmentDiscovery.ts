import { MIT_DEPARTMENT_CATALOG, sortDepartmentCodes } from './departments.ts'
import { getMitCoursesBaseUrl, mitApiFetch } from './mitApi.ts'

export type MitCurrentCourseLike = {
    departmentCode?: string | null
    departmentName?: string | null
    courseName?: string | null
    courseOption?: string | null
    subjectNumber?: string | null
    subjectId?: string | null
    courseCode?: string | null
    dept?: string | null
    [key: string]: unknown
}

export type MitCurrentCoursesResponse = {
    items?: MitCurrentCourseLike[]
    [key: string]: unknown
}

export type DiscoveredDepartment = {
    code: string
    name: string | null
    courseCount: number
    sampleCourses: string[]
}

function normalizeDepartmentCode(rawCode?: string | null): string {
    const trimmed = `${rawCode || ''}`.replace(/^Course\s+/i, '').trim()
    if (!trimmed) return ''

    const subjectMatch = trimmed.match(/^([A-Z]+|\d+[A-Z]?)(?:[.-].*)?$/i)
    if (subjectMatch) {
        return subjectMatch[1].toUpperCase()
    }

    return trimmed.toUpperCase()
}

export function extractDepartmentCode(course: MitCurrentCourseLike): string | null {
    const candidates = [
        course.departmentCode,
        course.dept,
        course.subjectId,
        course.subjectNumber,
        course.courseCode,
        course.courseOption,
    ]

    for (const candidate of candidates) {
        const normalized = normalizeDepartmentCode(candidate)
        if (normalized) return normalized
    }

    return null
}

export async function fetchMitCurrentCourses(termCode: string): Promise<MitCurrentCourseLike[]> {
    const response = await mitApiFetch(`${getMitCoursesBaseUrl()}courses?termCode=${encodeURIComponent(termCode)}`)
    if (!response.ok) {
        throw new Error(`Failed to fetch current courses for ${termCode} (${response.status})`)
    }

    const body = (await response.json()) as MitCurrentCoursesResponse
    return Array.isArray(body?.items) ? body.items : []
}

export function findNewDepartments(courses: MitCurrentCourseLike[]): DiscoveredDepartment[] {
    const knownDepartmentCodes = new Set(MIT_DEPARTMENT_CATALOG.map((department) => department.code))
    const discovered = new Map<string, DiscoveredDepartment>()

    for (const course of courses) {
        const code = extractDepartmentCode(course)
        if (!code || knownDepartmentCodes.has(code)) continue

        const existing = discovered.get(code)
        const sampleCourseName = course.courseName || course.courseOption || course.departmentName || code

        if (existing) {
            existing.courseCount += 1
            if (existing.sampleCourses.length < 5 && !existing.sampleCourses.includes(sampleCourseName)) {
                existing.sampleCourses.push(sampleCourseName)
            }
            continue
        }

        discovered.set(code, {
            code,
            name: course.departmentName || null,
            courseCount: 1,
            sampleCourses: [sampleCourseName],
        })
    }

    return sortDepartmentCodes(Array.from(discovered.keys())).map((code) => {
        const department = discovered.get(code)
        if (!department) {
            return {
                code,
                name: null,
                courseCount: 0,
                sampleCourses: [],
            }
        }

        return department
    })
}

export async function fetchNewDepartmentsForTerm(termCode: string): Promise<DiscoveredDepartment[]> {
    return findNewDepartments(await fetchMitCurrentCourses(termCode))
}