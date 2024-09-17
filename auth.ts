// @ts-nocheck
import NextAuth from 'next-auth'

import { config } from '@/utils/auth'
export default NextAuth(config)