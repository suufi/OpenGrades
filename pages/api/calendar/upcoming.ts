import type { NextApiResponse } from 'next'

import { AuthenticatedRequest, getUserFromRequest } from '@/utils/authMiddleware'
import { withApiLogger } from '@/utils/apiLogger'
import mongoConnection from '@/utils/mongoConnection'
import { easternIsoDate, loadRegistrarCalendar } from '@/utils/registrarCalendar'

/**
 * Registrar academic-calendar events for the next few days, for the dashboard
 * banner.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed.' })
    }

    await mongoConnection()

    const user = await getUserFromRequest(req, res)
    if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' })
    }
    if ((user.trustLevel ?? 0) < 1) {
        return res.status(403).json({ success: false, message: 'Account not verified.' })
    }

    const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 2, 0), 200)

    try {
        const { events } = await loadRegistrarCalendar()

        const start = easternIsoDate(0)
        const end = easternIsoDate(days)
        return res.status(200).json({
            success: true,
            data: {
                events: events.filter(e => e.date >= start && e.date <= end),
                today: start,
                days,
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
