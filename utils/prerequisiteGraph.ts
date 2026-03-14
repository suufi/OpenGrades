import Class from '../models/Class'
import { IClass } from '../types'
import { parseUnitsField } from './courseParser'
import { buildExactCourseNumberRegex, extractMitCourseNumbers } from './courseNumbers'

function mapGIRRequirementToCode(reqString: string): string | null {
    const reqLower = reqString.toLowerCase()

    if (reqLower.includes('calculus ii') || reqLower.includes('calc ii')) {
        return 'CAL2'
    }
    if (reqLower.includes('calculus i') || reqLower.includes('calc i')) {
        return 'CAL1'
    }
    if (reqLower.includes('physics ii')) {
        return 'PHY2'
    }
    if (reqLower.includes('physics i')) {
        return 'PHY1'
    }
    if (reqLower.includes('chemistry')) {
        return 'CHEM'
    }
    if (reqLower.includes('biology')) {
        return 'BIOL'
    }
    if (reqLower.includes('lab')) {
        return 'LAB'
    }

    return null
}

function extractGIRRequirements(reqString: string): string[] {
    if (!reqString) return []
    COURSE_NUMBER_PATTERN.lastIndex = 0
    const matches = reqString.match(COURSE_NUMBER_PATTERN) || []

    const girPatterns = [
        /calculus\s+ii\s*\(gir\)/gi,
        /calc\s+ii\s*\(gir\)/gi,
        /calculus\s+2\s*\(gir\)/gi,
        /calc\s+2\s*\(gir\)/gi,
        /physics\s+ii\s*\(gir\)/gi,
        /physics\s+2\s*\(gir\)/gi,
        /lab\s+ii\s*\(gir\)/gi,
        /lab\s+2\s*\(gir\)/gi,
        /calculus\s+i\s*\(gir\)/gi,
        /calc\s+i\s*\(gir\)/gi,
        /calculus\s+1\s*\(gir\)/gi,
        /calc\s+1\s*\(gir\)/gi,
        /physics\s+i\s*\(gir\)/gi,
        /physics\s+1\s*\(gir\)/gi,
        /chemistry\s*\(gir\)/gi,
        /biology\s*\(gir\)/gi,
        /lab\s*\(gir\)/gi,
        /partial\s+lab\s*\(gir\)/gi,
    ]

    const girCodes = new Set<string>()

    for (const pattern of girPatterns) {
        pattern.lastIndex = 0
        const match = reqString.match(pattern)?.[0]
        if (match) {
            const code = mapGIRRequirementToCode(match)
            if (code) {
                girCodes.add(code)
            }
        }
    }

    return Array.from(girCodes)
}

/**
 * Get GIR code for a class if it is a GIR-equivalent (from units / girAttribute).
 * Uses girAttribute when present; otherwise parses cls.units via parseUnitsField.
 * Returns e.g. 'PHY2' so caller can use GIR:PHY2 as the node id; returns null if not a GIR.
 */
function getGIRCodeForClass(cls: { subjectNumber?: string; girAttribute?: string[]; units?: string } | null): string | null {
    if (!cls) return null

    let codes: string[] = cls.girAttribute?.length ? cls.girAttribute : []
    if (codes.length === 0 && cls.units) {
        codes = parseUnitsField(cls.units).girAttributes || []
    }
    const code = codes[0]
    if (!code || code === 'REST') return null

    return code
}

/**
 * Find all course numbers that satisfy a GIR requirement
 */
async function findClassesForGIRCode(girCode: string): Promise<string[]> {
    const classes = await Class.find({
        offered: true,
        girAttribute: girCode
    })
        .select('subjectNumber')
        .lean()

    return classes.map((c: any) => c.subjectNumber).filter(Boolean)
}

const CORE_GIR_CODES = ['BIOL', 'CAL1', 'CAL2', 'CHEM', 'PHY1', 'PHY2'] as const
const CORE_GIR_SET = new Set<string>(CORE_GIR_CODES)

const GIR_LABELS: Record<string, string> = {
    CAL1: 'Calculus I (GIR)',
    CAL2: 'Calculus II (GIR)',
    PHY1: 'Physics I (GIR)',
    PHY2: 'Physics II (GIR)',
    CHEM: 'Chemistry (GIR)',
    BIOL: 'Biology (GIR)',
}

