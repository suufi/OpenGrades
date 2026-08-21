type NewClassLike = {
  institution?: string | null
  subjectNumber?: string | null
  firstOffered?: number
}

function getInstitutionRank(institution?: string | null): number {
  if (institution === 'mit') return 0
  if (institution === 'harvard') return 1
  return 2
}

export function prioritizeMitForNewClasses<T extends NewClassLike>(classes: T[], limit = 10): T[] {
  return [...classes]
    .sort((a, b) => {
      const institutionDiff = getInstitutionRank(a.institution) - getInstitutionRank(b.institution)
      if (institutionDiff !== 0) return institutionDiff

      const offeredDiff = (b.firstOffered ?? 0) - (a.firstOffered ?? 0)
      if (offeredDiff !== 0) return offeredDiff

      return (a.subjectNumber ?? '').localeCompare(b.subjectNumber ?? '')
    })
    .slice(0, limit)
}