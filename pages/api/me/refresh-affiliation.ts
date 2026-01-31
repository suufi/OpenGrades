import CourseOption from '@/models/CourseOption'
import User from '@/models/User'
import { auth } from '@/utils/auth'
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

export default async function handler (
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    await mongoConnection()
    const { method } = req

    const session = await auth(req, res)

    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    if (method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        const kerb = session.user?.email?.split('@')[0]

        if (!kerb) {
            throw new Error('No kerberos found in session')
        }

        const requestHeaders = new Headers()
        requestHeaders.set('client_id', process.env.MIT_API_CLIENT_ID)
        requestHeaders.set('client_secret', process.env.MIT_API_CLIENT_SECRET)

        const apiResponse = await fetch(`https://mit-people-v3.cloudhub.io/people/v3/people/${kerb}`, {
            headers: requestHeaders
        })

        const apiData = await apiResponse.json()

        if (!apiResponse.ok) {
            throw new Error(apiData.errorDescription || 'Failed to fetch from MIT API')
        }

        const classYearAffiliations = apiData.item.affiliations.filter((affiliation: any) =>
            Object.keys(affiliation).includes('classYear')
        )

        const courseOptions = classYearAffiliations.length > 0 ? classYearAffiliations[0].courses : []

        const classYearAffiliation = classYearAffiliations.length > 0
            ? classYearAffiliations[0]
            : null

        const courseOptionObjects = await Promise.all(courseOptions.map(async (course: any) => {
            const query = {
                departmentCode: course.departmentCode,
                courseOption: course.courseOption,
            }

            if (course.departmentCode !== '6') {
                query['courseLevel'] = classYearAffiliation?.classYear == 'G' ? 'G' : 'U'
            }

            const courseOption = await CourseOption.findOne(query).select('_id')

            return courseOption
        }))

        const validCourseOptionObjects = courseOptionObjects.filter(co => co !== null)

        const user = await User.findOne({ email: session.user?.id.toLowerCase() })
            .populate('courseAffiliation')
            .lean()

        const newCourseAffiliationIds = new Set(validCourseOptionObjects.map(co => co._id.toString()))
        const preservedHistoricalPrograms: any[] = []

        if (user && user.programTerms && user.programTerms.length > 0) {
            const programsWithTerms = new Set(
                user.programTerms.map((pt: any) =>
                    typeof pt.program === 'string' ? pt.program : pt.program._id?.toString()
                ).filter(Boolean)
            )

            for (const programId of programsWithTerms) {
                if (!newCourseAffiliationIds.has(programId)) {
                    const historicalProgram = user.courseAffiliation?.find((co: any) =>
                        co._id.toString() === programId
                    )
                    if (historicalProgram) {
                        preservedHistoricalPrograms.push({ _id: programId })
                    }
                }
            }
        }

        const finalCourseAffiliation = [...validCourseOptionObjects, ...preservedHistoricalPrograms]

        await User.findOneAndUpdate(
            { email: session.user?.id.toLowerCase() },
            { courseAffiliation: finalCourseAffiliation }
        )

        const updatedUser = await User.findOne({ email: session.user?.id.toLowerCase() }).populate('classesTaken').populate('courseAffiliation').lean()

        return res.status(200).json({
            success: true,
            data: updatedUser,
            message: 'Course affiliations refreshed successfully'
        })

    } catch (error: unknown) {
        console.error('Error refreshing affiliations:', error)
        if (error instanceof Error) {
            return res.status(500).json({ success: false, message: error.message })
        }
        return res.status(500).json({ success: false, message: 'An error occurred' })
    }
}
