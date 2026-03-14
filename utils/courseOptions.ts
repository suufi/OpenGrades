import type { ICourseOption } from '@/types'
import { compareDepartmentCodes, formatDepartmentOptionLabel } from '@/utils/departments'

type CourseOptionLike = Pick<ICourseOption, 'departmentCode'> & Partial<Pick<ICourseOption, '_id' | 'courseOption' | 'courseName' | 'departmentName'>>

type GroupedCourseOptionItem = {
    value: string
    label: string
}

export type GroupedCourseOptionSelectData = Array<{
    group: string
    items: GroupedCourseOptionItem[]
}>

export function formatCourseOptionCode(courseOption: CourseOptionLike): string {
    return `${courseOption.departmentCode}${courseOption.courseOption ? `-${courseOption.courseOption}` : ''}`
}

export function formatCourseOptionLabel(courseOption: CourseOptionLike, options?: { includeCoursePrefix?: boolean }): string {
    const prefix = options?.includeCoursePrefix ? 'Course ' : ''
    const code = formatCourseOptionCode(courseOption)
    const name = courseOption.courseName || courseOption.departmentName || ''
    return name ? `${prefix}${code}: ${name}` : `${prefix}${code}`
}

export function isSelectableUndergradProgram(courseOption: CourseOptionLike): boolean {
    const optionCode = courseOption.courseOption || ''
    const departmentCode = courseOption.departmentCode || ''
    const courseName = courseOption.courseName || ''

    const hasNIE = optionCode.includes('NIE')
    const hasNIV = optionCode.includes('NIV')
    const hasZZZ = optionCode.includes('ZZZ')
    const isNone = departmentCode === 'NONE' || departmentCode === 'UND'
    const hasSpecial = courseName.includes('Special')
    const isCourseCoop = ['6', '7'].includes(departmentCode) && optionCode.endsWith('A')
    const isMsrp = optionCode.includes('MSRP')

    return !hasNIE && !hasNIV && !hasZZZ && !isNone && !hasSpecial && !isCourseCoop && !isMsrp
}

export function buildGroupedCourseOptionSelectData(
    courseOptions: CourseOptionLike[],
    options?: {
        filter?: (courseOption: CourseOptionLike) => boolean
        includeCoursePrefixInLabel?: boolean
        groupLabel?: (departmentCode: string) => string
    }
): GroupedCourseOptionSelectData {
    const filteredOptions = (courseOptions || [])
        .filter((courseOption) => !options?.filter || options.filter(courseOption))
        .filter((courseOption) => !!courseOption._id)
        .sort((a, b) => {
            const departmentComparison = compareDepartmentCodes(a.departmentCode, b.departmentCode)
            if (departmentComparison !== 0) return departmentComparison
            return formatCourseOptionCode(a).localeCompare(formatCourseOptionCode(b))
        })

    const grouped = filteredOptions.reduce((acc, courseOption) => {
        const departmentCode = courseOption.departmentCode
        if (!acc[departmentCode]) {
            acc[departmentCode] = []
        }

        acc[departmentCode].push({
            value: String(courseOption._id),
            label: formatCourseOptionLabel(courseOption, {
                includeCoursePrefix: options?.includeCoursePrefixInLabel
            })
        })

        return acc
    }, {} as Record<string, GroupedCourseOptionItem[]>)

    return Object.entries(grouped)
        .sort(([a], [b]) => compareDepartmentCodes(a, b))
        .map(([departmentCode, items]) => ({
            group: options?.groupLabel?.(departmentCode) || formatDepartmentOptionLabel(departmentCode),
            items
        }))
}

export function buildUndergradProgramSelectData(courseOptions: CourseOptionLike[]): GroupedCourseOptionSelectData {
    return buildGroupedCourseOptionSelectData(courseOptions, {
        filter: isSelectableUndergradProgram,
        includeCoursePrefixInLabel: true,
    })
}
