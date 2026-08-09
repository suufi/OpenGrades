import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger, logLlmEvent, type ApiLoggerMeta } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '@/utils/authMiddleware'
import { getRelevantContext } from '@/utils/vectorSearch'
import { chatCompletionWithProvider, checkOllamaHealth } from '@/utils/ollama'
import { generateOptimizedQuery } from '@/utils/queryGenerator'
import User from '@/models/User'
import { ICourseOption } from '@/types'
import { hasRecentGradeReport, hasEnoughReviewsForAI } from '@/utils/hasRecentGradeReport'
import { userCanIncludeHarvardCourses } from '@/utils/userHarvardPreference'
import { resolveThinkingParts, stripThinkingTags } from '@/utils/llmThinking'
import { normalizeCourseNumber } from '@/utils/courseNumbers'
import ClassReview from '@/models/ClassReview'
import AISearchConversation, { type AISearchCourseReference } from '@/models/AISearchConversation'
import { Types } from 'mongoose'
import {
    normalizeConversationHistory,
    resolveContextualSearchIntent,
} from '@/utils/aiSearchConversation'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const requestUser = await getUserFromRequest(req, res)
        if (!requestUser?.email) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        // Check grade report recency
        const userForAccess = await User.findOne({ email: requestUser.email })
            .select('_id lastGradeReportUpload includeHarvardCourses')
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

        const { query, conversationId, conversationHistory = [], useQueryGeneration = false } = req.body

        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ success: false, message: 'Query is required' })
        }
        if (query.length > 10000) {
            return res.status(400).json({ success: false, message: 'Query is too long' })
        }

        if (conversationId && (typeof conversationId !== 'string' || !Types.ObjectId.isValid(conversationId))) {
            return res.status(400).json({ success: false, message: 'Invalid conversation ID' })
        }

        let conversation = conversationId
            ? await AISearchConversation.findOne({
                _id: conversationId,
                user: userForAccess._id
            })
            : null

        if (conversationId && !conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' })
        }

        const requestHistory = normalizeConversationHistory(conversationHistory)
        if (!conversation) {
            conversation = await AISearchConversation.create({
                user: userForAccess._id,
                title: buildConversationTitle(query),
                messages: requestHistory.map(message => ({
                    ...message,
                    createdAt: new Date()
                }))
            })
        }

        const filteredHistory = normalizeConversationHistory(conversation.messages)
        const resolvedIntent = resolveContextualSearchIntent(query, filteredHistory)
        const persistedConversationId = conversation._id.toString()
        const shouldAutoTitle = conversation.messages.length === 0 && conversation.title === 'New course search'
        const persistedConversationTitle = shouldAutoTitle
            ? buildConversationTitle(query)
            : conversation.title

        await AISearchConversation.updateOne(
            { _id: conversation._id, user: userForAccess._id },
            {
                $set: shouldAutoTitle
                    ? { title: persistedConversationTitle }
                    : {},
                $push: {
                    messages: {
                        $each: [{ role: 'user', content: query.trim(), createdAt: new Date() }],
                        $slice: -100
                    }
                }
            }
        )

        const persistAssistantMessage = async (
            content: string,
            reasoning?: string,
            courses?: AISearchCourseReference[]
        ) => {
            await AISearchConversation.updateOne(
                { _id: conversation._id, user: userForAccess._id },
                {
                    $push: {
                        messages: {
                            $each: [{
                                role: 'assistant',
                                content: content.slice(0, 50000),
                                reasoning: reasoning?.slice(0, 50000) || undefined,
                                courses,
                                createdAt: new Date()
                            }],
                            $slice: -100
                        }
                    }
                }
            )
        }

        const parleyApiKey = (req.headers['x-parley-api-key'] as string) || ''
        const parleyModel = (req.headers['x-parley-model'] as string) || 'claude-sonnet-5'
        const useParley = Boolean(parleyApiKey)

        const logMeta: ApiLoggerMeta = {
            user: { email: requestUser.email, kerb: (requestUser as any).kerb }
        }
        const chatProvider = useParley ? 'parley' : (process.env.LLM_CHAT_PROVIDER || 'ollama') as 'ollama' | 'gemini' | 'parley'
        const chatModel = useParley ? parleyModel : (process.env.LLM_CHAT_PROVIDER === 'gemini' ? (process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash') : (process.env.OLLAMA_CHAT_MODEL || 'gpt-oss:20b'))
        let parleyFallbackNotified = false
        const notifyParleyFallback = (error: Error) => {
            if (parleyFallbackNotified) return
            parleyFallbackNotified = true
            res.write(`data: ${JSON.stringify({
                type: 'thinking',
                content: `Parley unavailable (${error.message}). Falling back to the default model...`
            })}\n\n`)
        }
        const runChat = (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) =>
            chatCompletionWithProvider(messages, {
                useParley,
                parleyApiKey: parleyApiKey,
                parleyModel,
                onParleyFallback: notifyParleyFallback,
            })

        if (!useParley) {
            const isOllamaHealthy = await checkOllamaHealth()
            if (!isOllamaHealthy) {
                return res.status(503).json({
                    success: false,
                    message: 'LLM service is currently unavailable'
                })
            }
        }

        // Set up Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')
        res.write(`data: ${JSON.stringify({
            type: 'conversation',
            content: { id: persistedConversationId, title: persistedConversationTitle }
        })}\n\n`)

        let searchQuery = resolvedIntent.searchQuery
        if (resolvedIntent.usedConversationContext) {
            res.write(`data: ${JSON.stringify({ type: 'debug', content: `Resolved follow-up query: "${searchQuery}"` })}\n\n`)
        }
        if (useQueryGeneration) {
            res.write(`data: ${JSON.stringify({ type: 'thinking', content: 'Optimizing search query...' })}\n\n`)
            try {
                const originalSearchQuery = searchQuery
                searchQuery = await generateOptimizedQuery(searchQuery)
                if (searchQuery !== originalSearchQuery) {
                    res.write(`data: ${JSON.stringify({ type: 'debug', content: `Optimized query: "${searchQuery}"` })}\n\n`)
                }
            } catch (error) {
                console.error('Query generation failed, using original:', error)
            }
        }

        // Filter out courses user has already taken
        const takenSubjectNumbersSet = new Set<string>()
        const takenSubjectNumbersNormalized = new Set<string>()
        const includeHarvard = userCanIncludeHarvardCourses(userForAccess)

        const [user, droppedClassReviews] = await Promise.all([
            User.findOne({ _id: userForAccess._id })
                .populate('classesTaken')
                .populate('courseAffiliation')
                .lean(),
            ClassReview.find({ author: userForAccess._id, droppedClass: true }).select('class').lean()
        ])

        const droppedClassIds = new Set(droppedClassReviews.map((review) => review.class.toString()))
        const userTakenClasses = (user?.classesTaken || [])
            .filter((c: any) => c !== null && c !== undefined)
            .filter((c: any) => !droppedClassIds.has(c._id.toString()))

        userTakenClasses.forEach((c: any) => {
            if (c.subjectNumber) {
                takenSubjectNumbersSet.add(c.subjectNumber)
                takenSubjectNumbersNormalized.add(normalizeCourseNumber(c.subjectNumber))
            }
            if (c.aliases && Array.isArray(c.aliases)) {
                c.aliases.forEach((alias: string) => {
                    takenSubjectNumbersSet.add(alias)
                    takenSubjectNumbersNormalized.add(normalizeCourseNumber(alias))
                })
            }
        })

        if (user?.creditedSubjects && Array.isArray(user.creditedSubjects)) {
            user.creditedSubjects.forEach((subj: string) => {
                takenSubjectNumbersSet.add(subj)
                takenSubjectNumbersNormalized.add(normalizeCourseNumber(subj))
            })
        }

        const deptCounts = new Map<string, number>()
        userTakenClasses.forEach((c: any) => {
            const dept = c.department || c.subjectNumber?.split('.')[0] || ''
            if (dept) deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1)
        })

        const departmentBoosts = new Map<string, number>()
        const maxDeptCount = Math.max(...deptCounts.values(), 1)
        for (const [dept, count] of deptCounts.entries()) {
            const normalizedBoost = (count / maxDeptCount) * 0.35
            departmentBoosts.set(dept, Math.min(0.35, normalizedBoost))
        }

        res.write(`data: ${JSON.stringify({ type: 'thinking', content: 'Searching courses...' })}\n\n`)

        const context = await getRelevantContext(searchQuery, 30, {
            departmentBoosts,
            includeHarvard,
            institution: resolvedIntent.harvardOnly ? 'harvard' : undefined,
            studentProfile: {
                totalTaken: userTakenClasses.length,
                takenByDepartment: deptCounts,
                takenSubjectNumbers: Array.from(takenSubjectNumbersNormalized),
                takenCourseTitles: userTakenClasses.map((c: any) => c.subjectTitle || '').filter(Boolean)
            }
        })

        const finalContext = {
            ...context,
            classes: context.classes.filter(cls => {
                if (cls.institution === 'harvard' && !includeHarvard) return false
                if (resolvedIntent.harvardOnly && cls.institution !== 'harvard') return false
                const normalizedSubjectNumber = normalizeCourseNumber(cls.subjectNumber)
                if (normalizedSubjectNumber && takenSubjectNumbersNormalized.has(normalizedSubjectNumber)) {
                    return false
                }
                if (cls.aliases && Array.isArray(cls.aliases)) {
                    if (cls.aliases.some(alias => takenSubjectNumbersNormalized.has(normalizeCourseNumber(alias)))) {
                        return false
                    }
                }
                return true
            })
        }

        if (finalContext.classes.length > 0) {
            // Send debug info: classes with scores
            res.write(`data: ${JSON.stringify({
                type: 'debug_classes',
                content: finalContext.classes.map(c => ({
                    number: c.subjectNumber,
                    title: c.subjectTitle,
                    relevance: truncate(c.relevance || '', 140),
                    score: typeof c.retrievalScore === 'number' ? Number(c.retrievalScore.toFixed(3)) : undefined,
                    prereqReadiness: (
                        typeof c.metPrereqCount === 'number' &&
                        typeof c.totalPrereqCount === 'number' &&
                        c.totalPrereqCount > 0
                    )
                        ? `${c.metPrereqCount}/${c.totalPrereqCount}`
                        : undefined,
                    prereqDepth: typeof c.prereqDepth === 'number' ? c.prereqDepth : undefined
                }))
            })}\n\n`)
        }

        const selectionContextString = buildSelectionContext(finalContext.classes, searchQuery)

        const takenClassesString = userTakenClasses.length > 0
            ? userTakenClasses.map((c: any) => `${c.subjectNumber} ${c.subjectTitle}`).join(', ')
            : 'None'

        const takenSubjectNumbers = Array.from(takenSubjectNumbersSet).join(', ') || 'None'


        const courseAffiliation = (user?.courseAffiliation || []).filter((a: any) => a !== null && a !== undefined)
        const courseAffiliationString = courseAffiliation.length > 0
            ? courseAffiliation.map((affiliation: ICourseOption) => `${affiliation.departmentName} ${affiliation.courseDescription} ${affiliation.courseLevel}`).join(', ')
            : 'None'

        const majorDescription = courseAffiliationString !== 'None'
            ? courseAffiliationString
            : 'Not specified'

        const topDepts = Array.from(deptCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([dept, count]) => `${dept} (${count} classes)`)
            .join(', ')

        const allowedCourses = finalContext.classes.map(c => ({
            id: c._id?.toString?.() || c._id,
            number: c.subjectNumber,
            title: c.subjectTitle,
            aliases: c.aliases || [],
            institution: c.institution || 'mit'
        }))

        const harvardCoursesInCandidates = finalContext.classes.some(c => c.institution === 'harvard')
        const harvardRulesBlock = includeHarvard && harvardCoursesInCandidates
            ? resolvedIntent.harvardOnly
                ? `\n10. The student specifically requested Harvard cross-registration options. Select ONLY courses marked [HARVARD].
11. Do not mention schools other than MIT and Harvard.
12. Always clearly label Harvard courses as "[Harvard Cross-Registration]" in your response.`
                : `\n10. Courses marked [HARVARD] are available through MIT's cross-registration program. Prioritize MIT courses, but include Harvard options when they are highly relevant to the query.
11. Do not mention schools other than MIT and Harvard.
12. Always clearly label Harvard courses as "[Harvard Cross-Registration]" in your response.`
            : `\n10. Do not mention external schools/resources`

        const systemPrompt = `You are an MIT course advisor selecting courses from a constrained list.

=== ABOUT THIS STUDENT ===
Major/Program: ${majorDescription}
Course Departments Most Taken: ${topDepts || 'Not available'}
Total Classes Taken: ${userTakenClasses.length}

=== CLASSES THIS STUDENT HAS ALREADY TAKEN (DO NOT RECOMMEND THESE) ===
${takenClassesString}
Subject Numbers Already Taken: ${takenSubjectNumbers}

=== CRITICAL: HOW TO DETERMINE WHAT THIS STUDENT HAS TAKEN ===
The ONLY way to know what this student has taken is the "CLASSES THIS STUDENT HAS ALREADY TAKEN" section above.
The "Student Reviews" section contains reviews written by OTHER MIT students - NOT this student.
Do NOT assume the student has taken a class just because it appears in reviews.

=== SELECTION RULES ===
1. Recommend courses from the "ALLOWED COURSES" section below.${resolvedIntent.harvardOnly ? ' The student requested Harvard cross-registration options, so recommend only Harvard courses.' : ` Prioritize MIT courses${includeHarvard && harvardCoursesInCandidates ? ', but include Harvard cross-registration options when highly relevant' : ''}.`}
2. NEVER recommend a course listed in "CLASSES THIS STUDENT HAS ALREADY TAKEN"
3. Prioritize direct topical fit to the user query over generic similarity
4. Personalize based on this student's trajectory and major (${majorDescription})
5. Use exact course number/title from ALLOWED COURSES; never invent names
6. Prefer direct semantic fit to the query and student trajectory, consider how the course complement's the student's existing trajectory.
7. Prefer progression-ready courses where this student already satisfies most/all referenced prerequisites; use prerequisite chain depth to prioritize advanced-but-feasible options
8. Format responses in markdown with clear headings
9. At most 2 out of 5 recommended courses should be Harvard courses, unless the student explicitly asks for Harvard courses.${harvardRulesBlock}

=== CANDIDATE COURSES (FOR RELEVANCE JUDGMENT) ===
${selectionContextString || 'No courses found in the available data.'}

=== ALLOWED COURSES (AUTHORITATIVE IDS) ===
${JSON.stringify(allowedCourses)}

=== OUTPUT FORMAT (STRICT) ===
Return JSON only. No markdown, no prose.
Schema:
{
  "courses": [
    { "id": "<course id from ALLOWED COURSES>" }
  ]
}
Rules:
- You must return at most 5 courses from ALLOWED COURSES.

- If unsure, choose the closest matches.

`

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...filteredHistory,
            { role: 'user', content: `Current request: ${query}\nResolved search intent: ${searchQuery}` }
        ]

        res.write(`data: ${JSON.stringify({
            type: 'debug_prompt',
            content: `SYSTEM:\\n${systemPrompt}\\n\\nUSER:\\n${query}\\n\\nRESOLVED SEARCH INTENT:\\n${searchQuery}`
        })}\n\n`)

        const fallbackMessage = resolvedIntent.harvardOnly
            ? 'I couldn’t find enough directly relevant Harvard cross-registration courses. Try adding a more specific topic, method, or department.'
            : 'I couldn’t find enough directly relevant MIT courses. Try adding concrete topic terms (methods, domain area, constraints, or course level) so I can rank more precisely.'

        if (finalContext.classes.length === 0) {
            await persistAssistantMessage(fallbackMessage)
            res.write(`data: ${JSON.stringify({
                type: 'full',
                content: fallbackMessage
            })}\n\n`)
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
            res.end()
            return
        }

        res.write(`data: ${JSON.stringify({ type: 'thinking', content: 'Generating recommendation...' })}\n\n`)

        try {
            const allowedByNumber = new Map<string, { number: string; title: string; id: string }>()
            const allowedMetaById = new Map<string, { number: string; title: string; id: string; aliases: string[] }>()
            const contextById = new Map<string, any>()

            allowedCourses.forEach(c => {
                if (!c.id) return
                const id = c.id.toString()
                const entry = { id, number: c.number, title: c.title }

                allowedMetaById.set(id, { ...entry, aliases: c.aliases || [] })
                allowedByNumber.set(normalizeCourseNumber(c.number), entry)
                for (const alias of c.aliases || []) {
                    allowedByNumber.set(normalizeCourseNumber(alias), entry)
                }
            })

            finalContext.classes.forEach(c => {
                const id = c._id?.toString?.() || c._id
                if (id) {
                    contextById.set(id.toString(), c)
                }
            })

            const parseAndSelect = (responseText: string) => {
                const parsed = parseCoursesJson(responseText)
                const failures: string[] = []

                if (!parsed || !Array.isArray(parsed.courses)) {
                    return {
                        selected: [],
                        failures: ['invalid_schema_or_non_json']
                    }
                }

                const selectedById = new Map<string, { id: string; number: string; title: string }>()

                for (const entry of parsed.courses) {
                    if (!entry || typeof entry !== 'object') {
                        failures.push('invalid_course_entry')
                        continue
                    }

                    const rawId = entry?.id?.toString?.()?.trim()
                    const rawNumber = entry?.number?.toString?.()?.trim()

                    let course: { id: string; number: string; title: string } | undefined =
                        rawId ? allowedMetaById.get(rawId) : undefined
                    if (!course && rawId) {
                        course = allowedByNumber.get(normalizeCourseNumber(rawId))
                    }
                    if (!course && rawNumber) {
                        course = allowedByNumber.get(normalizeCourseNumber(rawNumber))
                    }

                    if (!course) {
                        failures.push(`invalid_or_unknown_id:${rawId || rawNumber || 'missing'}`)
                        continue
                    }

                    if (selectedById.has(course.id)) {
                        failures.push(`duplicate_course:${course.id}`)
                        continue
                    }

                    selectedById.set(course.id, {
                        id: course.id,
                        number: course.number,
                        title: course.title
                    })
                }

                const parsedSelected = Array.from(selectedById.values()).slice(0, 5)
                const validated = validateRerankerSelections(
                    parsedSelected,
                    allowedMetaById,
                    takenSubjectNumbersNormalized
                )
                return {
                    selected: validated.selected,
                    failures: [...failures, ...validated.failures]
                }
            }

            let compactCoursesJson: string | null = null
            const getCompactCoursesJson = () => {
                compactCoursesJson ??= JSON.stringify(finalContext.classes.map(c => ({
                    id: c._id?.toString?.() || c._id,
                    number: c.subjectNumber,
                    title: c.subjectTitle,
                    prerequisites: c.prerequisites || '',
                    corequisites: c.corequisites || '',
                    prereqReadiness: (
                        typeof c.metPrereqCount === 'number' &&
                        typeof c.totalPrereqCount === 'number' &&
                        c.totalPrereqCount > 0
                    )
                        ? `${c.metPrereqCount}/${c.totalPrereqCount}`
                        : 'none',
                    prereqDepth: typeof c.prereqDepth === 'number' ? c.prereqDepth : 0,
                    querySnippet: buildQueryAlignedSnippet(c.description || '', searchQuery),
                    retrievalNote: c.relevance || ''
                })))
                return compactCoursesJson
            }
            const retrySystemPrompt =`You are selecting MIT courses from a fixed list. Return JSON only.
Schema:
{
  "courses": [
    { "id": "<course id from ALLOWED COURSES>" }
  ]
}
Rules:
- Return exactly 5 courses from ALLOWED COURSES.
- Every id must exist in ALLOWED COURSES.
- No markdown, no extra text.`
            const maxRetries = 2
            const validationFailures: string[] = []

            let selected: Array<{ id: string; number: string; title: string }> = []
            let rerankerLatencyMs = 0
            let rerankerTokens = 0
            let attempt = 0
            while (attempt <= maxRetries) {
                const rerankerMessages = attempt === 0
                    ? messages
                    : [
                        { role: 'system' as const, content: retrySystemPrompt },
                        {
                            role: 'user' as const,
                            content: `User query: ${query}\nResolved search intent: ${searchQuery}\nValidation failures: ${Array.from(new Set(validationFailures)).slice(-8).join('; ') || 'none'}\n\nALLOWED COURSES:\n${getCompactCoursesJson()}`
                        }
                    ]

                const rerankerStart = Date.now()
                let responseText: string
                try {
                    const result = await runChat(rerankerMessages)
                    responseText = result.text
                    rerankerTokens += result.usage?.total_tokens || 0
                    rerankerLatencyMs += Date.now() - rerankerStart
                    logLlmEvent(req, {
                        provider: result.providerUsed === 'parley' ? 'parley' : chatProvider,
                        model: result.providerUsed === 'parley' ? parleyModel : chatModel,
                        step: 'reranker',
                        latencyMs: Date.now() - rerankerStart,
                        totalTokens: rerankerTokens || undefined,
                        success: true
                    }, logMeta)
                } catch (rerankerError) {
                    rerankerLatencyMs += Date.now() - rerankerStart
                    logLlmEvent(req, {
                        provider: chatProvider, model: chatModel, step: 'reranker',
                        latencyMs: Date.now() - rerankerStart,
                        success: false, error: rerankerError instanceof Error ? rerankerError.message : String(rerankerError)
                    }, logMeta)
                    throw rerankerError
                }

                const parseResult = parseAndSelect(responseText)
                selected = parseResult.selected
                validationFailures.push(...parseResult.failures.map(reason => `attempt_${attempt}:${reason}`))

                if (selected.length >= 3 || attempt === maxRetries) break

                attempt += 1
            }

            const rerankerSelectedIds = new Set(selected.map(course => course.id))
            const deterministic = buildDeterministicSelections(finalContext.classes, departmentBoosts)
            const filled = fillSelectionFromDeterministic(selected, deterministic, 5)
            const validatedFilled = validateRerankerSelections(
                filled,
                allowedMetaById,
                takenSubjectNumbersNormalized
            )
            selected = validatedFilled.selected
            validationFailures.push(...validatedFilled.failures.map(reason => `fallback:${reason}`))
            const fallbackUsed = selected.some(course => !rerankerSelectedIds.has(course.id))
                ? 'query_scored_fallback'
                : 'none'

            const selectedWithReasons = selected
                .slice(0, 5)
                .map(course => {
                    const contextCourse = contextById.get(course.id)
                    return {
                        ...course,
                        reason: buildFallbackReason(searchQuery, contextCourse || course)
                    }
                })

            if (selectedWithReasons.length < 3) {
                await persistAssistantMessage(fallbackMessage)
                res.write(`data: ${JSON.stringify({ type: 'full', content: fallbackMessage })}\n\n`)
                res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
                res.end()
                return
            }

            const selectedCourseReferences: AISearchCourseReference[] = selectedWithReasons.map(course => {
                    const contextCourse = contextById.get(course.id)
                    return {
                        id: course.id,
                        number: course.number,
                        title: course.title,
                        institution: contextCourse?.institution || 'mit'
                    }
                })

            res.write(`data: ${JSON.stringify({
                type: 'courses',
                content: selectedCourseReferences
            })}\n\n`)

            const harvardInSelected = selectedWithReasons.some((course) => {
                const contextCourse = contextById.get(course.id)
                return contextCourse?.institution === 'harvard'
            })

            const harvardAdvisorBlock = includeHarvard && harvardCoursesInCandidates
                ? resolvedIntent.harvardOnly
                    ? `\n\nHarvard Cross-Registration:
- The current request is specifically for Harvard cross-registration courses.
- Discuss only the provided Harvard candidates and present them under "### Harvard Cross-Registration Options".
- Do not add MIT alternatives or ask whether the student wants Harvard options; they already said yes.`
                    : `\n\nHarvard Cross-Registration:
- If Harvard courses appear in the candidate list, present them in a separate section titled "### Harvard Cross-Registration Options" after your MIT recommendations.
- Clearly note these are available through MIT's cross-registration program.
- If the student explicitly asks about Harvard courses, treat them as primary recommendations.
- If the student's query is general (not specifically about Harvard), focus on MIT courses first. After presenting MIT options, briefly mention 1-2 strong Harvard cross-registration alternatives if they are genuinely relevant, and naturally ask if they'd like to explore more Harvard options.`
                : ''

            const harvardAskBlock = includeHarvard && !resolvedIntent.harvardOnly && !harvardInSelected
                ? `\n\nHarvard Cross-Registration:
- The student has enabled Harvard course recommendations in their profile, but this result set contains no Harvard courses.
- After your MIT recommendations, ask in one short sentence whether they would like you to search specifically for Harvard cross-registration options related to their question.`
                : ''

            const advisorPrompt = `You are an MIT course advisor helping a student think carefully about courses.

You will be given:
- The student's question
- A short description of the student's background
- A ranked list of candidate courses, with reasons they might be a good fit

Your job is to:
1. Think through the tradeoffs between the options (content, prerequisites, workload, fit with trajectory, etc.).
2. Optionally answer any direct questions the student asked about specific courses (e.g., comparing two classes).
3. Make clear, concrete suggestions using ONLY the provided courses (do not invent new courses).${harvardAdvisorBlock}${harvardAskBlock}

VERY IMPORTANT FORMAT RULES:
- First, output your internal reasoning inside a single <think>...</think> block.
  - In this block, freely talk through how you compare the options, what you notice about the student's background,
    and why some courses seem better or worse.
  - This block is for careful chain-of-thought and may be long and detailed.
- After </think>, write a student-facing answer in markdown:
  - Use natural headings and bullet points as needed.
  - Summarize your recommendations, explain why, and address the user's question.
`

            const advisorMessages = [
                { role: 'system' as const, content: advisorPrompt },
                {
                    role: 'user' as const,
                    content: JSON.stringify({
                        query,
                        resolvedSearchIntent: searchQuery,
                        conversationHistory: filteredHistory,
                        student: {
                            majorDescription,
                            totalTaken: userTakenClasses.length,
                            topDepartments: topDepts,
                            takenClasses: takenClassesString,
                            takenSubjectNumbers,
                        },
                        candidates: selectedWithReasons
                    })
                }
            ]

            let narrative: string
            let advisorLatencyMs = 0
            let advisorTokens = 0
            const advisorStart = Date.now()
            try {
                const result = await runChat(advisorMessages)
                narrative = result.text
                advisorTokens = result.usage?.total_tokens || 0
                advisorLatencyMs = Date.now() - advisorStart
                logLlmEvent(req, {
                    provider: result.providerUsed === 'parley' ? 'parley' : chatProvider,
                    model: result.providerUsed === 'parley' ? parleyModel : chatModel,
                    step: 'advisor',
                    latencyMs: advisorLatencyMs,
                    totalTokens: advisorTokens || undefined,
                    success: true
                }, logMeta)
            } catch (advisorError) {
                advisorLatencyMs = Date.now() - advisorStart
                logLlmEvent(req, {
                    provider: chatProvider, model: chatModel, step: 'advisor',
                    latencyMs: advisorLatencyMs,
                    success: false, error: advisorError instanceof Error ? advisorError.message : String(advisorError)
                }, logMeta)
                throw advisorError
            }

            res.write(`data: ${JSON.stringify({
                type: 'debug_rag',
                content: {
                    retryCount: attempt,
                    fallbackUsed,
                    validationFailures: Array.from(new Set(validationFailures)).slice(0, 20)
                }
            })}\n\n`)
            res.write(`data: ${JSON.stringify({
                type: 'debug_llm',
                content: {
                    provider: chatProvider,
                    model: chatModel,
                    rerankerLatencyMs,
                    advisorLatencyMs,
                    totalTokens: (rerankerTokens + advisorTokens) || undefined
                }
            })}\n\n`)

            const { think, visible } = resolveThinkingParts(narrative)
            const finalAnswer = visible
            await persistAssistantMessage(finalAnswer, think || undefined, selectedCourseReferences)
            if (think) {
                res.write(`data: ${JSON.stringify({ type: 'reasoning', content: think })}\n\n`)
            }
            res.write(`data: ${JSON.stringify({ type: 'full', content: finalAnswer })}\n\n`)
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        } catch (streamError) {
            console.error('Streaming error:', streamError)
            const message = streamError instanceof Error
                ? streamError.message
                : 'An error occurred while generating the response'
            res.write(`data: ${JSON.stringify({
                type: 'error',
                content: message
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

export default withApiLogger(handler)

function buildConversationTitle(query: string): string {
    const normalized = query.replace(/\s+/g, ' ').trim()
    if (!normalized) return 'New course search'
    return truncate(normalized, 80)
}

function parseCoursesJson(responseText: string): { courses?: Array<{ id?: string; number?: string }> } | null {
    const stripped = stripThinkingTags(responseText || '')
        .replace(/```json\s*([\s\S]*?)```/gi, '$1')
        .replace(/```[\s\S]*?```/g, '')
        .trim()
    if (!stripped) return null
    try {
        return JSON.parse(stripped)
    } catch (error) {
        return null
    }
}

function truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

function extractQueryTerms(query: string): string[] {
    const terms = query
        .toLowerCase()
        .split(/[^a-z0-9.]+/)
        .map(token => token.trim())
        .filter(Boolean)
        .filter(token => token === 'ai' || token === 'ml' || token.length >= 3)

    return Array.from(new Set(terms))
}

function buildFallbackReason(
    query: string,
    course: {
        subjectNumber?: string
        subjectTitle?: string
        description?: string
        relevance?: string
        prereqCoverage?: number | null
        prereqDepth?: number
        metPrereqCount?: number
        totalPrereqCount?: number
    }
): string {
    const queryClean = (query || '').replace(/\s+/g, ' ').trim().replace(/\?+$/, '')
    const topicOnly = queryClean
        .replace(/^(what|which|where|how|can you|could you|i want to|i need to|i('d| would) like to|do i need|what classes do i need to|what courses)/i, '')
        .replace(/^(find|suggest|recommend|show|list|tell me about|learn about|study|take|know about)/i, '')
        .replace(/^\s*(to|for|about|in|on|the)\s+/i, '')
        .trim()
    const topic = topicOnly.length > 3 ? topicOnly : queryClean
    const topicBrief = truncate(topic, 60)

    const sentences = (course.description || '')
        .replace(/\s+/g, ' ')
        .split(/(?<=[.?!])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 10)

    const queryTerms = topic.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3)

    const rankedSentences = sentences
        .map(s => {
            const lower = s.toLowerCase()
            const matchCount = queryTerms.filter(term => lower.includes(term)).length
            return { sentence: s, score: matchCount }
        })
        .sort((a, b) => b.score - a.score)

    const selectedSentences: string[] = []
    let totalLength = 0
    for (const ranked of rankedSentences) {
        if (selectedSentences.length >= 3) break
        if (totalLength + ranked.sentence.length > 280 && selectedSentences.length >= 1) break
        selectedSentences.push(ranked.sentence.replace(/\.+$/, ''))
        totalLength += ranked.sentence.length
    }

    if (selectedSentences.length === 0 && sentences.length > 0) {
        const first = sentences[0].replace(/\.+$/, '')
        selectedSentences.push(truncate(first, 200))
    }

    const descDetail = selectedSentences.join('. ')

    const parts: string[] = []

    if (descDetail) {
        parts.push(descDetail.charAt(0).toUpperCase() + descDetail.slice(1))
    }

    if (
        typeof course.metPrereqCount === 'number' &&
        typeof course.totalPrereqCount === 'number' &&
        course.totalPrereqCount > 0
    ) {
        if (course.metPrereqCount >= course.totalPrereqCount) {
            parts.push('You\'ve completed all the prerequisites for this course.')
        } else {
            parts.push(`You currently meet ${course.metPrereqCount} of ${course.totalPrereqCount} listed prerequisites.`)
        }
    }

    return parts.length > 0
        ? parts.join(' ')
        : `Relevant to ${topicBrief}.`
}

function buildDeterministicSelections(
    contextClasses: Array<any>,
    departmentBoosts?: Map<string, number>
): Array<{ id: string; number: string; title: string }> {
    const scored = contextClasses
        .map(course => {
            const id = course._id?.toString?.() || course._id
            if (!id) return null

            const dept = course.subjectNumber?.split('.')[0] || course.department || ''
            const deptBoost = departmentBoosts?.get(dept) || 0
            const retrievalScore = typeof course.retrievalScore === 'number' ? course.retrievalScore : 0
            const normalizedRetrieval = Math.log1p(Math.max(0, retrievalScore))
            const prereqReadiness = (
                typeof course.metPrereqCount === 'number' &&
                typeof course.totalPrereqCount === 'number' &&
                course.totalPrereqCount > 0
            )
                ? (course.metPrereqCount / course.totalPrereqCount)
                : 0.35
            const prereqDepth = typeof course.prereqDepth === 'number' ? course.prereqDepth : 0
            const depthScore = Math.min(0.7, prereqDepth * 0.18)
            const readinessWeight = 1.15
            const score =
                normalizedRetrieval * 3.2 +
                prereqReadiness * readinessWeight +
                depthScore +
                deptBoost * 0.35

            return {
                id: id.toString(),
                number: course.subjectNumber,
                title: course.subjectTitle,
                score
            }
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

    return scored.map(item => ({
        id: item.id,
        number: item.number,
        title: item.title
    }))
}

function validateRerankerSelections(
    selections: Array<{ id: string; number: string; title: string }>,
    allowedMetaById: Map<string, { number: string; title: string; id: string; aliases: string[] }>,
    takenSubjectNumbersNormalized: Set<string>
): { selected: Array<{ id: string; number: string; title: string }>; failures: string[] } {
    const failures: string[] = []
    const dedupedByCanonical = new Map<string, { id: string; number: string; title: string }>()

    for (const selection of selections || []) {
        if (!selection?.id) {
            failures.push('missing_id')
            continue
        }

        const allowed = allowedMetaById.get(selection.id)
        if (!allowed) {
            failures.push(`id_not_allowed:${selection.id}`)
            continue
        }

        const numbersToCheck = [allowed.number, ...(allowed.aliases || [])]
            .map(number => normalizeCourseNumber(number))
            .filter(Boolean)

        if (numbersToCheck.some(number => takenSubjectNumbersNormalized.has(number))) {
            failures.push(`already_taken:${allowed.number}`)
            continue
        }

        const canonicalKey = normalizeCourseNumber(allowed.number)
        if (dedupedByCanonical.has(canonicalKey)) {
            failures.push(`duplicate_canonical:${allowed.number}`)
            continue
        }

        dedupedByCanonical.set(canonicalKey, {
            id: allowed.id,
            number: allowed.number,
            title: allowed.title
        })
    }

    const selected = Array.from(dedupedByCanonical.values()).slice(0, 5)
    if (selected.length < 3) {
        failures.push('fewer_than_three_valid_courses')
    }

    return { selected, failures }
}

function fillSelectionFromDeterministic(
    selected: Array<{ id: string; number: string; title: string }>,
    deterministic: Array<{ id: string; number: string; title: string }>,
    maxSize: number
): Array<{ id: string; number: string; title: string }> {
    const merged = new Map<string, { id: string; number: string; title: string }>()

    for (const course of selected || []) {
        if (course?.id && !merged.has(course.id)) {
            merged.set(course.id, course)
        }
    }

    for (const course of deterministic || []) {
        if (course?.id && !merged.has(course.id)) {
            merged.set(course.id, course)
        }
        if (merged.size >= maxSize) break
    }

    return Array.from(merged.values()).slice(0, maxSize)
}

function buildQueryAlignedSnippet(description: string, query: string): string {
    const cleanDescription = (description || '').replace(/\s+/g, ' ').trim()
    if (!cleanDescription) return ''

    const queryTerms = extractQueryTerms(query)
    const sentences = cleanDescription
        .split(/(?<=[.?!])\s+/)
        .map(sentence => sentence.trim())
        .filter(Boolean)

    const candidate = sentences.find(sentence => {
        const lower = sentence.toLowerCase()
        return queryTerms.some(term => lower.includes(term))
    }) || sentences[0] || cleanDescription

    return truncate(candidate, 280)
}

function buildSelectionContext(classes: Array<any>, query: string): string {
    if (!classes || classes.length === 0) return ''

    const lines: string[] = []
    classes.forEach((course, idx) => {
        const id = course._id?.toString?.() || course._id || ''
        const snippet = buildQueryAlignedSnippet(course.description || '', query)
        const retrievalNote = (course.relevance || '')
            .replace(/\s+/g, ' ')
            .trim()
        const publicEvidence = (course.publicEvidence || '').replace(/\s+/g, ' ').trim()
        const privateEvidence = Array.isArray(course.privateEvidence)
            ? course.privateEvidence.map((e: string) => (e || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
            : []
        const prereqReadiness =
            typeof course.metPrereqCount === 'number' &&
                typeof course.totalPrereqCount === 'number' &&
                course.totalPrereqCount > 0
                ? `${course.metPrereqCount}/${course.totalPrereqCount}`
                : ''
        const prereqDepth = typeof course.prereqDepth === 'number' ? course.prereqDepth : 0
        const trimmedRetrieval = truncate(retrievalNote, 220)
        const trimmedPublicEvidence = truncate(publicEvidence, 220)

        lines.push(`${idx + 1}. ${course.institution === 'harvard' ? '[HARVARD] ' : ''}${course.subjectNumber}: ${course.subjectTitle}`)
        lines.push(`   id: ${id}`)
        if (course.institution === 'harvard') lines.push(`   institution: HARVARD (cross-registration)`)
        if (course.girAttribute?.length) lines.push(`   gir: ${course.girAttribute.join(', ')}`)
        if (snippet) lines.push(`   query_snippet: ${snippet}`)
        if (course.prerequisites) lines.push(`   prerequisites: ${course.prerequisites}`)
        if (course.corequisites) lines.push(`   corequisites: ${course.corequisites}`)
        if (prereqReadiness) lines.push(`   prereq_readiness: ${prereqReadiness}`)
        if (prereqDepth > 0) lines.push(`   prereq_depth: ${prereqDepth}`)
        if (trimmedPublicEvidence) lines.push(`   public_evidence: ${trimmedPublicEvidence}`)
        if (privateEvidence.length > 0) lines.push(`   private_evidence: ${privateEvidence.slice(0, 2).join(' | ')}`)
        if (trimmedRetrieval) lines.push(`   retrieval_note: ${trimmedRetrieval}`)
    })

    return lines.join('\n')
}
