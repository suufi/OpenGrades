import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import CourseOption from '@/models/CourseOption'
import User from '@/models/User'
import { IClass, ICourseOption } from '@/types'

export type OfCourseClassEntry = {
    subjectNumber: string
    subjectTitle: string
    count: number | string
    realCount?: number
}

export type OfCourseOptionLite = {
    id: string
    departmentCode: string
    courseOption: string | null
    courseName: string
}

export type OfCourseOptionData = {
    courseOption: OfCourseOptionLite
    classes: Record<string, OfCourseClassEntry[]>
    mengClasses: Record<string, OfCourseClassEntry[]>
}

export const getYearLabel = (classOf: number, academicYear: number): string | null => {
    const yearDiff = classOf - academicYear
    if (yearDiff === 3) return 'First Year'
    if (yearDiff === 2) return 'Sophomore Year'
    if (yearDiff === 1) return 'Junior Year'
    if (yearDiff === 0) return 'Senior Year'
    return null
}

/**
 * Builds the "Who's Taken What?" dataset: for every undergrad course option
 * (plus an aggregate "All"), the top classes taken per year/term based on
 * submitted reviews. Shared by the /ofcourse page (SSR) and /api/ofcourse.
 */
export async function buildOfCourseData(): Promise<OfCourseOptionData[]> {
    const reviewedClassIds = await ClassReview.distinct('class')
    const allClasses = await Class.find({ _id: { $in: reviewedClassIds } })
        .select('subjectNumber aliases subjectTitle')
    const subjectToCanonical = new Map<string, string>()
    const subjectTitleMap = new Map<string, string>()

    for (const cls of allClasses) {
        const canonical = cls.subjectNumber
        subjectToCanonical.set(canonical, canonical)
        subjectTitleMap.set(canonical, cls.subjectTitle)

        for (const alias of cls.aliases || []) {
            subjectToCanonical.set(alias, canonical)
        }
    }

    const allCourseOptions = await CourseOption.find({
        courseLevel: "U"
    })

    const course6MEngOptions = await CourseOption.find({
        courseLevel: "G",
        departmentCode: "6",
        courseOption: { $regex: /P$/ }
    })

    const mengProgramMap = new Map<string, any>()
    course6MEngOptions.forEach(meng => {
        const baseOption = meng.courseOption.replace(/P$/, '')
        mengProgramMap.set(baseOption, meng)
    })

    const courseOptionsData = []

    for (const courseOption of allCourseOptions) {
        const mengProgram = mengProgramMap.get(courseOption.courseOption || '')
        const hasMEngProgram = courseOption.departmentCode === '6' && mengProgram

        const affiliatedUsers = await User.find({
            $or: [
                { courseAffiliation: courseOption._id },
                ...(hasMEngProgram ? [{ courseAffiliation: mengProgram._id }] : [])
            ],
            classOf: { $ne: null }
        }).select('_id classOf programTerms courseAffiliation').populate('courseAffiliation').populate('programTerms.program')

        const userMap = new Map<string, { classOf: number, programTerms?: Array<{ program: ICourseOption, terms: string[] }>, isMEng: boolean }>()
        affiliatedUsers.forEach(u => {
            const affiliations = Array.isArray(u.courseAffiliation)
                ? u.courseAffiliation
                : (u.courseAffiliation ? [u.courseAffiliation] : [])

            const isMEng = hasMEngProgram && affiliations.some((aff: any) =>
                aff && aff._id && aff._id.toString() === mengProgram._id.toString()
            )

            userMap.set(u._id.toString(), {
                classOf: u.classOf,
                programTerms: u.programTerms?.map((pt) => ({ program: pt.program as ICourseOption, terms: pt.terms })) || [],
                isMEng: isMEng
            })
        })

        const reviews = await ClassReview.find({
            author: { $in: Array.from(userMap.keys()) }
        }).populate('class')

        type TermEntry = { subjectTitle: string, count: number, realCount: number }
        const yearTermMap: Record<string, Map<string, TermEntry>> = {}
        const mengTermMap: Record<string, Map<string, TermEntry>> = {}
        for (const review of reviews) {
            const classDoc = review.class as IClass
            const authorId = review.author.toString()
            const userData = userMap.get(authorId)

            if (!classDoc || !userData) continue

            const term = classDoc.term // e.g., "2022FA"
            const termSeason = term.slice(-2) // FA, JA, SP

            const programForTerm = userData.programTerms?.find(pt => pt.terms.includes(term))
            const programId = programForTerm?.program?._id?.toString() || programForTerm?.program

            const belongsToCurrentProgram = programId === courseOption._id.toString()
            const isPostUndergrad = classDoc.academicYear > userData.classOf
            const belongsToMEngProgram = hasMEngProgram && (
                programId === mengProgram._id.toString() ||
                (!programForTerm && userData.isMEng && isPostUndergrad)
            )

            if (hasMEngProgram && userData.isMEng && userData.programTerms && userData.programTerms.length > 0) {
                if (belongsToMEngProgram) {
                    const termYear = term.substring(0, 4)
                    const yearTermKey = `${termYear} ${termSeason}`

                    if (!mengTermMap[yearTermKey]) {
                        mengTermMap[yearTermKey] = new Map()
                    }

                    const rawSubjectNumber = classDoc.subjectNumber
                    const canonicalSubjectNumber = subjectToCanonical.get(rawSubjectNumber) || rawSubjectNumber
                    const canonicalSubjectTitle = subjectTitleMap.get(canonicalSubjectNumber) || classDoc.subjectTitle

                    const existing = mengTermMap[yearTermKey].get(canonicalSubjectNumber)
                    if (existing) {
                        existing.realCount += 1
                    } else {
                        mengTermMap[yearTermKey].set(canonicalSubjectNumber, { subjectTitle: canonicalSubjectTitle, count: 1, realCount: 1 })
                    }
                    continue
                } else if (!belongsToCurrentProgram) {
                    continue
                }
            }

            const yearLabel = getYearLabel(userData.classOf, classDoc.academicYear)
            if (!yearLabel) continue

            const yearTermKey = `${yearLabel} ${termSeason}`

            if (!yearTermMap[yearTermKey]) {
                yearTermMap[yearTermKey] = new Map()
            }

            const rawSubjectNumber = classDoc.subjectNumber
            const canonicalSubjectNumber = subjectToCanonical.get(rawSubjectNumber) || rawSubjectNumber
            const canonicalSubjectTitle = subjectTitleMap.get(canonicalSubjectNumber) || classDoc.subjectTitle

            const existing = yearTermMap[yearTermKey].get(canonicalSubjectNumber)
            if (existing) {
                existing.realCount += 1
            } else {
                yearTermMap[yearTermKey].set(canonicalSubjectNumber, { subjectTitle: canonicalSubjectTitle, count: 1, realCount: 1 })
            }
        }

        const classesByTerm: Record<string, OfCourseClassEntry[]> = {}

        Object.entries(yearTermMap).forEach(([yearTerm, classMap]) => {
            const sorted = Array.from(classMap.entries())
                .sort((a, b) => b[1].realCount - a[1].realCount)
                .slice(0, 10)
                .map(([subjectNumber, { subjectTitle, realCount }]) => ({
                    subjectNumber,
                    subjectTitle,
                    count: realCount >= 3 ? realCount : '<3',
                    realCount
                }))

            classesByTerm[yearTerm] = sorted
        })

        const mengClasses: Record<string, OfCourseClassEntry[]> = {}

        Object.entries(mengTermMap).forEach(([yearTerm, classMap]) => {
            const sorted = Array.from(classMap.entries())
                .sort((a, b) => b[1].realCount - a[1].realCount)
                .slice(0, 10)
                .map(([subjectNumber, { subjectTitle, realCount }]) => ({
                    subjectNumber,
                    subjectTitle,
                    count: realCount >= 3 ? realCount : '<3',
                    realCount
                }))

            mengClasses[yearTerm] = sorted
        })

        if (Object.values(classesByTerm).every(c => c.length === 0) &&
            Object.values(mengClasses).every(c => c.length === 0)) continue

        courseOptionsData.push({
            courseOption: {
                id: courseOption._id,
                courseName: courseOption.courseName || courseOption.departmentName,
                courseOption: courseOption.courseOption,
                departmentCode: courseOption.departmentCode
            },
            classes: classesByTerm,
            mengClasses: mengClasses
        })
    }

    const allData: { courseOption: any; classes: Record<string, OfCourseClassEntry[]>; mengClasses: Record<string, OfCourseClassEntry[]> } = {
        courseOption: {
            id: "All",
            courseName: "All Courses",
            courseOption: null,
            departmentCode: "All"
        },
        classes: {},
        mengClasses: {}
    }

    courseOptionsData.forEach((courseOptionData) => {
        Object.entries(courseOptionData.classes).forEach(([yearTerm, classList]) => {
            if (!allData.classes[yearTerm]) {
                allData.classes[yearTerm] = []
            }

            allData.classes[yearTerm].push(...(classList as OfCourseClassEntry[]))
        })

    })

    const finalAllClasses: typeof allData.classes = {}

    Object.entries(allData.classes).forEach(([yearTerm, classList]) => {
        const accMap = new Map<string, { subjectNumber: string, subjectTitle: string, count: number, realCount: number }>()

        classList.forEach(({ subjectNumber, subjectTitle, count, realCount }) => {
            const canonical = subjectToCanonical.get(subjectNumber) || subjectNumber
            const canonicalTitle = subjectTitleMap.get(canonical) || subjectTitle

            if (accMap.has(canonical)) {
                accMap.get(canonical)!.realCount += (realCount || 0)
            } else {
                accMap.set(canonical, {
                    subjectNumber: canonical,
                    subjectTitle: canonicalTitle,
                    count: Number(count) || 0,
                    realCount: realCount || 0,
                })
            }
        })

        finalAllClasses[yearTerm] = Array.from(accMap.values())
            .sort((a, b) => b.realCount - a.realCount)
            .slice(0, 10)
            .map(({ subjectNumber, subjectTitle, realCount }) => ({
                subjectNumber,
                subjectTitle,
                count: realCount >= 3 ? realCount : '<3' as string | number,
                realCount,
            }))
    })

    allData.classes = finalAllClasses

    courseOptionsData.push(allData)

    // realCount is only used for ranking above; it must not reach the client
    courseOptionsData.forEach((courseOptionData) => {
        Object.entries(courseOptionData.classes).forEach(([yearTerm, classList]) => {
            (classList as any[]).forEach((classItem) => {
                delete classItem.realCount
            })
        })

        if (courseOptionData.mengClasses) {
            Object.entries(courseOptionData.mengClasses).forEach(([yearTerm, classList]) => {
                (classList as any[]).forEach((classItem) => {
                    delete classItem.realCount
                })
            })
        }
    })

    return JSON.parse(JSON.stringify(courseOptionsData))
}
