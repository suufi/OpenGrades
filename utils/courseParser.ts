/**
 * Utility functions for parsing MIT course data from API responses
 */

export interface ParsedUnits {
    unitHours: string | null
    communicationRequirement: string | null
    hassAttribute: string | null
    girAttributes: string[]
}

export interface InstructorDetail {
    name: string
    kerbId: string
    instrType: string
}

/**
 * Parse the units field from MIT API to extract structured information (unit hours, communication requirement, HASS attribute, GIR attributes)
 * @param units - The raw units string from the MIT API
 * @returns Parsed unit information
 */
export function parseUnitsField(units: string): ParsedUnits {
    if (!units) {
        return {
            unitHours: null,
            communicationRequirement: null,
            hassAttribute: null,
            girAttributes: []
        }
    }

    const trimmedUnits = units.trim()

    // Extract unit hours pattern (e.g., "3-0-9" or "Units arranged")
    let unitHours: string | null = null
    const unitHoursMatch = trimmedUnits.match(/^(\d+-\d+-\d+|Units arranged)/i)
    if (unitHoursMatch) {
        unitHours = unitHoursMatch[1].trim()
    }

    // Extract communication requirement (CI-H, CI-HW) -- CI-Ms in classTags
    let communicationRequirement: string | null = null
    const ciMatch = trimmedUnits.match(/\bCI-(H|HW)\b/i)
    if (ciMatch) {
        communicationRequirement = ciMatch[0].toUpperCase()
    }

    // Extract HASS attribute (HASS-A, HASS-E, HASS-H, HASS-S)
    let hassAttribute: string | null = null
    const hassMatch = trimmedUnits.match(/\bHASS-(A|E|H|S)\b/i)
    if (hassMatch) {
        hassAttribute = hassMatch[0].toUpperCase()
    }

    const girAttributes: string[] = []

    const girMappings: Record<string, string> = {
        'CHEMISTRY': 'CHEM',
        'CHEM': 'CHEM',
        'BIOLOGY': 'BIOL',
        'BIOL': 'BIOL',
        'PHYSICS I': 'PHY1',
        'PHYSICS 1': 'PHY1',
        'PHY1': 'PHY1',
        'PHYSICS II': 'PHY2',
        'PHYSICS 2': 'PHY2',
        'PHY2': 'PHY2',
        'CALC I': 'CAL1',
        'CALC 1': 'CAL1',
        'CAL1': 'CAL1',
        'CALCULUS I': 'CAL1',
        'CALC II': 'CAL2',
        'CALC 2': 'CAL2',
        'CAL2': 'CAL2',
        'CALCULUS II': 'CAL2',
        'LAB': 'LAB',
        'LAB2': 'LAB2',
        'REST': 'REST'
    }

    for (const [apiName, girCode] of Object.entries(girMappings)) {
        const regex = new RegExp(`\\b${apiName}\\b`, 'i')
        if (regex.test(trimmedUnits) && !girAttributes.includes(girCode)) {
            girAttributes.push(girCode)
        }
    }

    return {
        unitHours,
        communicationRequirement,
        hassAttribute,
        girAttributes
    }
}

/**
 * Consolidate instructor information from name string and detailed array
 * 
 * @param instructorString - Comma-separated instructor names
 * @param instructorDetails - Array of instructor detail object
 * @returns Array of structured instructor details
 */
export function parseInstructors(
    instructorString: string,
    instructorDetails?: Array<{ name: string; kerbId: string; instrType: string }>
): InstructorDetail[] {
    if (instructorDetails && instructorDetails.length > 0) {
        return instructorDetails
            .filter(detail => detail && detail.name)
            .map(detail => ({
                name: detail.name?.trim() || '',
                kerbId: detail.kerbId ? detail.kerbId.toUpperCase().trim() : '',
                instrType: detail.instrType ? detail.instrType.toLowerCase().trim() : 'primary'
            }))
    }

    if (!instructorString || instructorString.trim() === '') {
        return []
    }

    const names = instructorString.split(',').map(name => name.trim()).filter(Boolean)
    return names.map(name => ({
        name,
        kerbId: '',
        instrType: 'primary'
    }))
}

/**
 * Parse prerequisites field from MIT API into separate prerequisites and corequisites
 * @param prerequisitesField - Raw prerequisites field from MIT API
 * @returns Object with separate prerequisites and corequisites
 */
export function parsePrerequisites(prerequisitesField: string): {
    prerequisites: string | null
    corequisites: string | null
} {
    if (!prerequisitesField || prerequisitesField.trim() === '') {
        return { prerequisites: null, corequisites: null }
    }

    let prerequisites = prerequisitesField
    let corequisites: string | null = null

    const coreqRegex = /<I>Coreq:\s*([^<]+)<\/I>/gi
    const coreqMatches = [...prerequisitesField.matchAll(coreqRegex)]

    if (coreqMatches.length > 0) {
        corequisites = coreqMatches
            .map(match => match[1].trim())
            .join('; ')

        prerequisites = prerequisitesField.replace(coreqRegex, '').trim()
    }

    prerequisites = prerequisites
        .replace(/<\/?I>/gi, '')
        .replace(/^None\.?\s*/i, '')
        .replace(/^\s*;\s*/, '')
        .replace(/\s*;\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (!prerequisites || prerequisites.toLowerCase() === 'none' || prerequisites.toLowerCase() === 'none.') {
        prerequisites = null
    }

    if (corequisites) {
        corequisites = corequisites
            .replace(/\s+/g, ' ')
            .trim()
    }

    return {
        prerequisites: prerequisites || null,
        corequisites: corequisites || null
    }
}

/**
 * Determine if a course has a final exam
 * 
 * @param _courseData - Course data (reserved for future use)
 * @returns Boolean or null if unknown
 */
export function determineHasFinal(_courseData?: any): boolean | null {
    // TODO: Scrape from Fireroad API

    return null
}
