import CourseEmbedding from '@/models/CourseEmbedding'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import { IClass, IClassReview } from '@/types'
import { extractMitCourseNumbers, normalizeCourseNumber } from './courseNumbers'
import { generateQueryEmbedding } from './ollama'
import { generatePublicQueryEmbedding } from './openaiEmbeddings'
import { generateOptimizedQuery } from './queryGenerator'

export interface SearchResult {
    class: IClass
    score: number
    embeddingType: string
    snippet: string
}

interface QueryProfile {
    terms: string[]
    phraseBoosts: Array<{ phrase: string; weight: number }>
    termSpecificity: Map<string, number>
}

interface StudentRetrievalProfile {
    totalTaken?: number
    takenByDepartment?: Map<string, number>
    takenSubjectNumbers?: string[] | Set<string>
    takenCourseTitles?: string[]
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractCourseNumberMentions(text: string): string[] {
    return extractMitCourseNumbers(text)
}

function getTakenSubjectSet(studentProfile?: StudentRetrievalProfile): Set<string> {
    if (!studentProfile?.takenSubjectNumbers) return new Set<string>()

    if (studentProfile.takenSubjectNumbers instanceof Set) {
        return new Set(Array.from(studentProfile.takenSubjectNumbers).map(number => normalizeCourseNumber(number)))
    }

    return new Set(studentProfile.takenSubjectNumbers.map(number => normalizeCourseNumber(number)))
}

function getTakenCourseTitlesText(studentProfile?: StudentRetrievalProfile): string {
    return (studentProfile?.takenCourseTitles || [])
        .map(title => (title || '').toLowerCase())
        .join(' | ')
}

type RequirementToken = {
    kind: 'course' | 'gir'
    value: string
    label: string
}

const GIR_REQUIREMENT_PATTERNS: Array<{ regex: RegExp; key: string; label: string }> = [
    { regex: /biology\s*\(gir\)/i, key: 'BIOL', label: 'Biology (GIR)' },
    { regex: /chemistry\s*\(gir\)/i, key: 'CHEM', label: 'Chemistry (GIR)' },
    { regex: /physics\s*ii\s*\(gir\)/i, key: 'PHY2', label: 'Physics II (GIR)' },
    { regex: /physics\s*i\s*\(gir\)/i, key: 'PHY1', label: 'Physics I (GIR)' },
    { regex: /calculus\s*ii\s*\(gir\)/i, key: 'CAL2', label: 'Calculus II (GIR)' },
    { regex: /calculus\s*i\s*\(gir\)/i, key: 'CAL1', label: 'Calculus I (GIR)' },
    { regex: /\brest\b/i, key: 'REST', label: 'REST (GIR)' }
]

const CORE_GIR_CODES = ['BIOL', 'CAL1', 'CAL2', 'CHEM', 'PHY1', 'PHY2', 'REST'] as const

/** GIR code -> subject numbers and aliases that satisfy it. One DB call, cached per search. */
async function buildGIRSatisfactionMap(): Promise<Map<string, Set<string>>> {
    const girMap = new Map<string, Set<string>>()
    for (const code of CORE_GIR_CODES) {
        girMap.set(code, new Set<string>())
    }

    const girClasses = await Class.find({
        offered: true,
        girAttribute: { $in: CORE_GIR_CODES as unknown as string[] }
    })
        .select('subjectNumber aliases girAttribute')
        .lean() as Array<{ subjectNumber: string; aliases?: string[]; girAttribute?: string[] }>

    for (const cls of girClasses) {
        const codes = cls.girAttribute || []
        for (const code of codes) {
            const normalized = code.toUpperCase()
            if (!girMap.has(normalized)) {
                girMap.set(normalized, new Set<string>())
            }
            const set = girMap.get(normalized)!
            if (cls.subjectNumber) {
                set.add(normalizeCourseNumber(cls.subjectNumber))
            }
            for (const alias of cls.aliases || []) {
                if (alias) set.add(normalizeCourseNumber(alias))
            }
        }
    }

    return girMap
}

function parseRequirementGroups(text: string): RequirementToken[][] {
    if (!text) return []

    const groups: RequirementToken[][] = []
    const segments = text
        .split(/\band\b/gi)
        .map(segment => segment.trim())
        .filter(Boolean)

    for (const segment of segments) {
        const tokens: RequirementToken[] = []

        const courseNumbers = extractCourseNumberMentions(segment)
        for (const courseNumber of courseNumbers) {
            tokens.push({
                kind: 'course',
                value: courseNumber,
                label: courseNumber
            })
        }

        for (const pattern of GIR_REQUIREMENT_PATTERNS) {
            if (pattern.regex.test(segment)) {
                tokens.push({
                    kind: 'gir',
                    value: pattern.key,
                    label: pattern.label
                })
            }
        }

        if (tokens.length === 0) continue

        if (/\bor\b/i.test(segment)) {
            groups.push(tokens)
        } else {
            for (const token of tokens) {
                groups.push([token])
            }
        }
    }

    return groups
}

function courseNumberSatisfied(required: string, takenSet: Set<string>): boolean {
    const normalizedRequired = normalizeCourseNumber(required)
    if (!normalizedRequired) return false
    if (takenSet.has(normalizedRequired)) return true

    for (const taken of takenSet) {
        if (!taken) continue
        if (taken.startsWith(normalizedRequired) || normalizedRequired.startsWith(taken)) {
            return true
        }
    }
    return false
}

function girRequirementSatisfied(
    girCode: string,
    takenSet: Set<string>,
    _takenTitlesText: string,
    girSatisfactionMap?: Map<string, Set<string>>
): boolean {
    if (!girSatisfactionMap) {
        return false
    }

    const equivalentCourses = girSatisfactionMap.get(girCode)
    if (!equivalentCourses || equivalentCourses.size === 0) return false

    for (const taken of takenSet) {
        if (equivalentCourses.has(taken)) return true
        for (const equiv of equivalentCourses) {
            if (taken.startsWith(equiv) || equiv.startsWith(taken)) return true
        }
    }
    return false
}

function extractMeaningfulTerms(text: string): string[] {
    const tokens = text
        .toLowerCase()
        .split(/[^a-z0-9.]+/)
        .map(token => token.trim())
        .filter(Boolean)

    const kept = tokens.filter(token => {
        if (token === 'ai' || token === 'ml') return true
        return token.length >= 3
    })

    return Array.from(new Set(kept))
}

function mergeDepartmentBoosts(...boostMaps: Array<Map<string, number> | undefined>): Map<string, number> {
    const merged = new Map<string, number>()
    for (const boostMap of boostMaps) {
        if (!boostMap) continue
        for (const [dept, boost] of boostMap.entries()) {
            const existing = merged.get(dept) || 0
            if (boost > existing) {
                merged.set(dept, boost)
            }
        }
    }
    return merged
}

function buildPhraseBoostsFromText(text: string): Array<{ phrase: string; weight: number }> {
    const tokens = text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length >= 3)

