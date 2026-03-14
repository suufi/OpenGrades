// Shared MIT department metadata and colors.
export const MIT_DEPARTMENT_CATALOG: Array<{ code: string; name: string }> = [
    { code: '1', name: 'Civil and Environmental Engineering' },
    { code: '2', name: 'Mechanical Engineering' },
    { code: '3', name: 'Materials Science and Engineering' },
    { code: '4', name: 'Architecture' },
    { code: '5', name: 'Chemistry' },
    { code: '6', name: 'Electrical Engineering and Computer Science' },
    { code: '7', name: 'Biology' },
    { code: '8', name: 'Physics' },
    { code: '9', name: 'Brain and Cognitive Sciences' },
    { code: '10', name: 'Chemical Engineering' },
    { code: '11', name: 'Urban Studies and Planning' },
    { code: '12', name: 'Earth, Atmospheric, and Planetary Sciences' },
    { code: '14', name: 'Economics' },
    { code: '15', name: 'Management' },
    { code: '16', name: 'Aeronautics and Astronautics' },
    { code: '17', name: 'Political Science' },
    { code: '18', name: 'Mathematics' },
    { code: '20', name: 'Biological Engineering' },
    { code: '21', name: 'Humanities' },
    { code: '21A', name: 'Anthropology' },
    { code: 'CMS', name: 'Comparative Media Studies' },
    { code: '21W', name: 'Writing' },
    { code: '21G', name: 'Global Languages' },
    { code: '21H', name: 'History' },
    { code: '21L', name: 'Literature' },
    { code: '21M', name: 'Music' },
    { code: '21S', name: 'Humanities and Science' },
    { code: '21T', name: 'Theater Arts' },
    { code: 'WGS', name: "Women's and Gender Studies" },
    { code: '22', name: 'Nuclear Science and Engineering' },
    { code: '24', name: 'Linguistics and Philosophy' },
    { code: 'CC', name: 'Concourse Program' },
    { code: 'CSB', name: 'Computational and Systems Biology' },
    { code: 'CSE', name: 'Center for Computational Science and Engineering' },
    { code: 'EC', name: 'Edgerton Center' },
    { code: 'EM', name: 'Engineering Management' },
    { code: 'ES', name: 'Experimental Study Group' },
    { code: 'HST', name: 'Health Sciences and Technology' },
    { code: 'IDS', name: 'Institute for Data, Systems and Society' },
    { code: 'MAS', name: 'Media Arts and Sciences' },
    { code: 'SCM', name: 'Supply Chain Management' },
    { code: 'AS', name: 'Aerospace Studies' },
    { code: 'MS', name: 'Military Science' },
    { code: 'NS', name: 'Naval Science' },
    { code: 'STS', name: 'Science, Technology, and Society' },
    { code: 'SWE', name: 'Engineering School-Wide Electives' },
    { code: 'SP', name: 'Special Programs' },
]

export const MIT_DEPARTMENT_ORDER: string[] = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '15', '16', '17', '18', '20',
    '21', '21A', '21E', 'CMS', '21W', '21G', '21H', '21L', '21M', '21S', '21T', 'WGS',
    '22', '24',
    'CC', 'CSB', 'CSE', 'EC', 'EM', 'ES', 'HST', 'IDS', 'MAS', 'OR', 'RED', 'SCM', 'AS', 'MS', 'NS', 'STS', 'SWE', 'SP',
    'UND', 'NONE',
]

const MIT_DEPARTMENT_ORDER_INDEX = new Map(MIT_DEPARTMENT_ORDER.map((code, index) => [code, index]))
const MIT_DEPARTMENT_NAME_MAP = MIT_DEPARTMENT_CATALOG.reduce((acc, department) => {
    acc[department.code] = department.name
    return acc
}, {} as Record<string, string>)

export const MIT_DEPARTMENT_OPTIONS = MIT_DEPARTMENT_CATALOG.map(({ code, name }) => ({
    value: code,
    label: `${name} (${code})`
}))

