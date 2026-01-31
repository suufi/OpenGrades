import mongoConnection from '@/utils/mongoConnection'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '../auth/[...nextauth]'
import { hybridRecommendations } from '@/utils/recommendations'
import Class from '@/models/Class'
import User from '@/models/User'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'

/**
 * Similar classes API endpoint using hybrid recommendations
 * Combines semantic similarity from embeddings with structural relationships from prerequisite graphs
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const session = await getServerSession(req, res, authOptions) as any
        if (!session) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        // Check grade report recency
        const user = await User.findOne({ email: session.user?.email })
        if (!user || !hasRecentGradeReport(user.lastGradeReportUpload)) {
            return res.status(403).json({
                success: false,
                message: 'Access to similar class recommendations requires a grade report upload within the last 4 months'
            })
        }

        const classId = req.query.classId as string
        const limit = parseInt(req.query.limit as string) || 10
        const semanticWeight = parseFloat(req.query.semanticWeight as string) || 0.6

        if (!classId) {
            return res.status(400).json({ success: false, message: 'classId is required' })
        }

        // Verify class exists
        const classExists = await Class.findById(classId)
        if (!classExists) {
            return res.status(404).json({ success: false, message: 'Class not found' })
        }

        const recommendations = await hybridRecommendations(classId, limit, semanticWeight)

        return res.status(200).json({
            success: true,
            data: {
                classId,
                className: `${classExists.subjectNumber}: ${classExists.subjectTitle}`,
                recommendations,
                method: 'hybrid',
                semanticWeight,
                structuralWeight: 1 - semanticWeight
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
