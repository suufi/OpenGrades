
// @ts-nocheck
import CourseOption from '@/models/CourseOption'
import User from '@/models/User'
import mongoConnection from '@/utils/mongoConnection'
import type {
    GetServerSidePropsContext,
    NextApiRequest,
    NextApiResponse,
} from "next"
import { getServerSession, Profile } from "next-auth"

const LATEST_GRAD_YEAR = 2028
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

                if (!profile.email) {
                    throw new Error('No email found in profile')
                }

                const user = await User.findOne({ email: profile.email })

                return {
                    id: profile.email,
                    name: profile.name,
                    email: profile.email,
                    kerb: profile.email?.split('@')[0],
                    _id: user?._id,
                    verified: user?.verified,
                    classOf: user?.classOf,
                    affiliation: user?.affiliation,
                    trustLevel: user?.trustLevel || 0
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
            },
            httpOptions: {
                timeout: 20000,
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

                        const classYearAffiliations = res.item.affiliations.filter((affiliation: any) =>
                            Object.keys(affiliation).includes('classYear')
                        )

                        const courseOptions = classYearAffiliations.length > 0 ? classYearAffiliations[0].courses : []

                        // Safely get the first classYear affiliation or null if not present
                        const classYearAffiliation = classYearAffiliations.length > 0
                            ? classYearAffiliations[0]
                            : null

                        // Get courseOption objects for each course that the user is affiliated with
                        const courseOptionObjects = await Promise.all(courseOptions.map(async (course: any) => {
                            const query = {
                                departmentCode: course.departmentCode,
                                courseOption: course.courseOption,
                            }

                            // For MEng (course-6) students, they can hold dual status as an undergrad and grad
                            if (course.departmentCode !== '6') {
                                query['courseLevel'] = classYearAffiliation?.classYear == 'G' ? 'G' : 'U'
                            }

                            const courseOption = await CourseOption.findOne(query).select('_id')

                            return courseOption
                        }))

                        const apiAffiliationType = res.item.affiliations[0]?.type || null
                        const existingUser = await User.findOne({ email: profile?.email }).lean()
                        const wasStudent = existingUser?.affiliation === 'student'
                        const shouldPreserveAffiliation = wasStudent && apiAffiliationType === 'affiliate'

                        const verified = shouldPreserveAffiliation ? true : apiAffiliationType === 'student'
                        const affiliation = shouldPreserveAffiliation ? 'alumni' : apiAffiliationType
                        const year = shouldPreserveAffiliation ? 'A' : classYearAffiliation?.classYear || null

                        // Safely compute classOf, handling the absence of classYear
                        const classOf = (classYearAffiliation && classYearAffiliation.classYear !== 'G' && classYearAffiliation.classYear !== 'U')
                            ? (LATEST_GRAD_YEAR + 1) - Number(classYearAffiliation.classYear)
                            : existingUser?.classOf || null

                        const courseAffiliation = shouldPreserveAffiliation
                            ? existingUser?.courseAffiliation || []
                            : courseOptionObjects

                        if (shouldPreserveAffiliation && apiAffiliationType === 'affiliate') {
                            await AuditLog.create({
                                actor: existingUser._id,
                                description: `Preserved student status and course affiliations for ${existingUser.kerb} despite API reporting "affiliate"`,
                                type: 'PreserveAlumni'
                            })
                        }

                        await User.findOneAndUpdate(
                            {
                                email: profile?.email
                            },
                            {
                                $set: {
                                    sub: profile?.email,
                                    name: profile?.name,
                                    email: profile?.email,
                                    kerb: profile?.email?.split('@')[0],
                                    affiliation,
                                    verified,
                                    year,
                                    classOf,
                                    courseAffiliation
                                }
                            },
                            {
                                upsert: true
                            }
                        )

                        // // Log any new users created
                        // if (res.upserted) {
                        //     const user = await User.findOne({ email: profile?.email }).lean()
                        //     if (!user) {
                        //         throw new Error('User not found')
                        //     }
                        //     await AuditLog.create({
                        //         actor: mongoose.Types.ObjectId(user._id),
                        //         descriptimon: `User ${user.name} (${user.email}) signed up.`,
                        //         type: 'JoinPlatform'
                        //     })

                        // }

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
                    } else {
                        throw new Error(res.errorDescription)
                    }
                    // console.log('res111111')
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
    },
    theme: {
        colorScheme: 'light',
        brandColor: '#008CFF'
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