    const phrases = new Map<string, number>()
    for (let i = 0; i < tokens.length; i++) {
        if (i + 1 < tokens.length) {
            const bigram = `${tokens[i]} ${tokens[i + 1]}`
            if (!phrases.has(bigram)) {
                phrases.set(bigram, 0.32)
            }
        }
        if (i + 2 < tokens.length) {
            const trigram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`
            if (!phrases.has(trigram)) {
                phrases.set(trigram, 0.5)
            }
        }
    }

    return Array.from(phrases.entries())
        .slice(0, 10)
        .map(([phrase, weight]) => ({ phrase, weight }))
}

function buildQueryProfile(query: string, optimizedQuery?: string): QueryProfile {
    const terms = extractMeaningfulTerms([query, optimizedQuery || ''].join(' ').trim())
    const phraseBoosts = buildPhraseBoostsFromText(query)

    if (optimizedQuery && optimizedQuery !== query) {
        const optimizedPhrases = buildPhraseBoostsFromText(optimizedQuery)
        for (const phrase of optimizedPhrases) {
            if (!phraseBoosts.some(existing => existing.phrase === phrase.phrase)) {
                phraseBoosts.push(phrase)
            }
        }
    }

    return {
        terms,
        phraseBoosts,
        termSpecificity: new Map<string, number>()
    }
}

function buildSearchableCourseText(cls: IClass): string {
    return [
        cls.subjectNumber,
        cls.aliases?.join(' ') || '',
        cls.subjectTitle,
        cls.description,
        cls.prerequisites,
        cls.corequisites,
        cls.classTags?.join(' ') || '',
        cls.department
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

function computeTermSpecificity(
    terms: string[],
    classes: IClass[]
): { termSpecificity: Map<string, number> } {
    const termSpecificity = new Map<string, number>()
    const docCount = Math.max(1, classes.length)

    for (const term of terms) {
        let hits = 0
        for (const cls of classes) {
            const searchableText = buildSearchableCourseText(cls)
            if (searchableText.includes(term)) {
                hits += 1
            }
        }

        const ratio = hits / docCount
        const specificity = Math.max(0.25, 1.35 - ratio * 1.2)
        termSpecificity.set(term, specificity)
    }

    return { termSpecificity }
}

function computeLexicalSignals(
    cls: IClass,
    queryProfile: QueryProfile
): { score: number; matchedTerms: string[] } {
    const searchableText = buildSearchableCourseText(cls)

    let score = 0
    const matched = new Set<string>()

    for (const term of queryProfile.terms) {
        if (searchableText.includes(term)) {
            const base = term.length >= 8 ? 0.35 : 0.22
            const specificity = queryProfile.termSpecificity.get(term) ?? 1
            score += base * specificity
            matched.add(term)
        }
    }

    for (const phrase of queryProfile.phraseBoosts) {
        if (searchableText.includes(phrase.phrase.toLowerCase())) {
            score += phrase.weight
            matched.add(phrase.phrase)
        }
    }

    return {
        score,
        matchedTerms: Array.from(matched).slice(0, 6)
    }
}


async function buildPrereqDepthByCourseId(classes: IClass[]): Promise<Map<string, number>> {
    const depthByCourseId = new Map<string, number>()
    if (!classes || classes.length === 0) return depthByCourseId

    const numberToPrereqs = new Map<string, string[]>()
    const addCourseToLookup = (course: IClass) => {
        const prereqs = extractCourseNumberMentions(course.prerequisites || '')
        const keys = [course.subjectNumber, ...(course.aliases || [])]
            .map(normalizeCourseNumber)
            .filter(Boolean)
        for (const key of keys) {
            if (!numberToPrereqs.has(key)) {
                numberToPrereqs.set(key, prereqs)
            }
        }
    }

    for (const cls of classes) {
        addCourseToLookup(cls)
    }

    let frontier = new Set<string>()
    for (const cls of classes) {
        for (const prereq of extractCourseNumberMentions(cls.prerequisites || '')) {
            frontier.add(prereq)
        }
    }

    const visited = new Set<string>()
    const maxExpansionRounds = 3

    for (let round = 0; round < maxExpansionRounds; round++) {
        const unresolved = Array.from(frontier).filter(number => !visited.has(number))
        if (unresolved.length === 0) break
        unresolved.forEach(number => visited.add(number))

        const regexes = unresolved.map(number => new RegExp(`^${escapeRegex(number)}$`, 'i'))
        const fetched = await Class.find({
            offered: true,
            $or: [
                { subjectNumber: { $in: unresolved } },
                { aliases: { $in: unresolved } },
                { subjectNumber: { $in: regexes } },
                { aliases: { $in: regexes } }
            ]
        })
            .select('subjectNumber aliases prerequisites')
            .lean() as IClass[]

        const nextFrontier = new Set<string>()
        for (const cls of fetched) {
            addCourseToLookup(cls)
            const prereqs = extractCourseNumberMentions(cls.prerequisites || '')
            for (const prereq of prereqs) {
                if (!visited.has(prereq)) nextFrontier.add(prereq)
            }
        }
        frontier = nextFrontier
    }

    const memo = new Map<string, number>()
    const dfs = (number: string, path: Set<string>): number => {
        const normalized = normalizeCourseNumber(number)
        if (!normalized) return 0
        if (memo.has(normalized)) return memo.get(normalized) || 0
        if (path.has(normalized)) return 1

        path.add(normalized)
        const prereqs = numberToPrereqs.get(normalized) || []
        if (prereqs.length === 0) {
            memo.set(normalized, 1)
            path.delete(normalized)
            return 1
        }

        let best = 1
        for (const prereq of prereqs) {
            best = Math.max(best, 1 + dfs(prereq, path))
        }
        memo.set(normalized, best)
        path.delete(normalized)
        return best
    }

    for (const cls of classes) {
        const classId = cls._id?.toString?.()
        if (!classId) continue

        const prereqNumbers = extractCourseNumberMentions(cls.prerequisites || '')
        if (prereqNumbers.length === 0) {
            depthByCourseId.set(classId, 0)
            continue
        }

        let depth = 1
        for (const prereq of prereqNumbers) {
            depth = Math.max(depth, dfs(prereq, new Set<string>()))
        }
        depthByCourseId.set(classId, depth)
    }

    return depthByCourseId
}

function computePrereqCoreqFit(
    cls: IClass,
    studentProfile?: StudentRetrievalProfile,
    prereqDepth: number = 0,
    girSatisfactionMap?: Map<string, Set<string>>
): {
    scoreAdjustment: number
    prereqCoverage: number | null
    metPrereqCount: number
    totalPrereqCount: number
    unmetPrereqs: string[]
    missingCoreqs: string[]
    prereqDepth: number
} {
    const takenSet = getTakenSubjectSet(studentProfile)
    const takenTitlesText = getTakenCourseTitlesText(studentProfile)
    const prereqGroups = parseRequirementGroups(cls.prerequisites || '')
    const coreqGroups = parseRequirementGroups(cls.corequisites || '')

    const totalPrereqCount = prereqGroups.length
    let metPrereqCount = 0
    const unmetPrereqs: string[] = []

    for (const group of prereqGroups) {
        const satisfied = group.some(token => {
            if (token.kind === 'course') {
                return courseNumberSatisfied(token.value, takenSet)
            }
            return girRequirementSatisfied(token.value, takenSet, takenTitlesText, girSatisfactionMap)
        })

        if (satisfied) {
            metPrereqCount += 1
        } else {
            unmetPrereqs.push(group.map(token => token.label).join(' or '))
        }
    }

    const prereqCoverage = totalPrereqCount > 0
        ? metPrereqCount / totalPrereqCount
        : null

    const missingCoreqs: string[] = []
    for (const group of coreqGroups) {
        const satisfied = group.some(token => {
            if (token.kind === 'course') {
                return courseNumberSatisfied(token.value, takenSet)
            }
            return girRequirementSatisfied(token.value, takenSet, takenTitlesText, girSatisfactionMap)
        })
        if (!satisfied) {
            missingCoreqs.push(group.map(token => token.label).join(' or '))
        }
    }

    let scoreAdjustment = 0

    if (typeof prereqCoverage === 'number') {
        const depthMultiplier = prereqDepth <= 0
            ? 0.5
            : prereqDepth === 1
                ? 0.7
                : prereqDepth === 2
                    ? 1.0
                    : Math.min(1.4, 0.8 + prereqDepth * 0.2)

        scoreAdjustment += prereqCoverage * 1.4 * depthMultiplier
        if (prereqCoverage >= 0.99 && totalPrereqCount > 0) {
            scoreAdjustment += 0.4 * depthMultiplier
        }
    } else {
        scoreAdjustment += 0.03
    }

    if (prereqDepth > 0) {
        const readiness = typeof prereqCoverage === 'number' ? prereqCoverage : 1
        scoreAdjustment += Math.min(0.9, prereqDepth * 0.18 * readiness)
    }

    if (coreqGroups.length > 0 && missingCoreqs.length === 0) {
        scoreAdjustment += 0.08
    }

    if (takenSet.size === 0) {
        return {
            scoreAdjustment,
            prereqCoverage,
            metPrereqCount,
            totalPrereqCount,
            unmetPrereqs: unmetPrereqs.slice(0, 6),
            missingCoreqs: missingCoreqs.slice(0, 6),
            prereqDepth
        }
    }

    return {
        scoreAdjustment,
        prereqCoverage,
        metPrereqCount,
        totalPrereqCount,
        unmetPrereqs: unmetPrereqs.slice(0, 6),
        missingCoreqs: missingCoreqs.slice(0, 6),
        prereqDepth
    }
}

async function resolveSubjectNumberMentions(
    rawQuery: string
): Promise<{
    expandedQuery: string
    exactMatches: SearchResult[]
    mentionedCourseIds: Set<string>
}> {
    const mentions = extractCourseNumberMentions(rawQuery)
    if (mentions.length === 0) {
        return {
            expandedQuery: rawQuery,
            exactMatches: [],
            mentionedCourseIds: new Set<string>()
        }
    }

    const mentionRegexes = mentions.map(mention => new RegExp(`^${escapeRegex(mention)}$`, 'i'))
    const candidates = await Class.find({
        offered: true,
        $or: [
            { subjectNumber: { $in: mentions } },
            { aliases: { $in: mentions } },
            { subjectNumber: { $in: mentionRegexes } },
            { aliases: { $in: mentionRegexes } }
        ]
    })
        .select('_id subjectNumber aliases subjectTitle department description prerequisites corequisites classTags offered')
        .lean() as IClass[]

    if (candidates.length === 0) {
        return {
            expandedQuery: rawQuery,
            exactMatches: [],
            mentionedCourseIds: new Set<string>()
        }
    }

    const lookupByNumber = new Map<string, IClass>()
    for (const cls of candidates) {
        const subject = normalizeCourseNumber(cls.subjectNumber)
        if (subject && !lookupByNumber.has(subject)) {
            lookupByNumber.set(subject, cls)
        }
        for (const alias of (cls.aliases || [])) {
            const normalizedAlias = normalizeCourseNumber(alias)
            if (normalizedAlias && !lookupByNumber.has(normalizedAlias)) {
                lookupByNumber.set(normalizedAlias, cls)
            }
        }
    }

    const mentionToCourse = new Map<string, IClass>()
    for (const mention of mentions) {
        const matchedCourse = lookupByNumber.get(mention)
        if (matchedCourse) {
            mentionToCourse.set(mention, matchedCourse)
        }
    }

    const mentionedCourseIds = new Set<string>()
    const exactMatches: SearchResult[] = []
    const mentionLines: string[] = []
    const seenClassIds = new Set<string>()

    mentionToCourse.forEach((cls, mention) => {
        const classId = cls._id?.toString?.()
        if (!classId) return

        mentionedCourseIds.add(classId)
        mentionLines.push(`${mention} -> ${cls.subjectNumber}: ${cls.subjectTitle}`)

        if (seenClassIds.has(classId)) return
        seenClassIds.add(classId)

        exactMatches.push({
            class: cls,
            score: 2.5,
            embeddingType: 'description',
            snippet: `Exact subject-number match: ${cls.subjectNumber}: ${cls.subjectTitle}.`
        })
    })

    if (mentionLines.length === 0) {
        return {
            expandedQuery: rawQuery,
            exactMatches,
            mentionedCourseIds
        }
    }

    const expandedQuery = `${rawQuery}\nReferenced subjects: ${mentionLines.slice(0, 6).join(' | ')}`

    return {
        expandedQuery,
        exactMatches,
        mentionedCourseIds
    }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
        return 0
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i]
        normA += vecA[i] * vecA[i]
        normB += vecB[i] * vecB[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Perform vector similarity search using local in-memory calculation
 * Fetches embeddings from DB and calculates similarity locally
 * (Since dataset is small <10k items, this is fast and avoids Atlas dependency)
 */
export async function vectorSearch(
    queryEmbedding: number[],
    limit: number = 10,
    embeddingType?: 'description' | 'reviews' | 'content',
    scope: 'public' | 'private' = 'private'
): Promise<SearchResult[]> {
    const filter: any = { $or: [{ scope }, { scope: { $exists: false } }] }
    if (embeddingType) {
        filter.embeddingType = embeddingType
    }

    const allEmbeddings = await CourseEmbedding.find(filter)
        .select('embedding class embeddingType sourceText')
        .lean()

    const scored = allEmbeddings.map(record => ({
        ...record,
        score: cosineSimilarity(queryEmbedding, record.embedding)
    }))

    scored.sort((a, b) => b.score - a.score)

    const topResults = scored.slice(0, limit * 2)

    const classIds = topResults.map(r => r.class)
    const classes = await Class.find({ _id: { $in: classIds } }).lean()

    const results: SearchResult[] = []

    for (const result of topResults) {
        const classData = classes.find(c => c._id.toString() === result.class.toString())

        if (classData && classData.offered) {
            results.push({
                class: classData as IClass,
                score: result.score,
                embeddingType: result.embeddingType,
                snippet: result.sourceText.substring(0, 200) + '...'
            })
        }

        if (results.length >= limit) break
    }

    return results
}

/**
 * Get relevant context for LLM from vector search results
 */
export async function getRelevantContext(
    query: string,
    limit: number = 5,
    options?: {
        departmentBoosts?: Map<string, number>
        studentProfile?: StudentRetrievalProfile
        includeHarvard?: boolean
        institution?: 'mit' | 'harvard'
        constraintClassIds?: string[]
    }
): Promise<{
    classes: Array<IClass & {
        relevance: string
        retrievalScore?: number
        prereqCoverage?: number | null
        prereqDepth?: number
        metPrereqCount?: number
        totalPrereqCount?: number
        publicEvidence?: string
        privateEvidence?: string[]
    }>
    reviews: IClassReview[]
    contentSnippets: string[]
    weakRetrieval: boolean
}> {
    const { hybridSearchES } = await import('./vectorSearchES')

    const isNicheQuery = query.split(/\s+/).length >= 12

    const subjectMentions = await resolveSubjectNumberMentions(query)
    const combinedDepartmentBoosts = mergeDepartmentBoosts(options?.departmentBoosts)
    const publicQueryEmbedding = await generatePublicQueryEmbedding(subjectMentions.expandedQuery)
    const privateQueryEmbedding = await generateQueryEmbedding(subjectMentions.expandedQuery).catch(error => {
        console.error('Failed to generate private query embedding:', error)
        return null
    })

    if (!publicQueryEmbedding || !Array.isArray(publicQueryEmbedding) || publicQueryEmbedding.length === 0) {
        console.error('Failed to generate public query embedding for query:', query)
        return { classes: [], reviews: [], contentSnippets: [], weakRetrieval: true }
    }

    const baseDescriptionLimit = isNicheQuery ? limit * 8 : limit * 5
    let queryTextUsed = query
    let publicEmbeddingUsed = publicQueryEmbedding
    let privateEmbeddingUsed = privateQueryEmbedding
    let descriptionLimit = baseDescriptionLimit
    let optimizedQueryUsed = ''

    let descriptionResults = await hybridSearchES(
        publicEmbeddingUsed,
        queryTextUsed,
        descriptionLimit,
        'description',
        combinedDepartmentBoosts.size > 0 ? combinedDepartmentBoosts : undefined,
        { scope: 'public', classIds: options?.constraintClassIds }
    )

    if (subjectMentions.exactMatches.length > 0) {
        descriptionResults = [...subjectMentions.exactMatches, ...descriptionResults]
    }

    if (options?.institution) {
        descriptionResults = descriptionResults.filter(r => (r.class.institution || 'mit') === options.institution)
    } else if (!options?.includeHarvard) {
        descriptionResults = descriptionResults.filter(r => r.class.institution !== 'harvard')
    }

    let weakRetrieval = descriptionResults.length < 3
    if (weakRetrieval || isNicheQuery) {
        try {
            const optimizedQuery = await generateOptimizedQuery(query)
            if (optimizedQuery && optimizedQuery !== query) {
                const optimizedQueryWithMentions = subjectMentions.exactMatches.length > 0
                    ? `${optimizedQuery}\nReferenced subjects: ${(subjectMentions.exactMatches || [])
                        .map(match => `${match.class.subjectNumber}: ${match.class.subjectTitle}`)
                        .slice(0, 6)
                        .join(' | ')}`
                    : optimizedQuery

                const optimizedPublicEmbedding = await generatePublicQueryEmbedding(optimizedQueryWithMentions)
                const optimizedPrivateEmbedding = await generateQueryEmbedding(optimizedQueryWithMentions).catch(() => privateEmbeddingUsed)
                if (optimizedPublicEmbedding && Array.isArray(optimizedPublicEmbedding) && optimizedPublicEmbedding.length > 0) {
                    optimizedQueryUsed = optimizedQuery
                    publicEmbeddingUsed = optimizedPublicEmbedding
                    privateEmbeddingUsed = optimizedPrivateEmbedding
                    descriptionLimit = Math.max(descriptionLimit, limit * 8)
                    const optimizedDescriptionResults = await hybridSearchES(
                        publicEmbeddingUsed,
                        optimizedQuery,
                        descriptionLimit,
                        'description',
                        combinedDepartmentBoosts.size > 0 ? combinedDepartmentBoosts : undefined,
                        { scope: 'public', classIds: options?.constraintClassIds }
                    )
                    descriptionResults = [...subjectMentions.exactMatches, ...descriptionResults, ...optimizedDescriptionResults]
                    if (weakRetrieval) {
                        queryTextUsed = optimizedQuery
                    }
                }
            }
        } catch (error) {
            console.error('Query expansion failed, using original query:', error)
        }
    }

    if (options?.institution) {
        descriptionResults = descriptionResults.filter(r => (r.class.institution || 'mit') === options.institution)
    } else if (!options?.includeHarvard) {
        descriptionResults = descriptionResults.filter(r => r.class.institution !== 'harvard')
    }

    weakRetrieval = descriptionResults.length < 3

    if (descriptionResults.length === 0) {
        return { classes: [], reviews: [], contentSnippets: [], weakRetrieval: true }
    }

    const descriptionClassIds = Array.from(new Set(descriptionResults.map(r => r.class._id.toString())))
    let reviewResults: Array<any> = []
    let contentResults: Array<any> = []

    if (privateEmbeddingUsed && descriptionClassIds.length > 0) {
        reviewResults = await hybridSearchES(
            privateEmbeddingUsed,
            queryTextUsed,
            limit * 3,
            'reviews',
            undefined,
            { scope: 'private', classIds: descriptionClassIds }
        )

        contentResults = await hybridSearchES(
            privateEmbeddingUsed,
            queryTextUsed,
            limit * 3,
            'content',
            undefined,
            { scope: 'private', classIds: descriptionClassIds }
        )
    }

    const classIds = [...new Set(descriptionResults.map(r => r.class._id))]

    const reviews = await ClassReview.find({
        class: { $in: classIds },
        display: true,
        classComments: { $exists: true, $ne: '' }
    })
        .populate('class')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()

    const contentSnippets = contentResults
        .map(r => r.snippet)
        .slice(0, 5)

    const privateEvidenceByClass = new Map<string, {
        reviewSnippets: string[]
        contentSnippets: string[]
        scoreBoost: number
    }>()

    for (const result of reviewResults) {
        const classId = result.class?._id?.toString?.() || result.class?.toString?.()
        if (!classId) continue
        const existing = privateEvidenceByClass.get(classId) || {
            reviewSnippets: [],
            contentSnippets: [],
            scoreBoost: 0
        }
        existing.reviewSnippets.push(result.snippet || '')
        existing.scoreBoost += Math.min(0.2, (result.score || 0) * 0.04)
        privateEvidenceByClass.set(classId, existing)
    }

    for (const result of contentResults) {
        const classId = result.class?._id?.toString?.() || result.class?.toString?.()
        if (!classId) continue
        const existing = privateEvidenceByClass.get(classId) || {
            reviewSnippets: [],
            contentSnippets: [],
            scoreBoost: 0
        }
        existing.contentSnippets.push(result.snippet || '')
        existing.scoreBoost += Math.min(0.18, (result.score || 0) * 0.03)
        privateEvidenceByClass.set(classId, existing)
    }

    const aliasToCanonical = new Map<string, string>()
    const canonicalEntries = new Map<string, {
        result: any
        bestScore: number
        aggregateScore: number
        publicSnippets: string[]
    }>()

    for (const result of descriptionResults) {
        const cls = result.class
        const subjectNumber = cls.subjectNumber || cls._id?.toString?.() || ''
        const aliases = cls.aliases || []
        const allNumbers = [subjectNumber, ...aliases].filter(Boolean)

        let canonicalKey = allNumbers.find(value => aliasToCanonical.has(value))
        if (canonicalKey) {
            canonicalKey = aliasToCanonical.get(canonicalKey) || canonicalKey
        } else {
            canonicalKey = subjectNumber
        }

        const score = result.score || 0
        const existing = canonicalEntries.get(canonicalKey)

        if (existing) {
            existing.aggregateScore += score
            existing.publicSnippets.push(result.snippet || '')
            if (score > existing.bestScore) {
                existing.result = result
                existing.bestScore = score
            }
        } else {
            canonicalEntries.set(canonicalKey, {
                result,
                bestScore: score,
                aggregateScore: score,
                publicSnippets: [result.snippet || '']
            })
        }

        for (const value of allNumbers) {
            aliasToCanonical.set(value, canonicalKey)
        }
    }

    const queryProfile = buildQueryProfile(query, optimizedQueryUsed)
    const candidateClasses = Array.from(canonicalEntries.values()).map(entry => entry.result.class as IClass)
    const { termSpecificity } = computeTermSpecificity(queryProfile.terms, candidateClasses)
    queryProfile.termSpecificity = termSpecificity
    const prereqDepthByCourseId = await buildPrereqDepthByCourseId(candidateClasses)
    const girSatisfactionMap = await buildGIRSatisfactionMap()
    const mentionedCourseIds = subjectMentions.mentionedCourseIds

    const rankedEntries = Array.from(canonicalEntries.values())
        .map(entry => {
            const cls = entry.result.class as IClass
            const classId = cls._id?.toString?.() || ''
            const lexicalSignals = computeLexicalSignals(cls, queryProfile)
            const dept = cls.subjectNumber?.split('.')[0] || cls.department || ''
            const departmentBoost = combinedDepartmentBoosts.get(dept) || 0
            const prereqDepth = prereqDepthByCourseId.get(classId) || 0
            const prereqCoreqFit = computePrereqCoreqFit(cls, options?.studentProfile, prereqDepth, girSatisfactionMap)
            const privateEvidence = privateEvidenceByClass.get(classId)
            const privateBoost = privateEvidence ? Math.min(0.7, privateEvidence.scoreBoost) : 0
            const subjectMentionBoost = mentionedCourseIds.has(classId) ? 1.25 : 0
            const institutionPenalty = cls.institution === 'harvard' && options?.institution !== 'harvard' ? -0.8 : 0
            const finalScore =
                entry.bestScore +
                entry.aggregateScore * 0.12 +
                lexicalSignals.score * 0.12 +
                departmentBoost +
                prereqCoreqFit.scoreAdjustment +
                subjectMentionBoost +
                privateBoost +
                institutionPenalty

            const publicSnippet = sanitizeRelevanceSnippet(entry.publicSnippets.join(' | '))
            const privateReviewSnippet = sanitizeRelevanceSnippet((privateEvidence?.reviewSnippets || []).join(' | '))
            const privateContentSnippet = sanitizeRelevanceSnippet((privateEvidence?.contentSnippets || []).join(' | '))
            const relevanceParts: string[] = []
            if (subjectMentionBoost > 0) {
                relevanceParts.push('Direct subject-number match from the query')
            }
            if (typeof prereqCoreqFit.prereqCoverage === 'number') {
                relevanceParts.push(
                    `Prereq readiness: ${prereqCoreqFit.metPrereqCount}/${prereqCoreqFit.totalPrereqCount} referenced prerequisites met (${(prereqCoreqFit.prereqCoverage * 100).toFixed(0)}%)`
                )
                if (prereqCoreqFit.unmetPrereqs.length > 0) {
                    relevanceParts.push(`Missing prereq references: ${prereqCoreqFit.unmetPrereqs.slice(0, 3).join(', ')}`)
                }
            } else {
                relevanceParts.push('No explicit prerequisite references')
            }
            if (prereqCoreqFit.prereqDepth > 0) {
                relevanceParts.push(`Prerequisite chain depth: ${prereqCoreqFit.prereqDepth}`)
            }
            if (prereqCoreqFit.missingCoreqs.length > 0) {
                relevanceParts.push(`Missing coreq references: ${prereqCoreqFit.missingCoreqs.slice(0, 3).join(', ')}`)
            }

            return {
                classWithContext: {
                    ...cls,
                    relevance: relevanceParts.join(' | ') || 'Matches your search topic',
                    retrievalScore: finalScore,
                    prereqCoverage: prereqCoreqFit.prereqCoverage,
                    prereqDepth: prereqCoreqFit.prereqDepth,
                    metPrereqCount: prereqCoreqFit.metPrereqCount,
                    totalPrereqCount: prereqCoreqFit.totalPrereqCount,
                    publicEvidence: publicSnippet || '',
                    privateEvidence: [
                        ...(privateReviewSnippet ? [`[review] ${privateReviewSnippet}`] : []),
                        ...(privateContentSnippet ? [`[content] ${privateContentSnippet}`] : [])
                    ]
                },
                finalScore
            }
        })
        .sort((a, b) => b.finalScore - a.finalScore)

    let classes = rankedEntries.map(entry => entry.classWithContext)

    if (options?.includeHarvard && !options?.institution) {
        const harvardMentioned = query.toLowerCase().includes('harvard')
        if (!harvardMentioned) {
            const maxHarvard = Math.max(2, Math.ceil(classes.length * 0.3))
            let harvardCount = 0
            classes = classes.filter(cls => {
                if (cls.institution === 'harvard') {
                    harvardCount++
                    return harvardCount <= maxHarvard
                }
                return true
            })
        }
    }

    return {
        classes: classes.slice(0, limit * 2),
        reviews,
        contentSnippets,
        weakRetrieval
    }
}

/**
 * Build context string for LLM from search results
 */
export function buildContextString(context: {
    classes: Array<IClass & { relevance: string }>
    reviews: IClassReview[]
    contentSnippets: string[]
}): string {
    let contextStr = '# Available Course Information\n\n'

    if (context.classes.length > 0) {
        contextStr += '## Relevant Courses:\n\n'
        context.classes.forEach((cls, idx) => {
            contextStr += `${idx + 1}. **${cls.subjectNumber}: ${cls.subjectTitle}**\n`
            if (cls.aliases && cls.aliases.length > 0) {
                contextStr += `   - Also listed as: ${cls.aliases.join(', ')}\n`
            }
            contextStr += `   - Department: ${cls.department}\n`
            if (cls.description) {
                contextStr += `   - Description: ${cls.description}\n`
            }
            contextStr += `   - Units: ${cls.units}\n`
            if (cls.instructors && cls.instructors.length > 0) {
                contextStr += `   - Instructors: ${cls.instructors.join(', ')}\n`
            }
            contextStr += `   - Why relevant: ${cls.relevance}\n\n`
            if (cls.prerequisites) {
                contextStr += `   - Prerequisites: ${cls.prerequisites}\n\n`
            }
            if (cls.corequisites) {
                contextStr += `   - Corequisites: ${cls.corequisites}\n\n`
            }
        })
    } else {
        contextStr += '## Relevant Courses:\n\n'
        contextStr += 'No relevant courses found. Please try a different search query or check if all courses have been filtered out.\n\n'
    }

    if (context.reviews.length > 0) {
        contextStr += '## Reviews FROM OTHER MIT STUDENTS (NOT the student asking):\n'
        contextStr += '(Use these to understand course quality, NOT to infer what the asking student has taken)\n\n'
        context.reviews.slice(0, 5).forEach((review, idx) => {
            const cls = review.class as IClass
            contextStr += `${idx + 1}. Review of ${cls.subjectNumber} by another student (Rating: ${review.overallRating}/7)\n`
            contextStr += `   "${review.classComments}"\n\n`
        })
    }

    if (context.contentSnippets.length > 0) {
        contextStr += '## Course Materials:\n\n'
        context.contentSnippets.forEach((snippet, idx) => {
            contextStr += `${idx + 1}. ${snippet}\n\n`
        })
    }

    return contextStr
}

function sanitizeRelevanceSnippet(snippet: string): string {
    if (!snippet) return ''
    return snippet
        .replace(/\s+/g, ' ')
        .trim()
}
