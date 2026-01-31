import mongoConnection from '@/utils/mongoConnection'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '../auth/[...nextauth]'
import User from '@/models/User'
import AuditLog from '@/models/AuditLog'
import CourseEmbedding from '@/models/CourseEmbedding'
import ClassReview from '@/models/ClassReview'

/**
 * Privacy settings endpoint
 * Allows users to update their privacy preferences
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT' && req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        await mongoConnection()

        const session = await getServerSession(req, res, authOptions)
        if (!session || !session.user?.email) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        const user = await User.findOne({ email: session.user.email })
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        const { aiEmbeddingOptOut, qaEmailOptOut } = req.body

        // Validate inputs
        if (typeof aiEmbeddingOptOut !== 'boolean' && typeof qaEmailOptOut !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'At least one privacy setting must be provided'
            })
        }

        // Track changes for audit log
        const changes = []
        const oldValues = {
            aiEmbeddingOptOut: user.aiEmbeddingOptOut || false,
            qaEmailOptOut: user.qaEmailOptOut || false
        }

        // Update user
        if (typeof aiEmbeddingOptOut === 'boolean') {
            if (user.aiEmbeddingOptOut !== aiEmbeddingOptOut) {
                changes.push(`AI Embedding: ${user.aiEmbeddingOptOut ? 'opted-out' : 'opted-in'} → ${aiEmbeddingOptOut ? 'opted-out' : 'opted-in'}`)
            }
            user.aiEmbeddingOptOut = aiEmbeddingOptOut
        }

        if (typeof qaEmailOptOut === 'boolean') {
            if (user.qaEmailOptOut !== qaEmailOptOut) {
                changes.push(`Q&A Emails: ${user.qaEmailOptOut ? 'opted-out' : 'opted-in'} → ${qaEmailOptOut ? 'opted-out' : 'opted-in'}`)
            }
            user.qaEmailOptOut = qaEmailOptOut
        }

        await user.save()

        // Create audit log
        if (changes.length > 0) {
            await AuditLog.create({
                actor: user._id,
                type: 'PrivacySettingsUpdate',
                description: `Privacy settings updated: ${changes.join(', ')}`
            })

            // If user opted out of AI embeddings, trigger regeneration for affected classes
            if (typeof aiEmbeddingOptOut === 'boolean' && aiEmbeddingOptOut && !oldValues.aiEmbeddingOptOut) {
                // User just opted OUT - need to regenerate embeddings
                console.log(`User ${user.email} opted out - will regenerate affected embeddings`)

                // Find classes with reviews from this user
                const userReviews = await ClassReview.find({
                    author: user._id,
                    display: true
                }).distinct('class')

                if (userReviews.length > 0) {
                    // Mark these embeddings as needing regeneration by deleting them
                    // They'll be regenerated on next embedding generation run
                    const deleteResult = await CourseEmbedding.deleteMany({
                        class: { $in: userReviews },
                        embeddingType: 'reviews'
                    })

                    console.log(`Deleted ${deleteResult.deletedCount} review embeddings for regeneration`)

                    return res.status(200).json({
                        success: true,
                        message: 'Privacy settings updated. Review embeddings will be regenerated without your data.',
                        embeddingsAffected: userReviews.length,
                        changes
                    })
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Privacy settings updated successfully',
            changes
        })

    } catch (error) {
        console.error('Privacy settings update error:', error)
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        })
    }
}
