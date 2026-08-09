import { createHash } from 'crypto'
import type { IHarvardCourse, IHarvardInstructor, IHarvardMeetingPattern } from '../types/harvardCourse'
import { getHarvardYearFilter } from './harvardYearFilters'
import { removeTags, sanitizeHtml } from './harvardSanitize'
import { normalizeHarvardCourse } from './harvardCourseMapper'

const MH_ENDPOINT =
    'https://courses.my.harvard.edu/psc/courses/EMPLOYEE/EMPL/s/WEBLIB_IS_SCL.ISCRIPT1.FieldFormula.IScript_Search'

const MH_PAGE_SIZE = 25

const DIVISIONAL_AREAS = new Set(['A&H', 'SCI', 'SOC'])

function castAsInt(value: string): number {
    const n = parseInt(value, 10)
    if (Number.isNaN(n)) throw new Error(`invalid integer: ${value}`)
    return n
}

function parseStringOrList(value: unknown): string[] {
    if (value == null) return []
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.map(v => String(v))
    return []
}

function removeAmpersandFromStrList(list: string[]): void {
    for (let i = 0; i < list.length; i++) {
        list[i] = list[i].replace(/&/g, '')
    }
}

function checkDivisionalArea(val: string): boolean {
    return DIVISIONAL_AREAS.has(val)
}

function harvardLevel(level: string): string {
    switch (level) {
        case 'PRIMUGRD':
        case 'INTRO':
            return 'Intro'
        case 'UGRDGRAD':
            return 'Undergrad'
        case 'PRIMGRAD':
            return 'Graduate'
        case 'GRADCOURSE':
            return 'Research'
        default:
            return 'N/A'
    }
}

function mhReverseSemesterOrder(s: string): string {
    const segments = s.split(/\s+/, 2)
    if (segments.length < 2) return s
    return `${segments[1]} ${segments[0]}`
}

function mhTo24hr(s: string): string {
    if (!s) return ''
    const n = s.length
    let offset = 0
    const suffix = s.slice(n - 2).toLowerCase()
    if (suffix === 'am') {
        offset = 0
    } else if (suffix === 'pm') {
        offset = 12
    } else {
        throw new Error(`unknown time format: ${s}`)
    }
    const timePart = s.slice(0, n - 2)
    const parts = timePart.split(':')
    let hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1] ?? '0', 10)
    if (hours === 12) hours = 0
    hours += offset
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function isYes(value: unknown): boolean {
    return typeof value === 'string' && value === 'Y'
}

function mhMakeMeetingPattern(
    mon: unknown, tues: unknown, wed: unknown, thurs: unknown, fri: unknown, sat: unknown, sun: unknown,
    startTime: unknown, endTime: unknown, startDate: unknown, endDate: unknown
): IHarvardMeetingPattern | null {
    if (
        isYes(mon) || isYes(tues) || isYes(wed) ||
        isYes(thurs) || isYes(fri) || isYes(sat) || isYes(sun)
    ) {
        const st = String(startTime ?? '')
        const et = String(endTime ?? '')
        const sd = String(startDate ?? '')
        const ed = String(endDate ?? '')
        return {
            startTime: mhTo24hr(st),
            endTime: mhTo24hr(et),
            startDate: sd.slice(0, 10),
            endDate: ed.slice(0, 10),
            meetsOnMonday: isYes(mon),
            meetsOnTuesday: isYes(tues),
            meetsOnWednesday: isYes(wed),
            meetsOnThursday: isYes(thurs),
            meetsOnFriday: isYes(fri),
            meetsOnSaturday: isYes(sat),
            meetsOnSunday: isYes(sun)
        }
    }
    return null
}

function parseInstructorsFromObj(obj: Record<string, unknown>): IHarvardInstructor[] {
    const raw = obj['IS_SCL_DESCR_IS_SCL_DESCRL']
    const instructors: IHarvardInstructor[] = []
    if (typeof raw === 'string') {
        instructors.push({ name: raw, email: '' })
    } else if (Array.isArray(raw)) {
        for (const name of raw) {
            instructors.push({ name: String(name), email: '' })
        }
    }
    return instructors
}

