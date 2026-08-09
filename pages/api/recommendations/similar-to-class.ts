import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/utils/authMiddleware'
import Class from '@/models/Class'
import User from '@/models/User'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'
import { findSimilarCoursesByEmbedding } from '@/utils/courseSimilarity'
import { userCanIncludeHarvardCourses } from '@/utils/userHarvardPreference'

/**
 * Similar classes API endpoint using hybrid recommendations
 * Combines semantic similarity from embeddings with structural relationships from prerequisite graphs
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const requestUser = await getUserFromRequest(req, res)
        if (!requestUser?.email) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        // Check grade report recency
        const user = await User.findOne({ email: requestUser.email })
        if (!user || !hasRecentGradeReport(user.lastGradeReportUpload)) {
            return res.status(403).json({
                success: false,
                message: 'Access to similar class recommendations requires a grade report upload within the last 4 months'
            })
        }

        const classId = req.query.classId as string
        const limit = parseInt(req.query.limit as string) || 10

        if (!classId) {
            return res.status(400).json({ success: false, message: 'classId is required' })
        }

        // Verify class exists
        const classExists = await Class.findById(classId)
        if (!classExists) {
            return res.status(404).json({ success: false, message: 'Class not found' })
        }

        const includeHarvard = userCanIncludeHarvardCourses(user)
        const similar = await findSimilarCoursesByEmbedding(classId, {
            limit,
            includeHarvard,
            scope: 'public'
        })

        const recommendations = similar.map(s => ({
            class: s.class,
            score: s.score,
            reason: s.institution === 'harvard'
                ? 'Similar Harvard course (catalog description)'
                : 'Similar course based on catalog description'
        }))

        return res.status(200).json({
            success: true,
            data: {
                classId,
                className: `${classExists.subjectNumber}: ${classExists.subjectTitle}`,
                recommendations,
                method: 'embedding',
                includeHarvard
            }
        })

    } catch (error) {
        console.error('Similar classes API error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}

export default withApiLogger(handler)
