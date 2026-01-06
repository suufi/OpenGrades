import Class from '@/models/Class'
import User from '../models/User'
import ClassReview from '../models/ClassReview'
import CourseEmbedding, { ICourseEmbedding } from '@/models/CourseEmbedding'
import { IClass, IUser } from '../types'
import { vectorSearchES, hybridSearchES } from './vectorSearchES'
import { Types } from 'mongoose'
import { extractCourseNumbers } from './prerequisiteGraph'

function filterUROPClasses(classes: IClass[]): IClass[] {
    return classes.filter(cls => {
        const subjectNumber = cls.subjectNumber || ''
        return !subjectNumber.endsWith('.UR') && !subjectNumber.endsWith('.URG')
    })
}


function filterGIRClasses(classes: IClass[]): IClass[] {
    return classes.filter(cls => {
        const subjects = [
            "18.01A",
            "8.02",
            "ES.801",
            "8.01L",
            "ES.8012",
            "ES.8022",
            "8.012",
            "8.022",
            "ES.1802",
            "ES.1801",
            "ES.5111",
            "18.01",
            "5.112",
            "ES.802",
            "CC.1801",
            "8.011",
            "3.091",
            "ES.5112",
            "18.022",
            "ES.182A",
            "18.02A",
            "CC.5111",
            "18.01L",
            "8.021",
            "5.111",
            "18.02",
            "CC.801",
            "CC.1802",
            "ES.181A",
            "8.01",
            "CC.8022",
            "7.016",
            "ES.7012",
            "7.014",
            "ES.7013",
            "7.013",
            "7.015",
            "ES.7016",
            "7.012"
        ]
        const subjectNumber = cls.subjectNumber || ''

        return !subjects.some(subject => subjectNumber.startsWith(subject))
    })
}

/**
 * Check if user has prerequisites/corequisites for a course
 * Returns info about which prereqs/coreqs the user has
 */
function checkPrerequisitesMet(
    course: IClass,
    userTakenClasses: IClass[]
): { hasPrereqs: boolean; hasCoreqs: boolean; missingPrereqs: string[]; missingCoreqs: string[] } {
    const userSubjectNumbers = new Set<string>()
    userTakenClasses.forEach(cls => {
        if (cls.subjectNumber) userSubjectNumbers.add(cls.subjectNumber)
        if (cls.aliases && Array.isArray(cls.aliases)) {
            cls.aliases.forEach(alias => userSubjectNumbers.add(alias))
        }
    })

    const prereqNumbers = extractCourseNumbers(course.prerequisites || '')
    const coreqNumbers = extractCourseNumbers(course.corequisites || '')

    const hasPrereqs = prereqNumbers.length === 0 || prereqNumbers.every(num => userSubjectNumbers.has(num))
    const hasCoreqs = coreqNumbers.length === 0 || coreqNumbers.some(num => userSubjectNumbers.has(num))

    const missingPrereqs = prereqNumbers.filter(num => !userSubjectNumbers.has(num))
    const missingCoreqs = coreqNumbers.filter(num => !userSubjectNumbers.has(num))

    return { hasPrereqs, hasCoreqs, missingPrereqs, missingCoreqs }
}

/**
 * Deduplicate classes by subject number AND aliases
 * Prevents recommending the same class under different numbers (e.g., 6.100A and 6.0001)
 */
function deduplicateBySubjectNumber(classes: IClass[]): IClass[] {
    const seenNumbers = new Set<string>()
    const result: IClass[] = []

    classes.forEach(cls => {
        const subjectNumber = cls.subjectNumber || ''

        if (seenNumbers.has(subjectNumber)) return

        const aliases = cls.aliases || []
        if (aliases.some(alias => seenNumbers.has(alias))) return

        result.push(cls)
        seenNumbers.add(subjectNumber)
        aliases.forEach(alias => seenNumbers.add(alias))
    })

    return result
}

/**
 * Collaborative Filtering
 * Find users with similar course history and recommend classes they took
 * NOTE: Aggregates by subjectNumber (not classId) since same class has multiple IDs across terms
 */