export const departmentColors: Record<string, string> = {
    '1': '#e74c3c',   // Civil and Environmental Engineering - Red
    '2': '#3498db',   // Mechanical Engineering - Blue
    '3': '#9b59b6',   // Materials Science and Engineering - Purple
    '4': '#1abc9c',   // Architecture - Teal
    '5': '#27ae60',   // Chemistry - Green
    '6': '#2980b9',   // Electrical Engineering and Computer Science - Deep Blue
    '7': '#16a085',   // Biology - Sea Green
    '8': '#f39c12',   // Physics - Orange
    '9': '#e67e22',   // Brain and Cognitive Sciences - Dark Orange
    '10': '#8e44ad',  // Chemical Engineering - Purple
    '11': '#34495e',  // Urban Studies and Planning - Gray
    '12': '#c0392b',  // Earth, Atmospheric, and Planetary Sciences - Dark Red
    '14': '#d35400',  // Economics - Orange
    '15': '#2c3e50',  // Management - Dark
    '16': '#3498db',  // Aeronautics and Astronautics - Blue
    '17': '#7f8c8d',  // Political Science - Gray
    '18': '#9b59b6',  // Mathematics - Purple
    '20': '#27ae60',  // Biological Engineering - Green
    '21': '#e91e63',  // Humanities - Pink
    '21A': '#e91e63', // Anthropology
    '21W': '#e91e63', // Writing
    '21G': '#e91e63', // Global Languages
    '21H': '#e91e63', // History
    '21L': '#e91e63', // Literature
    '21M': '#e91e63', // Music
    '21S': '#e91e63', // Humanities and Science
    '21T': '#e91e63', // Theater Arts
    '22': '#ff5722',  // Nuclear Science and Engineering - Orange Red
    '24': '#795548',  // Linguistics and Philosophy - Brown
    'CC': '#607d8b',  // Concourse Program - Blue Gray
    'CMS': '#607d8b', // Comparative Media Studies
    'CSB': '#4caf50', // Computational and Systems Biology - Green
    'CSE': '#2196f3', // Center for Computational Science and Engineering - Blue
    'EC': '#ff9800',  // Edgerton Center - Orange
    'EM': '#9c27b0',  // Engineering Management - Purple
    'ES': '#00bcd4',  // Experimental Study Group - Cyan
    'HST': '#f44336', // Health Sciences and Technology - Red
    'IDS': '#3f51b5', // Institute for Data, Systems and Society - Indigo
    'MAS': '#009688', // Media Arts and Sciences - Teal
    'SCM': '#ffc107', // Supply Chain Management - Amber
    'AS': '#673ab7',  // Aerospace Studies - Deep Purple
    'MS': '#607d8b',  // Military Science - Blue Gray
    'NS': '#2196f3',  // Naval Science - Blue
    'STS': '#795548', // Science, Technology, and Society - Brown
    'SWE': '#00acc1', // Engineering School-Wide Electives - Cyan
    'SP': '#9e9e9e',  // Special Programs - Gray
    'WGS': '#e91e63', // Women's and Gender Studies - Pink
    'default': '#95a5a6'
}

function normalizeDepartmentCode(departmentCode?: string | null): string {
    return `${departmentCode || ''}`.replace(/^Course\s+/i, '').trim()
}

function compareUnknownDepartmentCodes(aCode: string, bCode: string): number {
    const pattern = /^(\d+)([A-Z]+)?$/
    const aMatch = aCode.match(pattern)
    const bMatch = bCode.match(pattern)

    if (aMatch && bMatch) {
        const numericDifference = Number(aMatch[1]) - Number(bMatch[1])
        if (numericDifference !== 0) return numericDifference
        return (aMatch[2] || '').localeCompare(bMatch[2] || '')
    }

    if (aMatch) return -1
    if (bMatch) return 1
    return aCode.localeCompare(bCode)
}

export function compareDepartmentCodes(a?: string | null, b?: string | null): number {
    const aCode = normalizeDepartmentCode(a)
    const bCode = normalizeDepartmentCode(b)

    if (aCode === bCode) return 0

    const aIndex = MIT_DEPARTMENT_ORDER_INDEX.get(aCode)
    const bIndex = MIT_DEPARTMENT_ORDER_INDEX.get(bCode)

    if (aIndex !== undefined && bIndex !== undefined) {
        return aIndex - bIndex
    }

    if (aIndex !== undefined) return -1
    if (bIndex !== undefined) return 1

    return compareUnknownDepartmentCodes(aCode, bCode)
}

export function sortDepartmentCodes<T extends string>(departmentCodes: T[]): T[] {
    return [...departmentCodes].sort(compareDepartmentCodes)
}

export function getDepartmentName(departmentCode?: string | null): string | null {
    const normalizedCode = normalizeDepartmentCode(departmentCode)
    return MIT_DEPARTMENT_NAME_MAP[normalizedCode] || null
}

export function formatDepartmentOptionLabel(departmentCode?: string | null): string {
    const normalizedCode = normalizeDepartmentCode(departmentCode)
    const departmentName = getDepartmentName(normalizedCode)
    return departmentName ? `${departmentName} (${normalizedCode})` : normalizedCode
}

export function getDepartmentColor(subjectNumber: string): string {
    // Extract department code (e.g., "6.3900" -> "6", "21W.123" -> "21W")
    const match = subjectNumber.match(/^(\d+[A-Z]?|[A-Z]+)/)
    if (match) {
        const dept = match[1]
        return departmentColors[dept] || departmentColors.default
    }
    return departmentColors.default
}
