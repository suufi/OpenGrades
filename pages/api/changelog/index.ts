import Changelog from '@/models/Changelog'
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  success: boolean
  data?: unknown[]
  message?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    await mongoConnection()
    const entries = await Changelog.find({})
      .sort({ order: -1, date: -1 })
      .lean()

    return res.status(200).json({
      success: true,
      data: JSON.parse(JSON.stringify(entries))
    })
  } catch (error) {
    console.error('Changelog API error:', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    })
  }
}
