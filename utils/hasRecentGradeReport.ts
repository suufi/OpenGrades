import ClassReview from '@/models/ClassReview'

/**
 * Check if a user has uploaded a grade report within the specified period
 * @param lastGradeReportUpload - The date of the user's last grade report upload
 * @param months - Number of months to check (default: 4)
 * @returns true if the user has a recent grade report upload
 */
export function hasRecentGradeReport(
    lastGradeReportUpload: Date | null | undefined,
    months: number = 4
): boolean {
    if (!lastGradeReportUpload) return false

    const cutoffMs = months * 30 * 24 * 60 * 60 * 1000
    const timeSinceUpload = Date.now() - new Date(lastGradeReportUpload).getTime()

    return timeSinceUpload < cutoffMs
}

/**
 * Check if a user has written enough full reviews to access AI chat features
 * Requires that at least 20% of their reviews are full (non-partial) reviews
 * @param userId - The user's MongoDB ObjectId
 * @returns Object with hasAccess boolean, fullReviews count, totalReviews count, and required count
 */
export async function hasEnoughReviewsForAI(
    userId: string
): Promise<{
    hasAccess: boolean
    fullReviews: number
    totalReviews: number
    requiredReviews: number
    percentageRequired: number
}> {
    const percentageRequired = 20

    const [totalReviews, fullReviews] = await Promise.all([
        ClassReview.countDocuments({ author: userId }),
        ClassReview.countDocuments({ author: userId, partial: { $ne: true } })
    ])

    const requiredReviews = totalReviews > 0 ? Math.max(1, Math.ceil(totalReviews * (percentageRequired / 100))) : 1

    return {
        hasAccess: fullReviews >= requiredReviews,
        fullReviews,
        totalReviews,
        requiredReviews,
        percentageRequired
    }
}
