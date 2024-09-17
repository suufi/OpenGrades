// @ts-nocheck
import User from '@/models/User'
import mongoConnection from '@/utils/mongoConnection'
import type {
    GetServerSidePropsContext,
    NextApiRequest,
    NextApiResponse,
} from "next"
import { getServerSession, Profile } from "next-auth"

// You'll need to import and pass this
// to `NextAuth` in `app/api/auth/[...nextauth]/route.ts`
export const config = {
    providers: [
        {
            id: 'mit-oidc',
            name: 'MIT',
            type: 'oauth',
            wellKnown: process.env.MIT_OIDC_WELLKNOWN,
            clientId: process.env.MIT_OIDC_CLIENT_ID,
            clientSecret: process.env.MIT_OIDC_CLIENT_SECRET,
            authorization: { url: process.env.MIT_OIDC_AUTHORIZATION_ENDPOINT, params: { scope: 'openid email profile' } },
            issuer: process.env.MIT_OIDC_ISSUER,
            token: process.env.MIT_OIDC_TOKEN_ENDPOINT,
            profile: async (profile: Profile) => {
                await mongoConnection()

                if (!profile.sub) {
                    throw new Error('No sub found in profile')
                }

                const user = await User.findOne({ sub: profile.sub })

                return {
                    id: profile.sub,
                    name: profile.name,
                    email: profile.email,
                    // kerb: profile.email?.split('@')[0],
                    // _id: user?._id,
                    // verified: user?.verified,
                    // classOf: user?.classOf,
                    // affiliation: user?.affiliation,
                    // trustLevel: user?.trustLevel || 0
                }
            },
            userinfo: {
                async request (context: { tokens: { access_token?: string }; client: { userinfo: (arg0: string) => any } }) {
                    if (context?.tokens?.access_token) {
                        return await context.client.userinfo(context.tokens.access_token)
                    } else {
                        throw new Error('No access token available')
                    }
                },
            }
        }

    ],
    callbacks: {
        async jwt ({ token, user }) {
            user && (token.user = user)
            return token
        },
        async session ({ session, token }) {
            // Send properties to the client, like an access_token from a provider.
            // session.accessToken = token.accessToken
            console.log("session", session)
            console.log("token", token)

            session.user = token.user as { _id: string; trustLevel: number; verified: boolean; kerb: string; name: string; classOf: number; affiliation: string } & { name?: string | null | undefined; email?: string | null | undefined; image?: string | null | undefined }
            return session
        }
    },
    // session: {
    //     strategy: 'jwt'
    // },
    events: {
        async signIn ({ profile }: { profile?: Profile }) {
            console.log("profile", profile)
            await mongoConnection()

            console.log("process.env.MIT_API_CLIENT_ID", process.env.MIT_API_CLIENT_ID)

            const requestHeaders = new Headers()
            requestHeaders.set('client_id', process.env.MIT_API_CLIENT_ID)
            requestHeaders.set('client_secret', process.env.MIT_API_CLIENT_SECRET)
            let apiFetch

            try {
                apiFetch = await fetch(`https://mit-people-v3.cloudhub.io/people/v3/people/${profile?.email?.split('@')[0]}`, {
                    headers: requestHeaders
                }).then(async (response) => {
                    const res = await response.json()
                    console.log(res)

                    if (response.ok) {
                        const classYearAffiliations = res.item.affiliations.filter((affiliation: any) => Object.keys(affiliation).includes('classYear'))
                        const classOf = (classYearAffiliations.length > 0 && classYearAffiliations[0].classYear !== 'G' && classYearAffiliations[0].classYear !== 'U') ? 2027 - Number(classYearAffiliations[0].classYear) : null

                        await User.findOneAndUpdate(
                            {
                                sub: profile?.sub
                            },
                            {
                                $set: {
                                    name: profile?.name,
                                    email: profile?.email,
                                    kerb: profile?.email?.split('@')[0],
                                    affiliation: res.item.affiliations[0].type,
                                    year: res.item.affiliations.filter((affiliation: any) => Object.keys(affiliation).includes('classYear'))[0].classYear,
                                    classOf
                                }
                            },
                            {
                                upsert: true
                            }
                        )

                        // await User.findOrCreate({
                        //   sub: profile?.id
                        // }, {
                        //   sub: profile?.id,
                        //   name: profile?.name,
                        //   kerb: profile?.kerb,
                        //   email: profile?.email,
                        //   affiliation: res.item.affiliations[0].type,
                        //   year: res.item.affiliations.filter((affiliation: any) => Object.keys(affiliation).includes('classYear'))[0].classYear,
                        //   classOf
                        // })
                    }
                    throw new Error(res.errorDescription)
                })
            } catch (error: unknown) {
                console.log(error)
                if (error instanceof Error) {
                    throw new Error(error.message)
                }
            }

            // await User.findOrCreate({
            //   sub: profile.id
            // }, {
            //   sub: profile.id,
            //   name: profile.name,
            //   kerb: profile.kerb,
            //   email: profile.email,
            //   year: 2
            // })
        }
    }
}
// Use it in server contexts
export function auth (
    ...args:
        | [GetServerSidePropsContext["req"], GetServerSidePropsContext["res"]]
        | [NextApiRequest, NextApiResponse]
        | []
) {
    return getServerSession(...args, config)
}