/**
 * Build map of subject number (and aliases) -> GIR code for all offered GIR-equivalent courses.
 */
async function buildSubjectNumberToGIRCodeFromDB(): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const classes = await Class.find({
        offered: true,
        girAttribute: { $in: CORE_GIR_CODES }
    })
        .select('subjectNumber aliases girAttribute')
        .lean()
    for (const c of classes as any[]) {
        const code = Array.isArray(c.girAttribute) ? c.girAttribute[0] : c.girAttribute
        if (!code || !CORE_GIR_CODES.includes(code as any)) continue
        if (c.subjectNumber) map.set(c.subjectNumber, code)
        for (const alias of c.aliases || []) {
            if (alias) map.set(alias, code)
        }
    }
    return map
}

/**
 * Extract course numbers and GIR requirements separately
 * Returns object with explicit course numbers and GIR codes
 */
function extractPrerequisites(reqString: string): { courseNumbers: string[]; girCodes: string[] } {
    if (!reqString) return { courseNumbers: [], girCodes: [] }

    const courseNumbers = extractMitCourseNumbers(reqString)

    // Extract GIR requirements
    const girCodes = extractGIRRequirements(reqString)

    return { courseNumbers, girCodes }
}

/**
 * Extract course numbers from prerequisite string, including GIR requirements
 * Returns array of course numbers (both explicit and from GIR requirements)
 * NOTE: For graph building, use extractPrerequisites instead to get GIR codes separately
 */
async function extractCourseNumbersWithGIR(reqString: string): Promise<string[]> {
    if (!reqString) return []

    const explicitNumbers = extractMitCourseNumbers(reqString)

    // Then, extract GIR requirements and find matching classes
    const girCodes = extractGIRRequirements(reqString)
    const girClassNumbers: string[] = []

    for (const girCode of girCodes) {
        const classes = await findClassesForGIRCode(girCode)
        girClassNumbers.push(...classes)
    }

    // Combine and deduplicate
    return [...new Set([...explicitNumbers, ...girClassNumbers])]
}

/**
 * Extract course numbers from prerequisite string (synchronous version)
 * Only extracts explicit course numbers, not GIR requirements
 * Use extractCourseNumbersWithGIR for GIR support
 */
function extractCourseNumbers(reqString: string): string[] {
    return extractMitCourseNumbers(reqString)
}

export { extractCourseNumbers, extractCourseNumbersWithGIR, extractGIRRequirements, extractPrerequisites }

export async function getPrerequisiteGraph(
    classId: string,
    depth: number = 2
): Promise<{
    prerequisites: IClass[]
    corequisites: IClass[]
    requiredBy: IClass[]
    nextCourses: IClass[]
}> {
    const sourceClass = await Class.findById(classId).lean() as IClass | null

    if (!sourceClass) {
        throw new Error('Class not found')
    }

    const prereqNumbers = await extractCourseNumbersWithGIR(sourceClass.prerequisites || '')
    const coreqNumbers = await extractCourseNumbersWithGIR(sourceClass.corequisites || '')

    const prerequisites = await Class.find({
        subjectNumber: { $in: prereqNumbers },
        offered: true
    }).lean() as IClass[]

    const corequisites = await Class.find({
        subjectNumber: { $in: coreqNumbers },
        offered: true
    }).lean() as IClass[]

    const requiredBy = await Class.find({
        offered: true,
        $or: [
            { prerequisites: { $regex: buildExactCourseNumberRegex(sourceClass.subjectNumber) } },
            { corequisites: { $regex: buildExactCourseNumberRegex(sourceClass.subjectNumber) } }
        ]
    }).lean() as IClass[]

    return {
        prerequisites,
        corequisites,
        requiredBy,
        nextCourses: requiredBy // Alias for clarity
    }
}

