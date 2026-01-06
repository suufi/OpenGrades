import Class from '../models/Class'
import { IClass } from '../types'

function extractCourseNumbers(reqString: string): string[] {
    if (!reqString) return []

    // Match course numbers: department code, dot, 1-4 digits, optional letter
    const coursePattern = /\b([A-Z]{1,4}\d*\.\d{1,4}[A-Z]?|\d{1,2}[A-Z]?\.\d{1,4}[A-Z]?)\b/gi
    const matches = reqString.match(coursePattern) || []

    return [...new Set(matches.map(s => s.toUpperCase()))]
}

export { extractCourseNumbers }

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

    const prereqNumbers = extractCourseNumbers(sourceClass.prerequisites || '')
    const coreqNumbers = extractCourseNumbers(sourceClass.corequisites || '')

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
            { prerequisites: { $regex: new RegExp(`\\b${sourceClass.subjectNumber}\\b`, 'i') } },
            { corequisites: { $regex: new RegExp(`\\b${sourceClass.subjectNumber}\\b`, 'i') } }
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

        const prereqNumbers = extractCourseNumbers(currentClass.prerequisites || '')

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
        type: 'root' | 'prerequisite' | 'corequisite' | 'requiredBy'
        isGIR?: boolean
        girAttributes?: string[]
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
        const prereqNumbers = extractCourseNumbers(currentClass.prerequisites || '')
        for (const prereqNum of prereqNumbers) {
            const prereqClass = await Class.findOne({
                subjectNumber: prereqNum,
                offered: true
            }).lean() as IClass | null

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

        // Get corequisites (only for root)
        if (currentSubject === rootId) {
            const coreqNumbers = extractCourseNumbers(currentClass.corequisites || '')
            for (const coreqNum of coreqNumbers) {
                const coreqClass = await Class.findOne({
                    subjectNumber: coreqNum,
                    offered: true
                }).lean() as IClass | null

                if (coreqClass && !nodesMap.has(coreqNum)) {
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
        }
    }

    // Find classes that require this class as prereq/coreq
    const requiredByClasses = await Class.find({
        offered: true,
        $or: [
            { prerequisites: { $regex: new RegExp(`\\b${rootId}\\b`, 'i') } },
            { corequisites: { $regex: new RegExp(`\\b${rootId}\\b`, 'i') } }
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

        const prereqNums = extractCourseNumbers(reqClass.prerequisites || '')
        const coreqNums = extractCourseNumbers(reqClass.corequisites || '')

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
        .select('subjectNumber subjectTitle department prerequisites corequisites girAttribute')
        .lean() as IClass[]

    const nodesMap = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const classSet = new Set(classes.map(c => c.subjectNumber))
    const nodeDegrees = new Map<string, number>()

    // Initialize degrees
    for (const cls of classes) {
        nodeDegrees.set(cls.subjectNumber, 0)
    }

    // Add edges for prerequisites and corequisites
    for (const cls of classes) {
        const prereqNumbers = extractCourseNumbers(cls.prerequisites || '')
        const coreqNumbers = extractCourseNumbers(cls.corequisites || '')

        for (const prereq of prereqNumbers) {
            if (classSet.has(prereq)) {
                edges.push({
                    id: `${prereq}->${cls.subjectNumber}`,
                    source: prereq,
                    target: cls.subjectNumber,
                    data: { type: 'prerequisite' }
                })
                nodeDegrees.set(prereq, (nodeDegrees.get(prereq) || 0) + 1)
                nodeDegrees.set(cls.subjectNumber, (nodeDegrees.get(cls.subjectNumber) || 0) + 1)
            }
        }

        for (const coreq of coreqNumbers) {
            if (classSet.has(coreq)) {
                edges.push({
                    id: `${cls.subjectNumber}<->${coreq}`,
                    source: cls.subjectNumber,
                    target: coreq,
                    data: { type: 'corequisite' }
                })
                nodeDegrees.set(coreq, (nodeDegrees.get(coreq) || 0) + 1)
                nodeDegrees.set(cls.subjectNumber, (nodeDegrees.get(cls.subjectNumber) || 0) + 1)
            }
        }
    }

    // Add nodes
    for (const cls of classes) {
        const degree = nodeDegrees.get(cls.subjectNumber) || 0

        if (includeIsolated || degree > 0) {
            // Only treat a subset of GIRs as central "hub" GIR nodes:
            // plus specific math classes 18.03 and 18.06.
            const girAttributes = cls.girAttribute || []
            const coreGirAttributes = new Set(['BIOL', 'CAL1', 'CAL2', 'CHEM', 'PHY1', 'PHY2'])
            const hasCoreGirAttribute = girAttributes.some(attr => coreGirAttributes.has(attr))
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

    return {
        nodes: Array.from(nodesMap.values()),
        edges
    }
}
