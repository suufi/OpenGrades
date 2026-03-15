import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '@/utils/mongoConnection'
import { getUserFromRequest } from '@/utils/authMiddleware'
import ClassQuestion from '@/models/ClassQuestion'
import ClassQuestionAnswer from '@/models/ClassQuestionAnswer'
import User from '@/models/User'
import { getKarmaDisplayName } from '@/utils/karmaDisplayName'
import { getAnonymousId } from '@/utils/anonymousId'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await mongoConnection()

  const questionId = req.query.questionId as string
  if (!questionId) {
    return res.status(400).json({ success: false, message: 'questionId required' })
  }

  if (req.method === 'GET') {
    const answers = await ClassQuestionAnswer.find({ question: questionId })
      .sort({ createdAt: 1 })
      .populate('author', 'kerb classOf karmaDisplayKerb')
      .lean()

    const list = answers.map((a) => ({
      _id: a._id,
      body: a.body,
      termTaken: a.termTaken,
      createdAt: a.createdAt,
      author: a.author ? { displayName: getKarmaDisplayName(a.author) } : null,
    }))

    return res.status(200).json({ success: true, data: list })
  }

  if (req.method === 'POST') {
    const user = await getUserFromRequest(req, res)
    if (!user?.email) {
      return res.status(403).json({ success: false, message: 'Please sign in.' })
    }

    const question = await ClassQuestion.findById(questionId).lean()
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' })
    }

    const { body, termTaken } = req.body ?? {}
    if (typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ success: false, message: 'body required' })
    }

    const author = await User.findOne({ email: user.email.toLowerCase() }).select('_id').lean()
    if (!author) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const doc = await ClassQuestionAnswer.create({
      question: questionId,
      author: (author)._id,
      body: body.trim(),
      termTaken: typeof termTaken === 'string' ? termTaken.trim() || undefined : undefined,
    })
    const docObj = doc.toObject ? doc.toObject() : doc
    return res.status(201).json({
      success: true,
      data: { ...docObj, authorAnonymousId: getAnonymousId((doc as any).author, questionId), upvotes: 0, downvotes: 0 },
    })
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' })
}