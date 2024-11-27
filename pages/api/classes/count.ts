import Class from '@/models/Class'
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
    success: boolean,
    data?: object,
    message?: string
}

export default async function handler (
    req: NextApiRequest,
    res: NextApiResponse<Data>
) {
    await mongoConnection()
    const { method } = req

    if (method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    try {
        // Aggregate classes by term and department and get the counts
        const counts = await Class.aggregate([
            {
                $group: {
                    _id: {
                        term: '$term',
                        department: '$department'
                    },
                    classCount: { $sum: 1 },
                    displayCount: {
                        $sum: {
                            $cond: [{ $eq: ['$display', true] }, 1, 0]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id.term',
                    departments: {
                        $push: {
                            department: '$_id.department',
                            classCount: '$classCount',
                            displayCount: '$displayCount'
                        }
                    }
                }
            },
            {
                $project: {
                    term: '$_id',
                    _id: 0,
                    departments: 1
                }
            },
            { $sort: { term: 1 } } // Sort by term
        ])

        return res.status(200).json({
            success: true,
            data: counts
        })
    } catch (error) {
        console.error('Error fetching class counts:', error)
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}