function parseCourseFromResult(obj: Record<string, unknown>): IHarvardCourse {
    const keyStr = String(obj['Key'] ?? '')
    const id = createHash('md5').update(keyStr).digest('hex')

    const meetingPatterns: IHarvardMeetingPattern[] = []
    if (!('MultiSection' in obj)) {
        const pat = mhMakeMeetingPattern(
            obj['MON'], obj['TUES'], obj['WED'], obj['THURS'], obj['FRI'], obj['SAT'], '',
            obj['IS_SCL_TIME_START'], obj['IS_SCL_TIME_END'], obj['START_DT'], obj['END_DT']
        )
        if (pat) meetingPatterns.push(pat)
    } else {
        const sections = obj['MultiSection']
        if (Array.isArray(sections)) {
            for (const sec of sections) {
                const s = sec as Record<string, unknown>
                const pat = mhMakeMeetingPattern(
                    s['Mo'], s['Tu'], s['We'], s['Th'], s['Fr'], s['Sa'], s['Su'],
                    s['IS_SCL_TIME_START'], s['IS_SCL_TIME_END'], s['START_DT'], s['END_DT']
                )
                if (pat) meetingPatterns.push(pat)
            }
        }
    }

    const levelRaw = obj['CRSE_ATTR_VALUE_HU_LEVL_ATTR']
    const levelStr = levelRaw != null ? String(levelRaw) : ''

    const genEdArea = parseStringOrList(obj['CRSE_ATTR_VALUE_HU_GE_ATTR'])
    removeAmpersandFromStrList(genEdArea)

    const divisionalDist: string[] = []
    for (const dist of parseStringOrList(obj['CRSE_ATTR_VALUE_HU_LDD_ATTR'])) {
        if (checkDivisionalArea(dist)) {
            divisionalDist.push(dist.replace(/&/g, ''))
        }
    }

    const raw: IHarvardCourse = {
        id,
        externalId: castAsInt(String(obj['CRSE_ID'] ?? '0')),
        qGuideId: 0,
        title: removeTags(String(obj['Title'] ?? '')),
        subject: String(obj['SUBJECT'] ?? ''),
        subjectDescription: String(obj['IS_SCL_DESCR_IS_SCL_DESCRD'] ?? ''),
        catalogNumber: String(obj['CATALOG_NBR'] ?? '').trim(),
        level: harvardLevel(levelStr),
        academicGroup: String(obj['ACAD_CAREER'] ?? ''),
        semester: mhReverseSemesterOrder(String(obj['IS_SCL_DESCR_IS_SCL_DESCRH'] ?? '')),
        academicYear: castAsInt(String(obj['ACAD_YEAR'] ?? '0')),
        classSection: String(obj['CLASS_SECTION'] ?? ''),
        component: String(obj['SSR_COMPONENTDESCR'] ?? ''),
        description: sanitizeHtml(String(obj['IS_SCL_DESCR'] ?? '')),
        instructors: parseInstructorsFromObj(obj),
        meetingPatterns,
        genEdArea,
        divisionalDist
    }

    return normalizeHarvardCourse(raw)
}

async function mhSearchRaw(search: Record<string, unknown>): Promise<unknown[]> {
    const reqText = JSON.stringify(search)
    const body = new URLSearchParams({ SearchReqJSON: reqText })

    const resp = await fetch(MH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    })

    if (!resp.ok) {
        throw new Error(`My.Harvard POST failed: ${resp.status} ${resp.statusText}`)
    }

    const jsonResp = await resp.json() as unknown
    if (!Array.isArray(jsonResp)) {
        throw new Error(`My.Harvard response is not an array`)
    }
    return jsonResp
}

async function mhRequest(year: number, page: number): Promise<{
    hitCount: number
    courses: IHarvardCourse[]
}> {
    const yearFilter = getHarvardYearFilter(year)

    const search = {
        ExcludeBracketed: true,
        Exclude300: false,
        Facets: ['IS_SCL_DESCR_IS_SCL_DESCRI:Faculty of Arts & Sciences:School'],
        PageNumber: page,
        SortOrder: ['URL_URLNAME'],
        Category: 'HU_SCL_SCHEDULED_BRACKETED_COURSES',
        SearchPropertiesInResults: true,
        FacetsInResults: false,
        SearchText: yearFilter
    }

    const data = await mhSearchRaw(search)
    if (data.length !== 3) {
        throw new Error(`expected 3 elements in My.Harvard response, got ${data.length}`)
    }

    const results = data[0] as Record<string, unknown>
    const props = data[2] as Record<string, unknown>

    if (props['Key'] !== 'SearchProperties') {
        throw new Error(`expected key SearchProperties, got ${props['Key']}`)
    }
    const realPageSize = Number(props['PageSize'])
    if (realPageSize !== MH_PAGE_SIZE) {
        throw new Error(`expected page size ${MH_PAGE_SIZE}, got ${realPageSize}`)
    }

    const hitCount = Number(props['HitCount'] ?? 0)

    if (results['Key'] !== 'Results') {
        throw new Error(`expected key Results, got ${results['Key']}`)
    }

    const collection = results['ResultsCollection']
    const courses: IHarvardCourse[] = []
    if (Array.isArray(collection)) {
        for (const item of collection) {
            courses.push(parseCourseFromResult(item as Record<string, unknown>))
        }
    }

    return { hitCount, courses }
}

export async function fetchHarvardCoursesPage(year: number, page: number): Promise<{
    hitCount: number
    courses: IHarvardCourse[]
}> {
    return mhRequest(year, page)
}

export async function fetchHarvardCourses(
    year: number,
    options?: { concurrency?: number; onProgress?: (msg: string) => void }
): Promise<IHarvardCourse[]> {
    const concurrency = options?.concurrency ?? 8
    const log = options?.onProgress ?? (() => {})

    const first = await mhRequest(year, 1)
    const hitCount = first.hitCount
    if (hitCount === 0) {
        throw new Error('no courses found for year')
    }

    const totalPages = Math.ceil(hitCount / MH_PAGE_SIZE)
    log(`My.Harvard year ${year}: ${hitCount} hits, ${totalPages} pages`)

    const courses: IHarvardCourse[] = [...first.courses]

    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)

    for (let i = 0; i < pages.length; i += concurrency) {
        const batch = pages.slice(i, i + concurrency)
        const results = await Promise.all(batch.map(p => mhRequest(year, p)))
        for (const r of results) {
            courses.push(...r.courses)
        }
        log(`  fetched pages ${batch[0]}-${batch[batch.length - 1]} of ${totalPages} (${courses.length} rows so far)`)
    }

    courses.sort((a, b) => a.id.localeCompare(b.id))

    const deduped: IHarvardCourse[] = []
    for (const c of courses) {
        if (deduped.length === 0 || deduped[deduped.length - 1].id !== c.id) {
            deduped.push(c)
        }
    }

    log(`read ${deduped.length} courses (${courses.length} before dedupe)`)
    return deduped
}
