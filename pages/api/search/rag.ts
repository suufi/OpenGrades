import mongoConnection from '@/utils/mongoConnection'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '../auth/[...nextauth]'
import { getRelevantContext, buildContextString } from '@/utils/vectorSearch'
import { streamChatCompletion, checkOllamaHealth } from '@/utils/ollama'
import User from '@/models/User'
import { ICourseOption } from '@/types'
import { hasRecentGradeReport, hasEnoughReviewsForAI } from '@/utils/hasRecentGradeReport'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const session = await getServerSession(req, res, authOptions) as any
        if (!session) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        // Check grade report recency
        const userForAccess = await User.findOne({ email: session.user?.email }).select('_id lastGradeReportUpload')
        if (!userForAccess || !hasRecentGradeReport(userForAccess.lastGradeReportUpload)) {
            return res.status(403).json({
                success: false,
                message: 'Access to AI search requires a grade report upload within the last 4 months'
            })
        }

        // Check review contribution
        const reviewCheck = await hasEnoughReviewsForAI(userForAccess._id.toString())
        if (!reviewCheck.hasAccess) {
            return res.status(403).json({
                success: false,
                message: `Access to AI search requires writing full reviews for at least ${reviewCheck.percentageRequired}% of your classes. You have ${reviewCheck.fullReviews}/${reviewCheck.requiredReviews} required reviews.`
            })
        }

        const { query, conversationHistory = [] } = req.body

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ success: false, message: 'Query is required' })
        }

        // Check Ollama availability
        const isOllamaHealthy = await checkOllamaHealth()
        if (!isOllamaHealthy) {
            return res.status(503).json({
                success: false,
                message: 'LLM service is currently unavailable'
            })
        }

        // Set up Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')

        // Send initial "thinking" event
        res.write(`data: ${JSON.stringify({ type: 'thinking', content: 'Searching courses...' })}\n\n`)

        const context = await getRelevantContext(query, 10)

        // Filter out courses user has already taken
        const takenSubjectNumbersSet = new Set<string>()
        const user = await User.findOne({ email: session.user?.email })
            .populate('classesTaken')
            .lean() as any
        const userTakenClasses = user?.classesTaken || []
        userTakenClasses.forEach((c: any) => {
            if (c.subjectNumber) takenSubjectNumbersSet.add(c.subjectNumber)
            if (c.aliases && Array.isArray(c.aliases)) {
                c.aliases.forEach((alias: string) => takenSubjectNumbersSet.add(alias))
            }
        })

        const filteredContext = {
            ...context,
            classes: context.classes.filter(cls => {
                if (takenSubjectNumbersSet.has(cls.subjectNumber)) {
                    return false
                }
                if (cls.aliases && Array.isArray(cls.aliases)) {
                    if (cls.aliases.some(alias => takenSubjectNumbersSet.has(alias))) {
                        return false
                    }
                }
                return true
            })
        }

        const finalContext = filteredContext


        if (finalContext.classes.length > 0) {
            res.write(`data: ${JSON.stringify({
                type: 'courses',
                content: finalContext.classes.map(c => ({
                    id: c._id,
                    number: c.subjectNumber,
                    title: c.subjectTitle
                }))
            })}\n\n`)

            // Send debug info: classes with scores
            res.write(`data: ${JSON.stringify({
                type: 'debug_classes',
                content: finalContext.classes.map(c => ({
                    number: c.subjectNumber,
                    title: c.subjectTitle,
                    relevance: c.relevance?.substring(0, 100) + '...'
                }))
            })}\n\n`)
        }

        const contextString = buildContextString(finalContext)

        const contextLength = contextString.length


        const userWithAffiliation = await User.findOne({ email: session.user?.email })
            .populate('courseAffiliation')
            .lean() as any

        const takenClasses = userTakenClasses
        const takenClassesString = takenClasses.length > 0
            ? takenClasses.map((c: any) => `${c.subjectNumber} ${c.subjectTitle}`).join(', ')
            : 'None'

        const takenSubjectNumbers = Array.from(takenSubjectNumbersSet).join(', ') || 'None'


        const takenSubjectNumbersNormalized = new Set<string>()
        takenSubjectNumbersSet.forEach(num => {
            takenSubjectNumbersNormalized.add(num.trim().toUpperCase())
        })

        const courseAffiliation = userWithAffiliation?.courseAffiliation || []
        const courseAffiliationString = courseAffiliation.length > 0
            ? courseAffiliation.map((affiliation: ICourseOption) => `${affiliation.departmentName} ${affiliation.courseDescription} ${affiliation.courseLevel}`).join(', ')
            : 'None'

        const majorDescription = courseAffiliationString !== 'None'
            ? courseAffiliationString
            : 'Not specified'


        const deptCounts = new Map<string, number>()
        takenClasses.forEach((c: any) => {
            const dept = c.department || c.subjectNumber?.split('.')[0] || ''
            if (dept) deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1)
        })
        const topDepts = Array.from(deptCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([dept, count]) => `${dept} (${count} classes)`)
            .join(', ')

        const userPrompt = `You are an MIT course advisor. Help this student find the right classes.

=== ABOUT THIS STUDENT ===
Major/Program: ${majorDescription}
Course Departments Most Taken: ${topDepts || 'Not available'}
Total Classes Taken: ${takenClasses.length}

=== CLASSES THIS STUDENT HAS ALREADY TAKEN (DO NOT RECOMMEND THESE) ===
${takenClassesString}
Subject Numbers Already Taken: ${takenSubjectNumbers}

=== CRITICAL: HOW TO DETERMINE WHAT THIS STUDENT HAS TAKEN ===
The ONLY way to know what this student has taken is the "CLASSES THIS STUDENT HAS ALREADY TAKEN" section above.
The "Student Reviews" section contains reviews written by OTHER MIT students - NOT this student.
Do NOT assume the student has taken a class just because it appears in reviews.

=== RULES YOU MUST FOLLOW ===
1. ONLY recommend MIT courses from the "AVAILABLE COURSES" section below
2. Do NOT recommend courses from "CLASSES THIS STUDENT HAS ALREADY TAKEN" section
3. Do NOT mention Coursera, edX, Stanford, Andrew Ng, or any external resources
4. Use EXACT course titles and numbers from the context - do NOT invent course names
5. Personalize recommendations based on the student's major (${majorDescription})
6. Format responses in markdown with clear headings
7. When choosing among courses, consider how the course complement's the student's existing trajectory.

=== AVAILABLE COURSES (ONLY RECOMMEND FROM THIS LIST) ===
${contextString || 'No MIT courses found in the available data.'}

=== STUDENT'S QUESTION ===
${query}

Answer using ONLY the MIT courses listed above. Use exact course numbers (like 6.3900, 6.7900).`

        const messages = [
            ...conversationHistory,
            { role: 'user', content: userPrompt }
        ]

        res.write(`data: ${JSON.stringify({
            type: 'debug_prompt',
            content: userPrompt
        })}\n\n`)

        res.write(`data: ${JSON.stringify({ type: 'thinking', content: 'Generating recommendation...' })}\n\n`)

        try {
            for await (const chunk of streamChatCompletion(messages)) {
                if (chunk.type === 'thinking') {
                    res.write(`data: ${JSON.stringify({ type: 'reasoning', content: chunk.text })}\n\n`)
                } else {
                    const eventType = chunk.isFull ? 'full' : 'chunk'
                    res.write(`data: ${JSON.stringify({ type: eventType, content: chunk.text })}\n\n`)
                }
            }

            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        } catch (streamError) {
            console.error('Streaming error:', streamError)
            res.write(`data: ${JSON.stringify({
                type: 'error',
                content: 'An error occurred while generating the response'
            })}\n\n`)
        }

        res.end()

    } catch (error) {
        console.error('RAG API error:', error)

        // If headers not sent yet, send JSON error
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            })
        } else {
            // If streaming already started, send error event
            res.write(`data: ${JSON.stringify({
                type: 'error',
                content: 'An unexpected error occurred'
            })}\n\n`)
            res.end()
        }
    }
}
