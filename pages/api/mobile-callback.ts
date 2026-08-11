import { NextApiRequest, NextApiResponse } from 'next'
import { signToken } from '@/utils/jwt'
import { getUserFromRequest } from '@/utils/authMiddleware'

/**
 * Mobile OAuth callback bridge.
 *
 * After NextAuth signs the user in (cookie session), redirects here.
 * We mint a JWT and deep-link back into the app: opengrades://auth?token=...
 *
 * Kept outside /api/auth/[...nextauth] so NextAuth does not treat
 * "mobile-callback" as an unsupported action.
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        res.status(405).json({ success: false, message: 'Method not allowed' })
        return
    }

    try {
        const user = await getUserFromRequest(req, res)
        if (!user) {
            res.redirect(
                `/api/auth/signin?callbackUrl=${encodeURIComponent('/api/mobile-callback')}`
            )
            return
        }

        if (!user.email || !user.kerb) {
            res.status(400).json({
                success: false,
                message: 'Authenticated user is missing email or kerb',
            })
            return
        }

        const token = signToken({
            userId: String(user._id ?? user.id ?? ''),
            email: user.email,
            kerb: user.kerb,
        })

        const mobileRedirectUrl = `opengrades://auth?token=${encodeURIComponent(token)}`

        console.log('Redirecting to mobile app with token')
        res.redirect(mobileRedirectUrl)
    } catch (error) {
        console.error('Error in mobile callback:', error)
        res.status(500).json({
            success: false,
            message: 'Failed to complete mobile authentication',
        })
    }
}
