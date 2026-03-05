import { NextApiRequest, NextApiResponse } from 'next';
import { signToken } from '@/utils/jwt';
import { getUserFromRequest } from '@/utils/authMiddleware';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        res.status(405).json({ success: false, message: 'Method not allowed' });
        return;
    }

    try {
        const user = await getUserFromRequest(req, res);
        if (!user) {
            res.redirect('/api/auth/signin?callbackUrl=/api/auth/mobile-callback');
            return;
        }

        const token = signToken({
            userId: user._id || user.id,
            email: user.email,
            kerb: user.kerb,
        });

        const mobileRedirectUrl = `opengrades://auth?token=${encodeURIComponent(token)}`;

        console.log('Redirecting to mobile app with token');
        res.redirect(mobileRedirectUrl);
    } catch (error) {
        console.error('Error in mobile callback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete mobile authentication'
        });
    }
}
