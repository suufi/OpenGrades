import mongoConnection from '@/utils/mongoConnection'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '../auth/[...nextauth]'
import {
    collaborativeFiltering,
    departmentAffinityRecommendations,
    contentBasedRecommendations,
    hybridRecommendations
} from '@/utils/recommendations'
import User from '@/models/User'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'

/**
 * Personalized recommendations API endpoint
 * Combines multiple recommendation strategies to provide personalized class recommendations
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const session = await getServerSession(req, res, authOptions)
        if (!session || !session.user?.email) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        const user = await User.findOne({ email: session.user.email }).populate('classesTaken')
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        if (!hasRecentGradeReport(user.lastGradeReportUpload)) {
            return res.status(403).json({
                success: false,
                message: 'Access to AI recommendations requires a grade report upload within the last 4 months'
            })
        }

        const userId = user._id.toString()

        const type = req.query.type as string || 'all'
        const limit = parseInt(req.query.limit as string) || 5

        let recommendations = []

        if (type === 'collaborative' || type === 'all') {
            const collaborative = await collaborativeFiltering(userId, limit)
            recommendations.push({
                type: 'collaborative',
                title: 'Based on Similar Students',
                description: 'Classes taken by students with similar course history',
                items: collaborative
            })
        }

        if (type === 'department' || type === 'all') {
            const department = await departmentAffinityRecommendations(userId, limit)
            recommendations.push({
                type: 'department',
                title: 'Popular in Your Major',
                description: 'Highly-rated classes in your field of study',
                items: department
            })
        }

        if (type === 'content' || type === 'all') {
            const content = await contentBasedRecommendations(userId, limit)
            recommendations.push({
                type: 'content',
                title: 'Similar to Classes You\'ve Taken',
                description: 'Classes with similar topics and content',
                items: content
            })
        }

        if (type === 'embeddings' || type === 'all') {
            try {
                // Check if Elasticsearch is available
                try {
                    const { getESClient } = await import('@/utils/esClient')
                    const esClient = getESClient()
                    await esClient.ping()
                    console.log('✓ Elasticsearch connection successful')
                } catch (esError: any) {
                    console.error('❌ Elasticsearch health check failed:', esError.message)
                    console.error('   This will prevent embedding-based recommendations from working.')
                    console.error('   Make sure Elasticsearch is running and configured correctly.')
                    throw new Error(`Elasticsearch unavailable: ${esError.message}`)
                }

                const recentClasses = (user.classesTaken || []).slice(-15) // Last 15 classes NOTE: consider optimizing

                const userSubjectNumbers = new Set<string>()
                    ; (user.classesTaken || []).forEach((c: any) => {
                        if (c.subjectNumber) userSubjectNumbers.add(c.subjectNumber)
                        if (c.aliases && Array.isArray(c.aliases)) {
                            c.aliases.forEach((alias: string) => userSubjectNumbers.add(alias))
                        }
                    })

                console.log(`Generating embedding recommendations for ${recentClasses.length} classes`)
                console.log(`Filtering out ${userSubjectNumbers.size} subject numbers (including aliases)`)

                const embeddingRecs = new Map()

                const allRecs = await Promise.all(
                    recentClasses
                        .filter((cls: any) => cls._id)
                        .map(async (cls: any) => {
                            try {
                                // Pass all taken classes for department boosting
                                const recs = await hybridRecommendations(
                                    cls._id.toString(),
                                    25,
                                    0.8,
                                    user.classesTaken || []
                                )
                                console.log(`  ✓ Got ${recs.length} recommendations for ${cls.subjectNumber || cls._id}`)
                                return recs
                            } catch (err: any) {
                                console.error(`  ❌ Error getting hybrid recs for class ${cls.subjectNumber || cls._id}:`, err.message)
                                console.error('     Stack:', err.stack)
                                return []
                            }
                        })
                )

                // Import prerequisite checking
                const { extractCourseNumbers } = await import('@/utils/prerequisiteGraph')
                
                const checkPrerequisitesMet = (course: any) => {
                    const prereqNumbers = extractCourseNumbers(course.prerequisites || '')
                    const coreqNumbers = extractCourseNumbers(course.corequisites || '')
                    
                    const hasPrereqs = prereqNumbers.length === 0 || prereqNumbers.every(num => userSubjectNumbers.has(num))
                    const hasCoreqs = coreqNumbers.length === 0 || coreqNumbers.some(num => userSubjectNumbers.has(num))
                    
                    return { hasPrereqs, hasCoreqs, prereqCount: prereqNumbers.length, coreqCount: coreqNumbers.length }
                }

                let filteredCount = 0
                allRecs.flat().forEach(rec => {
                    const classId = rec.class._id.toString()
                    const subjectNumber = rec.class.subjectNumber

                    if (userSubjectNumbers.has(subjectNumber)) {
                        filteredCount++
                        return
                    }

                    if (rec.class.aliases && Array.isArray(rec.class.aliases)) {
                        const hasAliasMatch = rec.class.aliases.some((alias: string) =>
                            userSubjectNumbers.has(alias)
                        )
                        if (hasAliasMatch) {
                            return
                        }
                    }

                    // Boost if user has prerequisites/corequisites
                    const prereqCheck = checkPrerequisitesMet(rec.class)
                    let finalScore = rec.score
                    let finalReason = rec.reason
                    
                    const hasPrereqInfo = /you have the (prerequisites|corequisites)/i.test(finalReason)

                    if (!hasPrereqInfo) {
                        if (prereqCheck.hasPrereqs && prereqCheck.hasCoreqs) {
                            finalScore *= 1.3
                            finalReason += '\n✓ You have the prerequisites and corequisites'
                        } else if (prereqCheck.hasPrereqs) {
                            finalScore *= 1.2
                            finalReason += '\n✓ You have the prerequisites'
                        } else if (prereqCheck.hasCoreqs) {
                            finalScore *= 1.1
                            finalReason += '\n✓ You have the corequisites'
                        }
                    }

                    const boostedRec = {
                        ...rec,
                        score: finalScore,
                        reason: finalReason
                    }

                    if (!embeddingRecs.has(subjectNumber)) {
                        embeddingRecs.set(subjectNumber, boostedRec)
                    } else {
                        const existing = embeddingRecs.get(subjectNumber)
                        if (boostedRec.score > existing.score) {
                            embeddingRecs.set(subjectNumber, boostedRec)
                        }
                    }
                })

                const items = Array.from(embeddingRecs.values())
                    .sort((a, b) => b.score - a.score)
                    .slice(0, limit)

                console.log(`Total embedding recommendations: ${items.length} (filtered out ${filteredCount} already-taken classes)`)

                if (items.length > 0) {
                    recommendations.push({
                        type: 'embeddings',
                        title: 'AI-Powered Recommendations',
                        description: 'Intelligent suggestions based on course content and structure',
                        items
                    })
                } else {
                    console.log('No embedding recommendations generated.')
                }
            } catch (error) {
                console.error('Error generating embedding recommendations:', error)
            }
        }

        recommendations = recommendations.filter(rec => rec.items.length > 0)

        return res.status(200).json({
            success: true,
            data: recommendations
        })

    } catch (error) {
        console.error('Recommendations API error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        })
    }
}
