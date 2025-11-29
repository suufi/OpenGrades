import CourseOption from '@/models/CourseOption'
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
    const { method, body } = req
    const session = await auth(req, res)

    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })


    switch (method) {
        case 'GET':
            try {
                const query: any = { active: true }

                if (req.query.courseLevel) {
                    query.courseLevel = req.query.courseLevel
                }

                const data = await CourseOption.find(query).sort({ departmentCode: 1, courseOption: 1 })

                return res.status(200).json({
                    success: true,
                    data
                })
            } catch (error) {
                console.error('Error fetching courses counts:', error)
                return res.status(500).json({ success: false, message: 'Internal Server Error' })
            }

        case 'POST':
            try {
                if (!session) {
                    return res.status(401).json({ success: false, message: 'Unauthorized' })
                }

                if (!session.user || session.user?.trustLevel < 2) {
                    return res.status(403).json({ success: false, message: 'Forbidden' })
                }

                if (!body.term) {
                    return res.status(400).json({ success: false, message: 'Missing term' })
                }

                const requestHeaders = new Headers()
                requestHeaders.append('Content-Type', 'application/json')
                requestHeaders.set('client_id', process.env.MIT_API_CLIENT_ID)
                requestHeaders.set('client_secret', process.env.MIT_API_CLIENT_SECRET)

                const apiFetch = await fetch(`https://mit-courses-v1.cloudhub.io/courses/v1/courses?termCode=${body.term}`, {
                    headers: requestHeaders
                }).then(async (response) => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch courses')
                    }

                    return response.json()
                })

                const courses = apiFetch.items.map((course: any) => {
                    return {
                        departmentCode: course.departmentCode,
                        departmentName: course.departmentName,
                        courseDescription: course.courseDescription,
                        courseName: course.courseName,
                        courseLevel: course.courseLevel,
                        courseOption: course.courseOption
                    }
                })

                const bulkAddResult = await CourseOption.bulkWrite(
                    courses.map((course: any) => ({
                        updateOne: {
                            filter: { courseOption: course.courseOption, departmentCode: course.departmentCode, courseLevel: course.courseLevel },
                            update: { $setOnInsert: course },
                            upsert: true
                        }
                    }))
                )

                return res.status(200).json({
                    success: true,
                    data: bulkAddResult
                })
            } catch (error) {
                console.error('Error fetching courses:', error)
                return res.status(500).json({ success: false, message: 'Internal Server Error' })
            }
        default:
            return res.status(405).json({ success: false, message: 'Method not allowed' })
    }
}
