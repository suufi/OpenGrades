/**
 * Pure mappers that turn MIT Data Warehouse rows into OpenGrades Class fields.
 * Ported from sipb/fireroad-warehouse
 */

const SUBJECT_ID_REGEX = /([A-Z0-9.-]+)(\[J\])?/

export function normalizeSubjectId(id: string): string {
  return id.trim().toUpperCase().replace(/J$/, '')
}

export function termToAcademicYear(term: string): string {
  if (!/^\d{4}(FA|JA|SP|SU)$/i.test(term)) {
    throw new Error(`Invalid MIT term code: ${term}`)
  }
  return term.slice(0, 4)
}

export function hgnToLevel(code: string | null | undefined): 'U' | 'G' | null {
  if (code === 'U' || code === 'G') return code
  if (code === 'H') return 'G'
  return null
}

export function parseOldNumber(statusChange: string | null | undefined): string | null {
  if (!statusChange) return null
  const match = statusChange.match(/Old number:\s+(.*)/)
  if (!match) return null
  const idMatch = match[1].match(SUBJECT_ID_REGEX)
  return idMatch ? normalizeSubjectId(idMatch[1]) : null
}

export function splitSubjectList(value: string | null | undefined): string[] {
  if (!value) return []
  return value.split(',').map(normalizeSubjectId).filter(Boolean)
}

export function isRenumberedAway(statusChange: string | null | undefined): boolean {
  return Boolean(statusChange?.includes('New number'))
}

export function compact<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = v
  }
  return out as Partial<T>
}

const SCHEDULE_NON_EVENING_REGEX =
  /([MTWRFS]+)\s*((1[0-2]?|[2-9])(\.\d+)?(-(1[0-2]?|[2-9])(\.\d+)?)?)/
const SCHEDULE_EVENING_REGEX = /([MTWRFS]+)\s+EVE\s*\((.+)\)/
const SCHEDULE_QUARTER_INFO_REGEX = /\((begins|ends|meets)\s+(.+?)\)/i
const TBA_PATTERNS = [/tba/i, /tbd/i, /^\*/, /arranged/i]

export interface WarehouseOfferedRow {
  SUBJECT_ID: string
  SECTION_ID?: string | null
  IS_MASTER_SECTION?: string | null
  MEET_PLACE?: string | null
  MEET_TIME?: string | null
  IS_LECTURE_SECTION?: string | null
  IS_RECITATION_SECTION?: string | null
  IS_LAB_SECTION?: string | null
  IS_DESIGN_SECTION?: string | null
  RESPONSIBLE_FACULTY_NAME?: string | null
  NUM_ENROLLED_STUDENTS?: number | null
}

export function buildScheduleString(rows: WarehouseOfferedRow[]): {
  schedule: string | null
  quarterInfoDates: string | null
  warnings: string[]
} {
  const buckets: Record<'Lecture' | 'Recitation' | 'Lab' | 'Design', string[]> = {
    Lecture: [], Recitation: [], Lab: [], Design: [],
  }
  let quarterInfoDates: string | null = null
  const warnings: string[] = []

  for (const row of rows) {
    let dest: string[] | null = null
    if (row.IS_LECTURE_SECTION === 'Y') dest = buckets.Lecture
    else if (row.IS_RECITATION_SECTION === 'Y') dest = buckets.Recitation
    else if (row.IS_LAB_SECTION === 'Y') dest = buckets.Lab
    else if (row.IS_DESIGN_SECTION === 'Y') dest = buckets.Design
    if (!dest) {
      warnings.push(`Unknown section type for ${row.SUBJECT_ID} section ${row.SECTION_ID ?? '?'}`)
      continue
    }

    if (!row.MEET_PLACE || !row.MEET_TIME) {
      dest.push('TBA')
      continue
    }

    const meetTime = row.MEET_TIME.replace(':', '.')
    if (TBA_PATTERNS.some((p) => meetTime.match(p))) {
      dest.push('TBA')
      continue
    }

    for (let time of meetTime.split(',')) {
      time = time.trim()

      const quarterMatch = time.match(SCHEDULE_QUARTER_INFO_REGEX)
      if (quarterMatch) quarterInfoDates = quarterMatch[2].toLowerCase()

      const nonEvening = time.match(SCHEDULE_NON_EVENING_REGEX)
      if (nonEvening) {
        dest.push(`${row.MEET_PLACE}/${nonEvening[1]}/0/${nonEvening[2]}`)
        continue
      }
      const evening = time.match(SCHEDULE_EVENING_REGEX)
      if (evening) {
        dest.push(`${row.MEET_PLACE}/${evening[1]}/1/${evening[2]}`)
        continue
      }
      dest.push('TBA')
      warnings.push(`Could not parse schedule "${row.MEET_TIME}" for ${row.SUBJECT_ID}`)
    }
  }

  const parts = (Object.keys(buckets) as Array<keyof typeof buckets>)
    .filter((k) => buckets[k].length > 0)
    .map((k) => `${k},${buckets[k].join(',')}`)
  return { schedule: parts.join(';') || null, quarterInfoDates, warnings }
}

