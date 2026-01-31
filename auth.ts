import NextAuth from 'next-auth'

import { config } from '@/utils/auth'

const nextAuthHandler = NextAuth(config)

export default async function handler(req: any, res: any) {
    await nextAuthHandler(req, res)
}