export async function getPrerequisiteChain(
    classId: string,
    maxDepth: number = 3
): Promise<Map<string, { class: IClass; depth: number; path: string[] }>> {
    const visited = new Map<string, { class: IClass; depth: number; path: string[] }>()
    const queue: Array<{ classId: string; depth: number; path: string[] }> = [
        { classId, depth: 0, path: [] }
    ]

    while (queue.length > 0) {
        const { classId: currentId, depth, path } = queue.shift()!

        if (depth >= maxDepth) continue

        const currentClass = await Class.findById(currentId).lean() as IClass | null
        if (!currentClass) continue

        // Skip if revisited at same or greater depth (BFS guarantees shortest path first)
        // But we want to track visited nodes
        if (visited.has(currentId)) continue

        const newPath = [...path, currentClass.subjectNumber]
        visited.set(currentId, { class: currentClass, depth, path: newPath })

        const prereqNumbers = await extractCourseNumbersWithGIR(currentClass.prerequisites || '')

        // Find prereqs in database
        const prerequisites = await Class.find({
            subjectNumber: { $in: prereqNumbers },
            offered: true
        }).select('_id subjectNumber').lean() as IClass[]

        for (const prereq of prerequisites) {
            queue.push({
                classId: prereq._id as string,
                depth: depth + 1,
                path: newPath
            })
        }
    }

    return visited
}

export async function getCourseProgressionPath(
    classId: string
): Promise<IClass[]> {
    // Find all courses that require this course, recursively
    // This could be expensive, so we might limit depth
    return []
}

// Types for reagraph-compatible graph data
export interface GraphNode {
    id: string
    label: string
    data?: {
        subjectNumber: string
        subjectTitle: string
        department: string
        type: 'root' | 'prerequisite' | 'corequisite' | 'requiredBy' | 'girRequirement'
        isGIR?: boolean
        girAttributes?: string[]
        isGIRRequirement?: boolean
        girCode?: string
    }
}

export interface GraphEdge {
    id: string
    source: string
    target: string
    label?: string
    data?: {
        type: 'prerequisite' | 'corequisite'
    }
}

function makeGIRNode(girCode: string): GraphNode {
    const id = `GIR:${girCode}`
    const label = GIR_LABELS[girCode] || `${girCode} (GIR)`
    return {
        id,
        label,
        data: {
            subjectNumber: id,
            subjectTitle: label,
            department: 'GIR',
            type: 'girRequirement',
            isGIRRequirement: true,
            girCode
        }
    }
}

function ensureGIRNodeInMap(nodesMap: Map<string, GraphNode>, girNodeId: string): void {
    if (nodesMap.has(girNodeId)) return
    const girCode = girNodeId.replace('GIR:', '')
    nodesMap.set(girNodeId, makeGIRNode(girCode))
}

/**
 * Build reagraph-compatible graph data for a specific class
 */