export function termDurationToQuarterInfo(
  termDuration: string | null | undefined,
  quarterInfoDates: string | null
): string | null {
  const dates = quarterInfoDates ?? ''
  switch (termDuration) {
    case 'First Half Term Subject': return `0,${dates}`
    case 'Second Half Term Subject': return `1,${dates}`
    case 'Partial Term Subject': return `2,${dates}`
    default: return null
  }
}


export interface WarehouseCatalogRow {
  SUBJECT_ID: string
  ACADEMIC_YEAR: string
  SUBJECT_TITLE?: string | null
  HGN_CODE?: string | null
  LECTURE_UNITS?: number | null
  LAB_UNITS?: number | null
  DESIGN_UNITS?: number | null
  PREPARATION_UNITS?: number | null
  TOTAL_UNITS?: number | null
  IS_VARIABLE_UNITS?: string | null
  GRADE_RULE_DESC?: string | null
  GRADE_TYPE_DESC?: string | null
  TERM_DURATION?: string | null
  IS_OFFERED_FALL_TERM?: string | null
  IS_OFFERED_IAP?: string | null
  IS_OFFERED_SPRING_TERM?: string | null
  IS_OFFERED_SUMMER_TERM?: string | null
  IS_OFFERED_THIS_YEAR?: string | null
  JOINT_SUBJECTS?: string | null
  EQUIVALENT_SUBJECTS?: string | null
  MEETS_WITH_SUBJECTS?: string | null
  STATUS_CHANGE?: string | null
  ON_LINE_PAGE_NUMBER?: string | null
}

export function catalogRowToClassFields(row: WarehouseCatalogRow): Record<string, unknown> {
  const year = parseInt(row.ACADEMIC_YEAR, 10)
  const joint = splitSubjectList(row.JOINT_SUBJECTS)
  const equivalent = splitSubjectList(row.EQUIVALENT_SUBJECTS)
  const meetsWith = splitSubjectList(row.MEETS_WITH_SUBJECTS)

  const fields: Record<string, unknown> = compact({
    level: hgnToLevel(row.HGN_CODE),
    gradeRule: row.GRADE_RULE_DESC ?? null,
    gradeType: row.GRADE_TYPE_DESC ?? null,
    termDuration: row.TERM_DURATION ?? null,
    notOfferedYear: row.IS_OFFERED_THIS_YEAR !== 'Y' ? `${year - 1}-${year}` : null,
    oldSubjectNumber: parseOldNumber(row.STATUS_CHANGE),
    catalogUrl: row.ON_LINE_PAGE_NUMBER
      ? `${row.ON_LINE_PAGE_NUMBER}#${row.SUBJECT_ID}`
      : null,
  })

  fields.unitsBreakdown = {
    lecture: row.LECTURE_UNITS ?? 0,
    lab: row.LAB_UNITS ?? 0,
    design: row.DESIGN_UNITS ?? 0,
    preparation: row.PREPARATION_UNITS ?? 0,
    isVariable: row.IS_VARIABLE_UNITS === 'Y',
  }
  fields.seasonsOffered = {
    fall: row.IS_OFFERED_FALL_TERM === 'Y',
    iap: row.IS_OFFERED_IAP === 'Y',
    spring: row.IS_OFFERED_SPRING_TERM === 'Y',
    summer: row.IS_OFFERED_SUMMER_TERM === 'Y',
  }
  if (joint.length) fields.jointSubjects = joint
  if (equivalent.length) fields.equivalentSubjects = equivalent
  if (meetsWith.length) fields.meetsWithSubjects = meetsWith
  return fields
}

export function offeredRowsToTermData(rows: WarehouseOfferedRow[]): {
  schedule: string | null
  quarterInfoDates: string | null
  responsibleFaculty: { name: string } | null
  enrollment: number | null
  warnings: string[]
} {
  const master = rows.find((r) => r.IS_MASTER_SECTION === 'Y')
  const sections = rows.filter((r) => r.IS_MASTER_SECTION !== 'Y')
  const { schedule, quarterInfoDates, warnings } = buildScheduleString(sections)
  return {
    schedule,
    quarterInfoDates,
    responsibleFaculty: master?.RESPONSIBLE_FACULTY_NAME
      ? { name: master.RESPONSIBLE_FACULTY_NAME }
      : null,
    enrollment: master?.NUM_ENROLLED_STUDENTS ?? null,
    warnings,
  }
}

export { formatScheduleForDisplay, termDurationLabel } from '@opengrades/api-client'
