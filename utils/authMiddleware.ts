import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { config } from '@/utils/auth';
import { verifyToken } from '@/utils/jwt';
import User from '@/models/User';
import mongoConnection from '@/utils/mongoConnection';

export interface AuthenticatedRequest extends NextApiRequest {
    user?: any;
}

export async function getUserFromRequest(
    req: AuthenticatedRequest,
    res: NextApiResponse
): Promise<any | null> {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const payload = verifyToken(token);

        if (payload) {
            await mongoConnection();
            const user = await User.findOne({ email: payload.email });

            if (user) {
                return {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    kerb: user.kerb,
                    classOf: user.classOf,
                    affiliation: user.affiliation,
                    trustLevel: user.trustLevel,
                    verified: user.verified,
                };
            }
        }
    }

    // Fall back to cookie-based session
    const session = await getServerSession(req, res, config);

    if (session && session.user) {
        return session.user;
    }

    return null;
}

export function withAuth(
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
        const user = await getUserFromRequest(req, res);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please sign in.',
            });
        }

        req.user = user;

        return handler(req, res);
    };
}

export function withOptionalAuth(
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
        const user = await getUserFromRequest(req, res);

        req.user = user;

        return handler(req, res);
    };
}
