import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/utils/authMiddleware'
import User from '@/models/User'
import Class from '@/models/Class'
import { findSimilarCoursesByEmbedding } from '@/utils/courseSimilarity'
import { userCanIncludeHarvardCourses } from '@/utils/userHarvardPreference'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const classId = req.query.classId as string
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 12, 24)

        if (!classId) {
            return res.status(400).json({ success: false, message: 'classId is required' })
        }

        const classExists = await Class.findById(classId).select('subjectNumber subjectTitle institution').lean()
        if (!classExists) {
            return res.status(404).json({ success: false, message: 'Class not found' })
        }

        let includeHarvard = false
        const requestUser = await getUserFromRequest(req, res)
        if (requestUser?.email) {
            const user = await User.findOne({ email: requestUser.email })
                .select('lastGradeReportUpload includeHarvardCourses')
                .lean()
            includeHarvard = userCanIncludeHarvardCourses(user)
        }

        const similar = await findSimilarCoursesByEmbedding(classId, {
            limit,
            includeHarvard,
            scope: 'public'
        })

        return res.status(200).json({
            success: true,
            data: similar.map(s => ({
                _id: s.class._id,
                subjectNumber: s.class.subjectNumber,
                subjectTitle: s.class.subjectTitle,
                department: s.class.department,
                term: s.class.term,
                institution: s.class.institution || 'mit',
                score: s.score
            }))
        })
    } catch (error: any) {
        console.error('similar-courses API error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}

export default withApiLogger(handler)
