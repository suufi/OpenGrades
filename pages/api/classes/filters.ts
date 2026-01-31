import Class from '@/models/Class'
import mongoConnection from '@/utils/mongoConnection'
import { auth } from '@/utils/auth'
import { withApiLogger } from '@/utils/apiLogger'
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

async function handler (
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    await mongoConnection()
    const { method } = req

    const session = await auth(req, res)
    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })
    if (!session.user || session.user?.trustLevel < 1) {
        return res.status(403).json({ success: false, message: 'Not authorized.' })
    }

    if (method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {

        const distinctYears = await Class.distinct('academicYear')
        const departments = await Class.distinct('department')

        return res.status(200).json({
            success: true,
            data: {
                years: distinctYears,
                departments
            }
        })
    } catch (error) {
        console.error('Error fetching class counts:', error)
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

export default withApiLogger(handler)
