import type { NextApiRequest, NextApiResponse } from 'next'

import { withApiLogger } from '@/utils/apiLogger'
import { getUserFromRequest } from '@/utils/authMiddleware'
import mongoConnection from '@/utils/mongoConnection'
import { resolveSafeTwins, scanTwinGroups } from '@/utils/classTwinsDb'

type Data = {
    success: boolean
    data?: object
    message?: string
}

/**
 *
 * GET lists twin groups with attachment counts and the safe-to-hide verdict.
 * POST hides every twin half with no attached reviews/content/users
 *        (display: false, reversible). Pairs with data on both sides are left
 *        for manual review.
 */
async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
    await mongoConnection()

    const user = await getUserFromRequest(req, res)
    if (!user || user.trustLevel < 2) {
        return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
    }

    switch (req.method) {
        case 'GET':
            try {
                const groups = await scanTwinGroups()
                return res.status(200).json({
                    success: true,
                    data: {
                        groups,
                        total: groups.length,
                        autoResolvable: groups.filter((g) => g.safeToHide !== null).length,
                    },
                })
            } catch (error: unknown) {
                console.error('Twin scan failed:', error)
                return res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Twin scan failed' })
            }

        case 'POST':
            try {
                const result = await resolveSafeTwins(user._id?.toString())
                return res.status(200).json({ success: true, data: result })
            } catch (error: unknown) {
                console.error('Twin resolution failed:', error)
                return res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Twin resolution failed' })
            }

        default:
            return res.status(405).json({ success: false, message: 'Method not allowed' })
    }
}

export default withApiLogger(handler)
