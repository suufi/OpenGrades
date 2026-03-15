import type { NextApiRequest, NextApiResponse } from 'next'
import mongoConnection from '@/utils/mongoConnection'
import Karma from '@/models/Karma'
import User from '@/models/User'
import CourseOption from '@/models/CourseOption'
import { getKarmaDisplayName } from '@/utils/karmaDisplayName'
import { getUserFromRequest } from '@/utils/authMiddleware'
import { sortDepartmentCodes } from '@/utils/departments'
import { IUser } from '@/types'

const LIMIT = 100

type KarmaMode = 'current' | 'alltime'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    await mongoConnection()

    const classOfParam = req.query.classOf
    const classOfFilter =
      classOfParam !== undefined && classOfParam !== ''
        ? parseInt(String(classOfParam), 10)
        : null
    if (classOfParam !== undefined && classOfParam !== '' && Number.isNaN(classOfFilter)) {
      return res.status(400).json({ success: false, message: 'Invalid classOf' })
    }

    const mode: KarmaMode =
      req.query.mode === 'alltime' ? 'alltime' : 'current'
    const departmentParam =
      typeof req.query.department === 'string' && req.query.department.trim()
        ? req.query.department.trim()
        : null

    // For "current": total = sum(amount). For "alltime": total = sum(positive amount only).
    const totalExpr =
      mode === 'alltime'
        ? { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } }
        : { $sum: '$amount' }

    const pipeline: any[] = [
      { $group: { _id: '$actor', total: totalExpr } },
      { $match: { total: { $gt: 0 } } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
          pipeline: [{ $project: { karmaDisplayKerb: 1, kerb: 1, classOf: 1 } }],
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ]
    if (classOfFilter != null) {
      pipeline.push({ $match: { 'user.classOf': classOfFilter } })
    }
    if (departmentParam) {
      const courseOptionIds = await CourseOption.find({ departmentCode: departmentParam })
        .distinct('_id')
        .lean()
      const userIdsInDept =
        courseOptionIds.length > 0
          ? await User.find({ courseAffiliation: { $in: courseOptionIds } })
            .distinct('_id')
            .lean()
          : []
      if (userIdsInDept.length > 0) {
        pipeline.push({ $match: { _id: { $in: userIdsInDept } } })
      } else {
        pipeline.push({ $match: { _id: { $in: [] } } })
      }
    }
    pipeline.push({ $sort: { total: -1 } })

    // Total count with same filters (for rank %), without limit
    const countPipeline = [...pipeline, { $count: 'totalCount' }]
    const countResult = await Karma.aggregate(countPipeline)
    const totalCount = countResult[0]?.totalCount ?? 0

    pipeline.push({ $limit: LIMIT })
    const aggregated = await Karma.aggregate(pipeline)

    const rows = aggregated.map((row: any, index: number) => {
      const u = row.user || {}
      return {
        rank: index + 1,
        userId: row._id?.toString?.() ?? row._id,
        displayName: getKarmaDisplayName(u),
        total: row.total,
        classOf: u.classOf ?? null,
        rankPercent: totalCount > 0 ? Math.max(1, Math.round(((index + 1) / totalCount) * 100)) : null,
      }
    })

    // Distinct class years that have at least one user with karma (for filter dropdown)
    const actorIds = await Karma.aggregate([
      { $group: { _id: '$actor' } },
      { $match: { _id: { $ne: null } } },
    ])
    const ids = actorIds.map((x: any) => x._id).filter(Boolean)
    const classYears =
      ids.length > 0
        ? await User.find({ _id: { $in: ids }, classOf: { $exists: true, $ne: null } })
          .distinct('classOf')
          .then((arr: number[]) => arr.sort((a, b) => a - b))
        : []

    // Distinct departments (from CourseOption.departmentCode) for filter dropdown
    const departments = await CourseOption.distinct('departmentCode').then((arr: string[]) => sortDepartmentCodes(arr.filter(Boolean)))

    // Current user's rank and entry (if logged in)
    let me: {
      rank: number
      userId: string
      displayName: string
      total: number
      classOf: number | null
      rankPercent: number | null
    } | null = null
    const requestUser = await getUserFromRequest(req, res)
    if (requestUser?.email) {
      const userDoc = await User.findOne({ email: requestUser.email })
        .select('_id classOf karmaDisplayKerb kerb')
        .lean()
      if (userDoc) {
        const userId = (userDoc as IUser)._id
        const myTotalResult = await Karma.aggregate([
          { $match: { actor: userId } },
          { $group: { _id: null, total: mode === 'alltime' ? { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } } : { $sum: '$amount' } } },
        ])
        const myTotal = myTotalResult[0]?.total ?? 0
        const rankPipeline: any[] = [
          { $group: { _id: '$actor', total: totalExpr } },
          { $match: { total: { $gt: 0 } } },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { classOf: 1 } }] } },
          { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
        ]
        if (classOfFilter != null) {
          rankPipeline.push({ $match: { 'u.classOf': classOfFilter } })
        }
        if (departmentParam) {
          const courseOptionIds = await CourseOption.find({ departmentCode: departmentParam }).distinct('_id').lean()
          const userIdsInDept =
            courseOptionIds.length > 0
              ? await User.find({ courseAffiliation: { $in: courseOptionIds } }).distinct('_id').lean()
              : []
          rankPipeline.push({ $match: { _id: { $in: userIdsInDept.length > 0 ? userIdsInDept : [] } } })
        }
        rankPipeline.push({ $match: { total: { $gt: myTotal } } }, { $count: 'n' })
        const rankCount = await Karma.aggregate(rankPipeline)
        const rank = (rankCount[0]?.n ?? 0) + 1
        me = {
          rank,
          userId: userId?.toString?.() ?? String(userId),
          displayName: getKarmaDisplayName(userDoc as any),
          total: myTotal,
          classOf: (userDoc as any).classOf ?? null,
          rankPercent: totalCount > 0 ? Math.max(1, Math.round((rank / totalCount) * 100)) : null,
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: rows,
      classYears,
      departments,
      totalCount,
      me,
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