export async function buildGraphData(
    subjectNumber: string,
    maxDepth: number = 2
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const nodesMap = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []

    // Find the root class
    const rootClass = await Class.findOne({
        $or: [
            { subjectNumber },
            { aliases: subjectNumber }
        ],
        offered: true
    }).lean() as IClass | null

    if (!rootClass) {
        return { nodes: [], edges: [] }
    }

    // Add root node
    const rootId = rootClass.subjectNumber
    nodesMap.set(rootId, {
        id: rootId,
        label: rootId,
        data: {
            subjectNumber: rootClass.subjectNumber,
            subjectTitle: rootClass.subjectTitle || '',
            department: rootClass.department || '',
            type: 'root'
        }
    })

    // BFS to find prerequisites up to maxDepth
    const prereqQueue: Array<{ subjectNumber: string; depth: number }> = [
        { subjectNumber: rootId, depth: 0 }
    ]
    const visitedPrereq = new Set<string>([rootId])

    while (prereqQueue.length > 0) {
        const { subjectNumber: currentSubject, depth } = prereqQueue.shift()!
        if (depth >= maxDepth) continue

        const currentClass = await Class.findOne({
            subjectNumber: currentSubject,
            offered: true
        }).lean() as IClass | null

        if (!currentClass) continue

        // Get prerequisites
        const prereqData = extractPrerequisites(currentClass.prerequisites || '')

        // Handle explicit course number prerequisites (resolve GIR-equivalent courses to GIR nodes)
        for (const prereqNum of prereqData.courseNumbers) {
            const prereqClass = await Class.findOne({
                $or: [{ subjectNumber: prereqNum }, { aliases: prereqNum }],
                offered: true
            })
                .select('subjectNumber subjectTitle department girAttribute units')
                .lean() as IClass | null

            const girCode = getGIRCodeForClass(prereqClass)
            const effectiveId = girCode ? `GIR:${girCode}` : prereqNum

            if (girCode) {
                ensureGIRNodeInMap(nodesMap, effectiveId)
                edges.push({
                    id: `${effectiveId}->${currentSubject}`,
                    source: effectiveId,
                    target: currentSubject,
                    label: 'prereq',
                    data: { type: 'prerequisite' }
                })
            } else {
                if (prereqClass && !nodesMap.has(prereqNum)) {
                    nodesMap.set(prereqNum, {
                        id: prereqNum,
                        label: prereqNum,
                        data: {
                            subjectNumber: prereqClass.subjectNumber,
                            subjectTitle: prereqClass.subjectTitle || '',
                            department: prereqClass.department || '',
                            type: 'prerequisite'
                        }
                    })
                }
                if (prereqClass) {
                    edges.push({
                        id: `${prereqNum}->${currentSubject}`,
                        source: prereqNum,
                        target: currentSubject,
                        label: 'prereq',
                        data: { type: 'prerequisite' }
                    })
                    if (!visitedPrereq.has(prereqNum)) {
                        visitedPrereq.add(prereqNum)
                        prereqQueue.push({ subjectNumber: prereqNum, depth: depth + 1 })
                    }
                }
            }
        }

        for (const girCode of prereqData.girCodes) {
            const girNodeId = `GIR:${girCode}`
            ensureGIRNodeInMap(nodesMap, girNodeId)
            edges.push({
                id: `${girNodeId}->${currentSubject}`,
                source: girNodeId,
                target: currentSubject,
                label: 'prereq',
                data: { type: 'prerequisite' }
            })
        }

        // Get corequisites (only for root)
        if (currentSubject === rootId) {
            const coreqData = extractPrerequisites(currentClass.corequisites || '')

            // Handle explicit course number corequisites (resolve GIR-equivalent to GIR nodes)
            for (const coreqNum of coreqData.courseNumbers) {
                const coreqClass = await Class.findOne({
                    $or: [{ subjectNumber: coreqNum }, { aliases: coreqNum }],
                    offered: true
                })
                    .select('subjectNumber subjectTitle department girAttribute units')
                    .lean() as IClass | null

                const girCode = getGIRCodeForClass(coreqClass)
                const effectiveId = girCode ? `GIR:${girCode}` : coreqNum

                if (girCode) {
                    ensureGIRNodeInMap(nodesMap, effectiveId)
                    edges.push({
                        id: `${rootId}<->${effectiveId}`,
                        source: rootId,
                        target: effectiveId,
                        label: 'coreq',
                        data: { type: 'corequisite' }
                    })
                } else if (coreqClass && !nodesMap.has(coreqNum)) {
                    nodesMap.set(coreqNum, {
                        id: coreqNum,
                        label: coreqNum,
                        data: {
                            subjectNumber: coreqClass.subjectNumber,
                            subjectTitle: coreqClass.subjectTitle || '',
                            department: coreqClass.department || '',
                            type: 'corequisite'
                        }
                    })
                    edges.push({
                        id: `${rootId}<->${coreqNum}`,
                        source: rootId,
                        target: coreqNum,
                        label: 'coreq',
                        data: { type: 'corequisite' }
                    })
                }
            }

            for (const girCode of coreqData.girCodes) {
                const girNodeId = `GIR:${girCode}`
                ensureGIRNodeInMap(nodesMap, girNodeId)
                edges.push({
                    id: `${rootId}<->${girNodeId}`,
                    source: rootId,
                    target: girNodeId,
                    label: 'coreq',
                    data: { type: 'corequisite' }
                })
            }
        }
    }

    // Find classes that require this class as prereq/coreq
    const requiredByClasses = await Class.find({
        offered: true,
        $or: [
            { prerequisites: { $regex: buildExactCourseNumberRegex(rootId) } },
            { corequisites: { $regex: buildExactCourseNumberRegex(rootId) } }
        ]
    }).lean() as IClass[]

    for (const reqClass of requiredByClasses) {
        if (!nodesMap.has(reqClass.subjectNumber)) {
            nodesMap.set(reqClass.subjectNumber, {
                id: reqClass.subjectNumber,
                label: reqClass.subjectNumber,
                data: {
                    subjectNumber: reqClass.subjectNumber,
                    subjectTitle: reqClass.subjectTitle || '',
                    department: reqClass.department || '',
                    type: 'requiredBy'
                }
            })
        }

        const prereqNums = await extractCourseNumbersWithGIR(reqClass.prerequisites || '')
        const coreqNums = await extractCourseNumbersWithGIR(reqClass.corequisites || '')

        if (prereqNums.includes(rootId)) {
            edges.push({
                id: `${rootId}->${reqClass.subjectNumber}`,
                source: rootId,
                target: reqClass.subjectNumber,
                label: 'prereq for',
                data: { type: 'prerequisite' }
            })
        } else if (coreqNums.includes(rootId)) {
            edges.push({
                id: `${rootId}<->${reqClass.subjectNumber}`,
                source: rootId,
                target: reqClass.subjectNumber,
                label: 'coreq',
                data: { type: 'corequisite' }
            })
        }
    }

    return {
        nodes: Array.from(nodesMap.values()),
        edges
    }
}

