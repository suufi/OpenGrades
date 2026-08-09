/** Academic year → My.Harvard STRM search filter (Fall + Spring terms). */
const YEAR_STRM_FILTERS: Record<number, string> = {
    2023: '(STRM:"2228" | STRM:"2232")',
    2024: '(STRM:"2238" | STRM:"2242")',
    2025: '(STRM:"2248" | STRM:"2252")',
    2026: '(STRM:"2258" | STRM:"2262")',
    2027: '(STRM:"2268" | STRM:"2272")',
}

export function getHarvardYearFilter(year: number): string {
    const filter = YEAR_STRM_FILTERS[year]
    if (!filter) {
        throw new Error(
            `No My.Harvard STRM filter for academic year ${year}. ` +
            `Add it to utils/harvardYearFilters.ts (see classes.wtf mhGetYearFilter).`
        )
    }
    return filter
}

export function supportedHarvardYears(): number[] {
    return Object.keys(YEAR_STRM_FILTERS).map(Number).sort((a, b) => a - b)
}
