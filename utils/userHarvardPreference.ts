import { hasRecentGradeReport } from './hasRecentGradeReport'

type UserHarvardFields = {
    lastGradeReportUpload?: Date | null
    includeHarvardCourses?: boolean
}

export function userCanIncludeHarvardCourses(user: UserHarvardFields | null | undefined): boolean {
    if (!user) return false
    return hasRecentGradeReport(user.lastGradeReportUpload) && user.includeHarvardCourses === true
}
