import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '@/pages/api/auth/[...nextauth]'
import { buildGraphData } from '@/utils/prerequisiteGraph'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const session = await getServerSession(req, res, authOptions)
        if (!session) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        const { subjectNumber, depth = '2' } = req.query

        if (!subjectNumber || typeof subjectNumber !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'subjectNumber query parameter is required'
            })
        }

        const maxDepth = Math.min(Math.max(parseInt(depth as string) || 2, 1), 4)
        const graphData = await buildGraphData(subjectNumber, maxDepth)

        return res.status(200).json({
            success: true,
            data: graphData
        })

    } catch (error: any) {
        console.error('Prereq graph API error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}

export default withApiLogger(handler)
