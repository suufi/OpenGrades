import { NextApiRequest, NextApiResponse } from 'next';
import { signToken } from '@/utils/jwt';
import { getUserFromRequest } from '@/utils/authMiddleware';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const user = await getUserFromRequest(req, res);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated. Please sign in first.'
            });
        }

        const token = signToken({
            userId: user._id || user.id,
            email: user.email,
            kerb: user.kerb,
        });

        return res.status(200).json({
            success: true,
            data: {
                token,
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    kerb: user.kerb,
                    classOf: user.classOf,
                    affiliation: user.affiliation,
                    trustLevel: user.trustLevel,
                },
            },
        });
    } catch (error) {
        console.error('Error generating mobile token:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate authentication token'
        });
    }
}