/**
 * Build full network graph for all classes in an academic year
 */
export async function buildFullNetworkGraph(
    academicYear: number,
    department?: string,
    includeIsolated: boolean = false
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const query: any = {
        academicYear,
        offered: true,
        description: { $exists: true, $ne: '' }
    }

    if (department) {
        query.department = department
    }

    const classes = await Class.find(query)
        .select('subjectNumber subjectTitle department prerequisites corequisites girAttribute aliases units')
        .lean() as IClass[]

    const nodesMap = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const classSet = new Set(classes.map(c => c.subjectNumber))
    const nodeDegrees = new Map<string, number>()

    const subjectNumberToGIRCode = await buildSubjectNumberToGIRCodeFromDB()
    for (const cls of classes) {
        const code = getGIRCodeForClass(cls)
        if (code) {
            subjectNumberToGIRCode.set(cls.subjectNumber, code)
            for (const alias of cls.aliases || []) {
                subjectNumberToGIRCode.set(alias, code)
            }
        }
    }

    // Initialize degrees
    for (const cls of classes) {
        nodeDegrees.set(cls.subjectNumber, 0)
    }

    // Track GIR requirement nodes
    const girRequirementNodes = new Set<string>()

    // Add edges for prerequisites and corequisites
    for (const cls of classes) {
        const prereqData = extractPrerequisites(cls.prerequisites || '')
        const coreqData = extractPrerequisites(cls.corequisites || '')

        for (const prereq of prereqData.courseNumbers) {
            const girCode = subjectNumberToGIRCode.get(prereq)

            const collapseToGIR = girCode && CORE_GIR_SET.has(girCode)
            const sourceId = collapseToGIR ? `GIR:${girCode}` : prereq
            const includeEdge = collapseToGIR || classSet.has(prereq)
            if (includeEdge) {
                if (collapseToGIR) girRequirementNodes.add(sourceId)
                edges.push({
                    id: `${sourceId}->${cls.subjectNumber}`,
                    source: sourceId,
                    target: cls.subjectNumber,
                    data: { type: 'prerequisite' }
                })
                nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1)
                nodeDegrees.set(cls.subjectNumber, (nodeDegrees.get(cls.subjectNumber) || 0) + 1)
            }
        }

        for (const girCode of prereqData.girCodes) {
            if (!CORE_GIR_SET.has(girCode)) continue
            const girNodeId = `GIR:${girCode}`
            girRequirementNodes.add(girNodeId)
            edges.push({
                id: `${girNodeId}->${cls.subjectNumber}`,
                source: girNodeId,
                target: cls.subjectNumber,
                data: { type: 'prerequisite' }
            })
            nodeDegrees.set(girNodeId, (nodeDegrees.get(girNodeId) || 0) + 1)
            nodeDegrees.set(cls.subjectNumber, (nodeDegrees.get(cls.subjectNumber) || 0) + 1)
        }

        for (const coreq of coreqData.courseNumbers) {
            const girCode = subjectNumberToGIRCode.get(coreq)

            const collapseToGIRCoreq = girCode && CORE_GIR_SET.has(girCode)
            const targetId = collapseToGIRCoreq ? `GIR:${girCode}` : coreq
            const includeEdge = collapseToGIRCoreq || classSet.has(coreq)
            if (includeEdge) {
                if (collapseToGIRCoreq) girRequirementNodes.add(targetId)
                edges.push({
                    id: `${cls.subjectNumber}<->${targetId}`,
                    source: cls.subjectNumber,
                    target: targetId,
                    data: { type: 'corequisite' }
                })
                nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1)
                nodeDegrees.set(cls.subjectNumber, (nodeDegrees.get(cls.subjectNumber) || 0) + 1)
            }
        }

        for (const girCode of coreqData.girCodes) {
            if (!CORE_GIR_SET.has(girCode)) continue
            const girNodeId = `GIR:${girCode}`
            girRequirementNodes.add(girNodeId)
            edges.push({
                id: `${cls.subjectNumber}<->${girNodeId}`,
                source: cls.subjectNumber,
                target: girNodeId,
                data: { type: 'corequisite' }
            })
            nodeDegrees.set(girNodeId, (nodeDegrees.get(girNodeId) || 0) + 1)
            nodeDegrees.set(cls.subjectNumber, (nodeDegrees.get(cls.subjectNumber) || 0) + 1)
        }
    }

    for (const girNodeId of girRequirementNodes) {
        const girCode = girNodeId.replace('GIR:', '')
        if (!CORE_GIR_SET.has(girCode)) continue
        const degree = nodeDegrees.get(girNodeId) || 0
        if (includeIsolated || degree > 0) {
            nodesMap.set(girNodeId, makeGIRNode(girCode))
        }
    }

    for (const cls of classes) {
        const girCodeForClass = subjectNumberToGIRCode.get(cls.subjectNumber)
        if (girCodeForClass && CORE_GIR_SET.has(girCodeForClass)) continue
        const degree = nodeDegrees.get(cls.subjectNumber) || 0

        if (includeIsolated || degree > 0) {
            // Only treat a subset of GIRs as central "hub" GIR nodes:
            // plus specific math classes 18.03 and 18.06.
            const girAttributes = cls.girAttribute || []
            const hasCoreGirAttribute = girAttributes.some(attr => CORE_GIR_SET.has(attr))
            const isCoreMathGir = cls.subjectNumber === '18.03' || cls.subjectNumber === '18.06'
            const isCoreGir = hasCoreGirAttribute || isCoreMathGir

            nodesMap.set(cls.subjectNumber, {
                id: cls.subjectNumber,
                label: cls.subjectNumber,
                data: {
                    subjectNumber: cls.subjectNumber,
                    subjectTitle: cls.subjectTitle || '',
                    department: cls.department || '',
                    type: 'root',
                    isGIR: isCoreGir,
                    girAttributes
                }
            })
        }
    }

    const nodeIds = new Set(nodesMap.keys())
    for (const edge of edges) {
        const src = edge.source as string
        const tgt = edge.target as string
        let newSource = src
        let newTarget = tgt
        if (!nodeIds.has(src)) {
            const girCode = subjectNumberToGIRCode.get(src)
            if (girCode && CORE_GIR_SET.has(girCode)) newSource = `GIR:${girCode}`
        }
        if (!nodeIds.has(tgt)) {
            const girCode = subjectNumberToGIRCode.get(tgt)
            if (girCode && CORE_GIR_SET.has(girCode)) newTarget = `GIR:${girCode}`
        }
        if (newSource !== src || newTarget !== tgt) {
            edge.source = newSource
            edge.target = newTarget
            edge.id = edge.data?.type === 'corequisite' ? `${newSource}<->${newTarget}` : `${newSource}->${newTarget}`
        }
    }
    const seen = new Set<string>()
    const dedupedEdges = edges.filter((e) => {
        const key = `${e.source}|${e.target}|${(e.data as any)?.type ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    return {
        nodes: Array.from(nodesMap.values()),
        edges: dedupedEdges
    }
}
