import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { getUserFromRequest } from '@/utils/authMiddleware'
import User from '@/models/User'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'
import { buildOfCourseData } from '@/utils/ofcourseData'

/**
 * GET /api/ofcourse
 * JSON version of the "Who's Taken What?" dataset, used by the mobile app.
 * Same gating as the /ofcourse page: trustLevel >= 1 + recent grade report.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const user = await getUserFromRequest(req, res)
        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }
        if ((user.trustLevel ?? 0) < 1) {
            return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        const dbUser = await User.findOne({ email: user.email?.toLowerCase() })
            .select('lastGradeReportUpload')
            .lean()
        if (!hasRecentGradeReport(dbUser?.lastGradeReportUpload)) {
            return res.status(403).json({
                success: false,
                code: 'GRADE_REPORT_REQUIRED',
                message: 'Who\'s Taken What requires a grade report upload within the last 4 months.'
            })
        }

        const courseOptionsData = await buildOfCourseData()

        return res.status(200).json({ success: true, data: { courseOptionsData } })
    } catch (error: any) {
        console.error('ofcourse API error:', error)
        return res.status(500).json({ success: false, message: 'Internal server error' })
    }
}

export default withApiLogger(handler)
