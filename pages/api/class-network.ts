import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '@/pages/api/auth/[...nextauth]'
import { buildFullNetworkGraph } from '@/utils/prerequisiteGraph'

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

        const { academicYear, department, includeIsolated } = req.query

        if (!academicYear || typeof academicYear !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'academicYear query parameter is required'
            })
        }

        const year = parseInt(academicYear)
        if (isNaN(year)) {
            return res.status(400).json({
                success: false,
                message: 'academicYear must be a valid number'
            })
        }

        const shouldIncludeIsolated = includeIsolated === 'true'

        const graphData = await buildFullNetworkGraph(
            year,
            typeof department === 'string' ? department : undefined,
            shouldIncludeIsolated
        )

        return res.status(200).json({
            success: true,
            data: graphData,
            meta: {
                academicYear: year,
                department: department || 'all',
                nodeCount: graphData.nodes.length,
                edgeCount: graphData.edges.length
            }
        })

    } catch (error: any) {
        console.error('Class network API error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}

export default withApiLogger(handler)
