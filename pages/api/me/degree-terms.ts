// @ts-nocheck

import User from '@/models/User'
import { auth } from '@/utils/auth'
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

type Data = {
    success: boolean
    data?: object
    message?: string
}

const putSchema = z.object({
    programTerms: z.array(z.object({
        program: z.string(),
        terms: z.array(z.string())
    })).optional(),
    undergradTerms: z.array(z.string()).optional()
})

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
                const user = await User.findOne({ email: session.user.id.toLowerCase() })
                    .populate('courseAffiliation')
                    .populate('classesTaken')
                    .lean()

                if (!user) {
                    return res.status(404).json({ success: false, message: 'User not found' })
                }

                const hasGradAffiliation = user.year === 'G'

                const isEligible = hasGradAffiliation && user.courseAffiliation && user.courseAffiliation.length > 0

                if (!isEligible) {
                    return res.status(200).json({
                        success: true,
                        data: {
                            eligible: false,
                            programs: [],
                            programTerms: [],
                            autoAssigned: {}
                        }
                    })
                }

                const uniqueTerms = new Set<string>()
                if (user.classesTaken) {
                    for (const cls of user.classesTaken) {
                        if (cls.term) {
                            uniqueTerms.add(cls.term)
                        }
                    }
                }

                const allTerms = Array.from(uniqueTerms).sort()

                // If user has already assigned programTerms, return those
                if (user.programTerms && user.programTerms.length > 0) {
                    return res.status(200).json({
                        success: true,
                        data: {
                            eligible: true,
                            programs: user.courseAffiliation,
                            programTerms: user.programTerms,
                            allTerms,
                            autoAssigned: {}
                        }
                    })
                }

                const autoAssignedByProgram: Record<string, string[]> = {}

                if (user.classOf) {
                    // For grad students, assign terms to U programs if before graduation, G programs if after
                    const undergradPrograms = user.courseAffiliation.filter((p: any) => p.courseLevel === 'U')
                    const gradPrograms = user.courseAffiliation.filter((p: any) => p.courseLevel === 'G')

                    for (const term of allTerms) {
                        const academicYear = parseInt(term.substring(0, 4))
                        if (!isNaN(academicYear)) {
                            const yearDiff = user.classOf - academicYear

                            if (yearDiff >= 0 && undergradPrograms.length > 0) {
                                const programId = undergradPrograms[0]._id.toString()
                                if (!autoAssignedByProgram[programId]) {
                                    autoAssignedByProgram[programId] = []
                                }
                                autoAssignedByProgram[programId].push(term)
                            } else if (yearDiff < 0 && gradPrograms.length > 0) {
                                const programId = gradPrograms[0]._id.toString()
                                if (!autoAssignedByProgram[programId]) {
                                    autoAssignedByProgram[programId] = []
                                }
                                autoAssignedByProgram[programId].push(term)
                            }
                        }
                    }
                }

                return res.status(200).json({
                    success: true,
                    data: {
                        eligible: true,
                        programs: user.courseAffiliation,
                        programTerms: [],
                        allTerms,
                        autoAssigned: autoAssignedByProgram
                    }
                })
            } catch (error: unknown) {
                console.error('Error fetching degree terms:', error)
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.message })
                }
                return res.status(500).json({ success: false, message: 'An error occurred' })
            }
            break

        case 'POST':
            try {

                const validation = putSchema.safeParse(body)

                if (!validation.success) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid request body',
                        data: validation.error.errors
                    })
                }

                const { programTerms = [], undergradTerms = [] } = validation.data

                let finalProgramTerms = programTerms

                if ((finalProgramTerms.length === 0) && (undergradTerms && undergradTerms.length > 0)) {
                    const userForAff = await User.findOne({ email: session.user.id.toLowerCase() })
                        .populate('courseAffiliation')
                        .populate('classesTaken')
                        .lean()

                    if (!userForAff) {
                        return res.status(404).json({ success: false, message: 'User not found' })
                    }

                    const allTermsSet = new Set<string>()
                    for (const cls of (userForAff.classesTaken || [])) {
                        if (cls.term) allTermsSet.add(cls.term)
                    }
                    const allTerms = Array.from(allTermsSet)

                    const gradTerms = allTerms.filter(t => !undergradTerms.includes(t))

                    const undergradProgram = (userForAff.courseAffiliation || []).find((p: any) => p.courseLevel === 'U')
                    const gradProgram = (userForAff.courseAffiliation || []).find((p: any) => p.courseLevel === 'G')

                    finalProgramTerms = []
                    if (undergradProgram && undergradTerms.length > 0) {
                        finalProgramTerms.push({ program: undergradProgram._id.toString(), terms: undergradTerms })
                    }
                    if (gradProgram && gradTerms.length > 0) {
                        finalProgramTerms.push({ program: gradProgram._id.toString(), terms: gradTerms })
                    }
                }


                const updateResult = await User.findOneAndUpdate(
                    { email: session.user.id.toLowerCase() },
                    { $set: { programTerms: finalProgramTerms } },
                    { new: true }
                )


                const user = await User.findOne({ email: session.user.id.toLowerCase() })
                    .populate('courseAffiliation')
                    .lean()

                if (!user) {
                    return res.status(404).json({ success: false, message: 'User not found' })
                }


                return res.status(200).json({
                    success: true,
                    data: {
                        programTerms: user.programTerms || []
                    }
                })
            } catch (error: unknown) {
                console.error('Error updating degree terms:', error)
                if (error instanceof Error) {
                    return res.status(400).json({ success: false, message: error.message })
                }
                return res.status(500).json({ success: false, message: 'An error occurred' })
            }
            break

        default:
            return res.status(405).json({ success: false, message: 'Method not allowed' })
    }
}
