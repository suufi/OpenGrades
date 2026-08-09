import AISearchConversation from '@/models/AISearchConversation'
import User from '@/models/User'
import { withApiLogger } from '@/utils/apiLogger'
import { getUserFromRequest } from '@/utils/authMiddleware'
import mongoConnection from '@/utils/mongoConnection'
import { Types } from 'mongoose'
import type { NextApiRequest, NextApiResponse } from 'next'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
        res.setHeader('Allow', 'GET, POST, PATCH')
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    res.setHeader('Cache-Control', 'private, no-store')

    try {
        await mongoConnection()

        const requestUser = await getUserFromRequest(req, res)
        if (!requestUser?.email) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        const user = await User.findOne({ email: requestUser.email.toLowerCase() })
            .select('_id')
            .lean()
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        if (req.method === 'POST') {
            const title = normalizeTitle(req.body?.title) || 'New course search'
            const conversation = await AISearchConversation.create({
                user: user._id,
                title,
                messages: []
            })

            return res.status(201).json({
                success: true,
                conversation: serializeConversation(conversation),
                summary: serializeSummary(conversation)
            })
        }

        if (req.method === 'PATCH') {
            const { id } = req.body || {}
            const title = normalizeTitle(req.body?.title)
            if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: 'Invalid conversation ID' })
            }
            if (!title) {
                return res.status(400).json({ success: false, message: 'A conversation name is required' })
            }

            const conversation = await AISearchConversation.findOneAndUpdate(
                { _id: id, user: user._id },
                { $set: { title } },
                { new: true }
            )
            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' })
            }

            return res.status(200).json({
                success: true,
                summary: serializeSummary(conversation)
            })
        }

        const requestedId = typeof req.query.id === 'string' ? req.query.id : ''
        if (requestedId && !Types.ObjectId.isValid(requestedId)) {
            return res.status(400).json({ success: false, message: 'Invalid conversation ID' })
        }

        const conversations = await AISearchConversation.aggregate([
            { $match: { user: user._id } },
            { $sort: { updatedAt: -1 } },
            { $limit: 50 },
            {
                $project: {
                    title: 1,
                    messageCount: { $size: '$messages' },
                    createdAt: 1,
                    updatedAt: 1
                }
            }
        ])

        const conversationToLoad = requestedId || conversations[0]?._id?.toString()
        const conversation = conversationToLoad
            ? await AISearchConversation.findOne({ _id: conversationToLoad, user: user._id }).lean()
            : null

        if (requestedId && !conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' })
        }

        return res.status(200).json({
            success: true,
            conversations: conversations.map(serializeSummary),
            conversation: conversation ? serializeConversation(conversation) : null
        })
    } catch (error) {
        console.error('AI search conversation API error:', error)
        return res.status(500).json({
            success: false,
            message: req.method === 'GET'
                ? 'Could not load conversation history'
                : 'Could not save conversation changes'
        })
    }
}

function normalizeTitle(value: unknown): string {
    if (typeof value !== 'string') return ''
    return value.replace(/\s+/g, ' ').trim().slice(0, 120)
}

function serializeSummary(conversation: any) {
    return {
        id: conversation._id.toString(),
        title: conversation.title,
        messageCount: typeof conversation.messageCount === 'number'
            ? conversation.messageCount
            : Array.isArray(conversation.messages) ? conversation.messages.length : 0,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
    }
}

function serializeConversation(conversation: any) {
    return {
        id: conversation._id.toString(),
        title: conversation.title,
        messages: (conversation.messages || []).map((message: any) => ({
            role: message.role,
            content: message.content,
            reasoning: message.reasoning || undefined,
            courses: Array.isArray(message.courses) ? message.courses : undefined,
            createdAt: message.createdAt
        })),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
    }
}

export default withApiLogger(handler)
