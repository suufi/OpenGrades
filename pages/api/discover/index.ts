// @ts-nocheck
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import mongoConnection from '@/utils/mongoConnection'
import { withApiLogger } from '@/utils/apiLogger'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import authOptions from '../auth/[...nextauth]'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const startTime = Date.now()
    await mongoConnection()

    const session = await getServerSession(req, res, authOptions)
    if (!session) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    // Current academic year for filtering
    const now = new Date()
    const currentYear = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear()
    const pastYear = currentYear - 1

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const twoYearsAgo = currentYear - 2

    console.log('[Discover] Starting parallel queries...')
    const t1 = Date.now()

    const [hiddenGemsAgg, recentReviews, newClasses, classRatings] = await Promise.all([
      ClassReview.aggregate([
        {
          $group: {
            _id: '$class',
            avgRating: { $avg: '$overallRating' },
            avgRecommendation: { $avg: '$recommendationLevel' },
            reviewCount: { $sum: 1 }
          }
        },
        {
          $match: {
            avgRating: { $gte: 6 },
            reviewCount: { $gte: 3, $lte: 10 }
          }
        },
        { $sort: { avgRating: -1 } },
        { $limit: 10 }
      ]),

      ClassReview.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$class', recentReviewCount: { $sum: 1 } } },
        { $sort: { recentReviewCount: -1 } },
        { $limit: 10 }
      ]),

      Class.aggregate([
        { $sort: { subjectNumber: 1, academicYear: 1 } },
        {
          $group: {
            _id: '$subjectNumber',
            firstOffered: { $first: '$academicYear' },
            latestClass: { $last: '$$ROOT' }
          }
        },
        { $match: { firstOffered: { $gte: pastYear } } },
        { $sort: { firstOffered: -1 } },
        { $limit: 15 }
      ]),

      ClassReview.aggregate([
        {
          $lookup: {
            from: 'classes',
            localField: 'class',
            foreignField: '_id',
            as: 'classInfo'
          }
        },
        { $unwind: '$classInfo' },
        { $match: { 'classInfo.academicYear': { $gte: twoYearsAgo } } },
        {
          $group: {
            _id: {
              subjectNumber: '$classInfo.subjectNumber',
              academicYear: '$classInfo.academicYear'
            },
            avgRating: { $avg: '$overallRating' },
            count: { $sum: 1 },
            classData: { $first: '$classInfo' }
          }
        },
        { $match: { count: { $gte: 3 } } }
      ])
    ])

    console.log(`[Discover] Parallel queries done in ${Date.now() - t1}ms`)

    const hiddenGemClassIds = hiddenGemsAgg.map(item => item._id).filter(Boolean)
    const hiddenGemClasses = hiddenGemClassIds.length > 0
      ? await Class.find({ _id: { $in: hiddenGemClassIds }, offered: true })
        .select('subjectNumber subjectTitle department academicYear term units instructors _id')
        .lean()
      : []

    const hiddenGems = hiddenGemClasses
      .filter(cls => cls.subjectNumber && !cls.subjectNumber.endsWith('.UR') && !cls.subjectNumber.endsWith('.URG'))
      .map(cls => {
        const stats = hiddenGemsAgg.find(item => item._id?.toString() === cls._id?.toString())
        return { ...cls, avgRating: stats?.avgRating || 0, reviewCount: stats?.reviewCount || 0 }
      })
      .filter(cls => cls.avgRating > 0)

    const trendingClassIds = recentReviews.map(item => item._id)
    const trendingClasses = trendingClassIds.length > 0
      ? await Class.find({ _id: { $in: trendingClassIds }, offered: true })
        .select('subjectNumber subjectTitle department academicYear term units instructors')
        .lean()
      : []

    const trending = trendingClasses
      .filter(cls => !cls.subjectNumber?.endsWith('.UR') && !cls.subjectNumber?.endsWith('.URG'))
      .map(cls => {
        const data = recentReviews.find(item => item._id?.toString() === cls._id?.toString())
        return { ...cls, trendingScore: data?.recentReviewCount || 0, recentReviews: data?.recentReviewCount || 0, recentAdds: 0 }
      })
      .sort((a, b) => b.trendingScore - a.trendingScore)

    const newClassesFinal = newClasses
      .map(item => ({ ...item.latestClass, firstOffered: item.firstOffered }))
      .filter(cls => !cls.subjectNumber?.endsWith('.UR') && !cls.subjectNumber?.endsWith('.URG'))
      .slice(0, 10)

    const ratingsBySubject = new Map<string, Array<{ year: number, rating: number, classData: any }>>()
    for (const item of classRatings) {
      const subjectNumber = item._id.subjectNumber
      if (!ratingsBySubject.has(subjectNumber)) {
        ratingsBySubject.set(subjectNumber, [])
      }
      ratingsBySubject.get(subjectNumber)!.push({
        year: item._id.academicYear,
        rating: item.avgRating,
        classData: item.classData
      })
    }

    const improvementData: any[] = []
    for (const [subjectNumber, ratings] of ratingsBySubject) {
      if (ratings.length < 2) continue
      if (subjectNumber?.endsWith('.UR') || subjectNumber?.endsWith('.URG')) continue

      ratings.sort((a, b) => b.year - a.year)
      const latest = ratings[0]
      const previous = ratings[1]
      const improvement = latest.rating - previous.rating

      if (improvement > 0.5) {
        improvementData.push({
          ...latest.classData,
          currentRating: latest.rating,
          previousRating: previous.rating,
          improvement
        })
      }
    }

    const highestImprovement = improvementData
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 10)

    console.log(`[Discover] Total time: ${Date.now() - startTime}ms`)

    return res.status(200).json({
      success: true,
      data: {
        hiddenGems,
        trending,
        newClasses: newClassesFinal,
        highestImprovement
      }
    })

  } catch (error) {
    console.error('Discover API error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    })
  }
}

export default withApiLogger(handler)
