// Department colors for visual clustering
// Based on MIT course catalog departments
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
    '21M': '#e91e63', // Music and Theater Arts
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

export function getDepartmentColor(subjectNumber: string): string {
    // Extract department code (e.g., "6.3900" -> "6", "21W.123" -> "21W")
    const match = subjectNumber.match(/^(\d+[A-Z]?|[A-Z]+)/)
    if (match) {
        const dept = match[1]
        return departmentColors[dept] || departmentColors.default
    }
    return departmentColors.default
}