export async function collaborativeFiltering(
    userId: string,
    limit: number = 10
): Promise<Array<{ class: IClass; score: number; reason: string }>> {
    const user = await User.findById(userId).populate('classesTaken').lean() as any
    if (!user || !user.classesTaken || user.classesTaken.length === 0) {
        return []
    }

    // Build set of subject numbers AND aliases user has taken
    const userSubjectNumbers = new Set<string>()
    user.classesTaken.forEach((cls: any) => {
        if (cls.subjectNumber) userSubjectNumbers.add(cls.subjectNumber)
        if (cls.aliases && Array.isArray(cls.aliases)) {
            cls.aliases.forEach((alias: string) => userSubjectNumbers.add(alias))
        }
    })

    const similarUsers = await User.aggregate([
        {
            $match: {
                _id: { $ne: new Types.ObjectId(userId) },
                classesTaken: { $in: user.classesTaken.map((c: any) => c._id) }
            }
        },
        {
            $project: {
                classesTaken: 1,
                overlap: {
                    $size: {
                        $setIntersection: [
                            '$classesTaken',
                            user.classesTaken.map((c: any) => c._id)
                        ]
                    }
                }
            }
        },
        {
            $match: {
                overlap: { $gte: 3 }
            }
        },
        {
            $sort: { overlap: -1 }
        },
        {
            $limit: 50
        }
    ])

    if (similarUsers.length === 0) {
        return []
    }

    const allClassIds = new Set<string>()
    similarUsers.forEach(u => {
        u.classesTaken.forEach((c: any) => allClassIds.add(c.toString()))
    })

    const allClasses = await Class.find({
        _id: { $in: Array.from(allClassIds) }
    }).lean()
    const classIdToSubject = new Map<string, string>()
    allClasses.forEach(c => classIdToSubject.set(c._id.toString(), c.subjectNumber))

    const subjectRecommendations = new Map<string, { count: number; maxOverlap: number }>()

    similarUsers.forEach(similarUser => {
        similarUser.classesTaken.forEach((classId: any) => {
            const subjectNumber = classIdToSubject.get(classId.toString())
            if (!subjectNumber) return

            if (userSubjectNumbers.has(subjectNumber)) return

            const existing = subjectRecommendations.get(subjectNumber)
            if (existing) {
                existing.count += 1
                existing.maxOverlap = Math.max(existing.maxOverlap, similarUser.overlap)
            } else {
                subjectRecommendations.set(subjectNumber, { count: 1, maxOverlap: similarUser.overlap })
            }
        })
    })

    const sortedRecommendations = Array.from(subjectRecommendations.entries())
        .map(([subjectNumber, data]) => ({
            subjectNumber,
            score: data.count * (data.maxOverlap / 10),
            count: data.count
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit * 2)

    const subjectNumbers = sortedRecommendations.map(r => r.subjectNumber)
    const classes = await Class.find({
        subjectNumber: { $in: subjectNumbers },
        offered: true
    }).sort({ academicYear: -1 }).lean()

    // Deduplicate by subject number (keep first = most recent)
    const subjectToClass = new Map<string, IClass>()
    classes.forEach(c => {
        if (!subjectToClass.has(c.subjectNumber)) {
            subjectToClass.set(c.subjectNumber, c as IClass)
        }
    })

    // Filter out UROP + GIR
    const filteredClasses = filterGIRClasses(filterUROPClasses(Array.from(subjectToClass.values())))
    const validSubjects = new Set(filteredClasses.map(c => c.subjectNumber))

    const finalClasses = filteredClasses.filter(cls => {
        if (cls.aliases && Array.isArray(cls.aliases)) {
            if (cls.aliases.some(alias => userSubjectNumbers.has(alias))) return false
        }
        return true
    })
    const finalSubjects = new Set(finalClasses.map(c => c.subjectNumber))

    const userClasses = user.classesTaken as IClass[]

    return sortedRecommendations
        .filter(rec => finalSubjects.has(rec.subjectNumber))
        .slice(0, limit)
        .map(rec => {
            const cls = finalClasses.find(c => c.subjectNumber === rec.subjectNumber)
            if (!cls) return null
            
            let reason = `${rec.count} students with similar course history took this class`
            let score = rec.score

            if (userClasses && userClasses.length > 0) {
                const prereqCheck = checkPrerequisitesMet(cls, userClasses)
                
                if (prereqCheck.hasPrereqs && prereqCheck.hasCoreqs) {
                    score *= 1.3
                    reason += '\n✓ You have the prerequisites and corequisites'
                } else if (prereqCheck.hasPrereqs) {
                    score *= 1.2
                    reason += '\n✓ You have the prerequisites'
                } else if (prereqCheck.hasCoreqs) {
                    score *= 1.1
                    reason += '\n✓ You have the corequisites'
                }
            }

            return {
                class: cls,
                score,
                reason
            }
        })
        .filter(Boolean) as Array<{ class: IClass; score: number; reason: string }>
}

/**
 * Department Affinity Scoring
 * Recommend highly-rated classes in user's major(s)
 * NOTE: Aggregates by subjectNumber (not classId) since same class has multiple IDs across terms
 */
export async function departmentAffinityRecommendations(
    userId: string,
    limit: number = 10
): Promise<Array<{ class: IClass; score: number; reason: string }>> {
    const user = await User.findById(userId)
        .populate('courseAffiliation')
        .populate('classesTaken')
        .lean() as any

    if (!user || !user.courseAffiliation || user.courseAffiliation.length === 0) {
        return []
    }

    const departments = user.courseAffiliation.map((aff: any) => aff.departmentCode)

    const userSubjectNumbers = new Set<string>()
        ; (user.classesTaken || []).forEach((cls: any) => {
            if (cls.subjectNumber) userSubjectNumbers.add(cls.subjectNumber)
            if (cls.aliases && Array.isArray(cls.aliases)) {
                cls.aliases.forEach((alias: string) => userSubjectNumbers.add(alias))
            }
        })

    const departmentClasses = await ClassReview.aggregate([
        {
            $lookup: {
                from: 'classes',
                localField: 'class',
                foreignField: '_id',
                as: 'classData'
            }
        },
        {
            $unwind: '$classData'
        },
        {
            $match: {
                'classData.department': { $in: departments },
                'classData.offered': true
            }
        },
        {
            $group: {
                _id: '$classData.subjectNumber',
                avgRating: { $avg: '$overallRating' },
                avgRecommendation: { $avg: '$recommendationLevel' },
                reviewCount: { $sum: 1 },
                department: { $first: '$classData.department' }
            }
        },
        {
            $match: {
                avgRating: { $gte: 5.5 },
                reviewCount: { $gte: 3 }
            }
        },
        {
            $sort: { avgRating: -1 }
        },
        {
            $limit: limit * 3
        }
    ])

    const filteredByTaken = departmentClasses.filter(item => {
        const subjectNumber = item._id
        if (userSubjectNumbers.has(subjectNumber)) return false
        return true
    })

    const subjectNumbers = filteredByTaken.map(r => r._id)
    const classes = await Class.find({
        subjectNumber: { $in: subjectNumbers },
        offered: true
    }).sort({ academicYear: -1 }).lean()

    // Deduplicate by subject number (keep first = most recent)
    const subjectToClass = new Map<string, IClass>()
    classes.forEach(c => {
        if (!subjectToClass.has(c.subjectNumber)) {
            subjectToClass.set(c.subjectNumber, c as IClass)
        }
    })

    // Filter out UROP + GIR
    const filteredClasses = filterGIRClasses(filterUROPClasses(Array.from(subjectToClass.values())))

    const finalClasses = filteredClasses.filter(cls => {
        if (cls.aliases && Array.isArray(cls.aliases)) {
            if (cls.aliases.some(alias => userSubjectNumbers.has(alias))) return false
        }
        return true
    })
    const finalSubjects = new Set(finalClasses.map(c => c.subjectNumber))

    return filteredByTaken
        .filter(rec => finalSubjects.has(rec._id))
        .slice(0, limit)
        .map(rec => {
            const cls = finalClasses.find(c => c.subjectNumber === rec._id)
            if (!cls) return null
            return {
                class: cls,
                score: rec.avgRating,
                reason: `Highly rated in your major (${cls.department})`
            }
        })
        .filter(Boolean) as Array<{ class: IClass; score: number; reason: string }>
}

/**
 * Content-based filtering
 * Find similar classes based on department, level, and keywords in descriptions
 */
export async function contentBasedRecommendations(
    userId: string,
    limit: number = 10
): Promise<Array<{ class: IClass; score: number; reason: string }>> {
    const user = await User.findById(userId).populate('classesTaken').lean() as any
    if (!user || !user.classesTaken || user.classesTaken.length === 0) {
        return []
    }

    const userClasses = user.classesTaken as IClass[]
    const userClassIds = userClasses.map(c => c._id.toString())

    const userSubjectNumbers = new Set<string>()
    userClasses.forEach(cls => {
        if (cls.subjectNumber) userSubjectNumbers.add(cls.subjectNumber)
        if (cls.aliases && Array.isArray(cls.aliases)) {
            cls.aliases.forEach(alias => userSubjectNumbers.add(alias))
        }
    })

    const departments = new Map<string, number>()
    const keywords = new Map<string, number>()

    userClasses.forEach(cls => {
        departments.set(cls.department, (departments.get(cls.department) || 0) + 1)

        const words = cls.subjectTitle
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 4)

        words.forEach(word => {
            keywords.set(word, (keywords.get(word) || 0) + 1)
        })
    })

    const topDepartments = Array.from(departments.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([dept]) => dept)

    const candidates = await Class.find({
        department: { $in: topDepartments },
        _id: { $nin: userClassIds },
        offered: true
    }).lean()

    const filteredCandidatesMinusUROP = filterUROPClasses(candidates as IClass[])
    const filteredCandidatesMinusGIR = filterGIRClasses(filteredCandidatesMinusUROP as IClass[])
    const filteredCandidatesMinusTaken = filteredCandidatesMinusGIR.filter(cls => {
        if (userSubjectNumbers.has(cls.subjectNumber)) return false
        if (cls.aliases && Array.isArray(cls.aliases)) {
            if (cls.aliases.some(alias => userSubjectNumbers.has(alias))) return false
        }
        return true
    })
    const deduplicated = deduplicateBySubjectNumber(filteredCandidatesMinusTaken)

    const scored = deduplicated.map(cls => {
        const words = cls.subjectTitle.toLowerCase().split(/\s+/)
        let keywordScore = 0

        words.forEach(word => {
            if (keywords.has(word)) {
                keywordScore += keywords.get(word)!
            }
        })

        return {
            class: cls as IClass,
            score: keywordScore + (departments.get(cls.department) || 0),
            reason: `Similar to classes you've taken in ${cls.department}`
        }
    })

    const boosted = scored.map(item => {
        const prereqCheck = checkPrerequisitesMet(item.class, userClasses)
        let finalScore = item.score
        let reason = item.reason

        if (prereqCheck.hasPrereqs && prereqCheck.hasCoreqs) {
            finalScore *= 1.3
            reason += '\n✓ You have the prerequisites and corequisites'
        } else if (prereqCheck.hasPrereqs) {
            finalScore *= 1.2
            reason += '\n✓ You have the prerequisites'
        } else if (prereqCheck.hasCoreqs) {
            finalScore *= 1.1
            reason += '\n✓ You have the corequisites'
        }

        return {
            ...item,
            score: finalScore,
            reason
        }
    })

    return boosted
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
}

/**
 * Hybrid Recommendations: Vector Similarity + BM25 + User History Boosting
 * Combines semantic similarity with keyword matching and boosts based on user's taken classes
 * 
 * @param classId - The class to get recommendations for
 * @param limit - Maximum results
 * @param semanticWeight - Weight for semantic results (0-1)
 * @param userTakenClasses - Optional array of classes user has taken (for department boosting)
 */
export async function hybridRecommendations(
    classId: string,
    limit: number = 10,
    semanticWeight: number = 0.6,
    userTakenClasses?: IClass[]
): Promise<Array<{ class: IClass; score: number; reason: string }>> {
    try {
        const sourceClass = await Class.findById(classId).lean() as IClass | null
        if (!sourceClass) {
            return []
        }

        const departmentBoosts = new Map<string, number>()
        if (userTakenClasses && userTakenClasses.length > 0) {
            const deptCounts = new Map<string, number>()
            for (const cls of userTakenClasses) {
                const dept = cls.subjectNumber?.split('.')[0] || ''
                if (dept) {
                    deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1)
                }
            }

            const maxCount = Math.max(...deptCounts.values(), 1)
            for (const [dept, count] of deptCounts) {
                departmentBoosts.set(dept, Math.min(0.5, (count / maxCount) * 0.5))
            }
        }

        const classesWithSameSubject = await Class.find({
            subjectNumber: sourceClass.subjectNumber,
            offered: true
        }).select('_id').lean()

        const classIdsWithSameSubject = classesWithSameSubject.map(c => c._id)

        const embedding = await CourseEmbedding.findOne({
            class: { $in: classIdsWithSameSubject },
            embeddingType: 'description'
        }).lean() as ICourseEmbedding | null

        if (!embedding) {
            console.warn(`⚠️  No embedding found for class ${sourceClass.subjectNumber} (${classId})`)
            console.warn(`   Searched ${classIdsWithSameSubject.length} classes with same subject number`)
            return []
        }

        if (!embedding.embedding || !Array.isArray(embedding.embedding) || embedding.embedding.length === 0) {
            console.warn(`⚠️  Embedding exists but is empty for class ${sourceClass.subjectNumber} (${classId})`)
            return []
        }

        let semanticResults: Array<{ class: IClass; score: number; reason: string }> = []

        try {
            const queryText = `${sourceClass.subjectNumber} ${sourceClass.subjectTitle} ${sourceClass.description?.substring(0, 200) || ''}`

            console.log(`🔍 Running hybrid search for ${sourceClass.subjectNumber} (embedding dim: ${embedding.embedding.length})`)

            const hybridResults = await hybridSearchES(
                embedding.embedding,
                queryText,
                limit * 2,
                'description',
                departmentBoosts.size > 0 ? departmentBoosts : undefined
            )

            console.log(`  ✓ Got ${hybridResults?.length || 0} hybrid search results`)

            if (hybridResults && Array.isArray(hybridResults)) {
                semanticResults = hybridResults
                    .filter(r => r.class._id.toString() !== classId && r.class.subjectNumber !== sourceClass.subjectNumber)
                    .map(r => {
                        const dept = r.class.subjectNumber?.split('.')[0] || ''
                        const isBoosted = departmentBoosts.has(dept) && (departmentBoosts.get(dept) || 0) > 0

                        let reason = 'Similar content based on course description'
                        if (isBoosted) {
                            reason += `\nMatches your interests in department ${dept}`
                        }

                        let finalScore = r.score * semanticWeight

                        if (userTakenClasses && userTakenClasses.length > 0) {
                            const prereqCheck = checkPrerequisitesMet(r.class, userTakenClasses)
                            
                            if (prereqCheck.hasPrereqs && prereqCheck.hasCoreqs) {
                                finalScore *= 1.3
                                reason += '\n✓ You have the prerequisites and corequisites'
                            } else if (prereqCheck.hasPrereqs) {
                                finalScore *= 1.2
                                reason += '\n✓ You have the prerequisites'
                            } else if (prereqCheck.hasCoreqs) {
                                finalScore *= 1.1
                                reason += '\n✓ You have the corequisites'
                            } else if (prereqCheck.missingPrereqs.length > 0 && prereqCheck.missingPrereqs.length < prereqCheck.missingPrereqs.length + (r.class.prerequisites ? extractCourseNumbers(r.class.prerequisites).length : 0)) {
                                finalScore *= 1.05
                                reason += `\n⚠ You have some prerequisites (${prereqCheck.missingPrereqs.length} missing)`
                            }
                        }

                        return {
                            class: r.class,
                            score: finalScore,
                            reason
                        }
                    })
            } else {
                console.warn(`⚠️  hybridSearchES returned invalid result for ${sourceClass.subjectNumber}`)
            }
        } catch (searchError) {
            console.error(`❌ Error in hybridSearchES for ${sourceClass.subjectNumber}:`, searchError)
        }

        return semanticResults
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)

    } catch (error) {
        console.error(`❌ Error in hybridRecommendations for classId ${classId}:`, error)
        console.error('  Stack:', error.stack)
        return []
    }
}
