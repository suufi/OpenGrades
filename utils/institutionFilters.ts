
export type Institution = 'mit' | 'harvard'

export const DEFAULT_INSTITUTIONS: Institution[] = ['mit']

export type InstitutionScope = {
  institutions: Institution[]
  includesMit: boolean
  includesHarvard: boolean
  harvardOnly: boolean
  mitOnly: boolean
  both: boolean
  label: string
}

function parseInstitutionList(raw: string): Institution[] {
  return [...new Set(
    raw.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is Institution => value === 'mit' || value === 'harvard')
  )]
}

export function getInstitutionScope(institutions: Institution[]): InstitutionScope {
  const includesMit = institutions.includes('mit')
  const includesHarvard = institutions.includes('harvard')
  const harvardOnly = includesHarvard && !includesMit
  const mitOnly = includesMit && !includesHarvard
  const both = includesMit && includesHarvard

  let label = 'No schools selected'
  if (both) label = 'MIT and Harvard'
  else if (harvardOnly) label = 'Harvard only'
  else if (mitOnly) label = 'MIT only'

  return {
    institutions,
    includesMit,
    includesHarvard,
    harvardOnly,
    mitOnly,
    both,
    label,
  }
}

export function hasInstitutionSelection(institutions: Institution[]): boolean {
  return institutions.length > 0
}

export function isDefaultInstitutionFilter(institutions: Institution[]): boolean {
  return institutions.length === 1 && institutions[0] === 'mit'
}

export function institutionsToQueryParam(institutions: Institution[]): string {
  return institutions.join(',')
}

export function parseInstitutionFiltersFromSession(
  parsed: Record<string, unknown> | undefined
): Institution[] {
  if (Array.isArray(parsed?.schoolFilter)) {
    const schools = parsed.schoolFilter.filter(
      (value): value is Institution => value === 'mit' || value === 'harvard'
    )
    if (schools.length > 0) return schools
  }
  if (parsed?.includeHarvardFilter === true) return ['mit', 'harvard']
  return DEFAULT_INSTITUTIONS
}

export function parseInstitutionFiltersFromRequest(
  institutionsParam: string | string[] | undefined
): Institution[] {
  if (institutionsParam === undefined) {
    return DEFAULT_INSTITUTIONS
  }

  const raw = Array.isArray(institutionsParam) ? institutionsParam[0] : institutionsParam
  if (!raw) {
    return []
  }

  return parseInstitutionList(raw)
}

export function applyInstitutionToMongoQuery(
  query: Record<string, unknown>,
  institutions: Institution[]
): void {
  if (institutions.length === 0) {
    query._id = { $in: [] }
    return
  }

  const { includesMit, includesHarvard, both } = getInstitutionScope(institutions)

  if (both) return

  if (includesHarvard) {
    query.institution = 'harvard'
    return
  }

  if (includesMit) {
    query.institution = 'mit'
  }
}
