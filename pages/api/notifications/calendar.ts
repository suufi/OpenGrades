import type { NextApiResponse } from 'next'

import { AuthenticatedRequest, getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import User from '@/models/User'
import { filterUpcoming } from '@/utils/icalParser'
import { loadRegistrarCalendar, REGISTRAR_ICS_URL } from '@/utils/registrarCalendar'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed.' })
    }

    await mongoConnection()

    const user = await getUserFromRequest(req, res)
    if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' })
    }
    const userDoc = await User.findOne({ email: user.email?.toLowerCase() }).select('trustLevel').lean()
    if (!userDoc || (userDoc.trustLevel ?? 0) < 2) {
        return res.status(403).json({ success: false, message: 'Admin access required.' })
    }

    const weeks = Math.min(Math.max(parseInt(req.query.weeks as string, 10) || 8, 1), 26)

    try {
        const { events, fetchedAt } = await loadRegistrarCalendar()
        return res.status(200).json({
            success: true,
            data: {
                events: filterUpcoming(events, new Date(), weeks),
                fetchedAt: new Date(fetchedAt).toISOString(),
                source: REGISTRAR_ICS_URL,
            }
        })
    } catch (error) {
        console.error('Registrar calendar fetch failed:', error)
        return res.status(502).json({
            success: false,
            message: 'Could not reach the MIT Registrar calendar feed.'
        })
    }
}

export default withApiLogger(handler)
