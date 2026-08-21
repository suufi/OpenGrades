/**
 * DB-bound half of twin-class handling (detection queries + safe resolution).
 */
import { Types } from 'mongoose'

import AuditLog from '../models/AuditLog'
import Class from '../models/Class'
import ClassReview from '../models/ClassReview'
import ContentSubmission from '../models/ContentSubmission'
import User from '../models/User'
import {
    findTwinPairs,
    pickSafeToHide,
    type TwinAttachmentCounts,
    type TwinGroup,
} from './classTwins'

async function attachmentCounts(ids: string[]): Promise<Map<string, TwinAttachmentCounts>> {
    const objectIds = ids.map((id) => new Types.ObjectId(id))
    const [reviews, content, users] = await Promise.all([
        ClassReview.aggregate([
            { $match: { class: { $in: objectIds } } },
            { $group: { _id: '$class', count: { $sum: 1 } } },
        ]),
        ContentSubmission.aggregate([
            { $match: { class: { $in: objectIds } } },
            { $group: { _id: '$class', count: { $sum: 1 } } },
        ]),
        User.aggregate([
            { $match: { classesTaken: { $in: objectIds } } },
            { $unwind: '$classesTaken' },
            { $match: { classesTaken: { $in: objectIds } } },
            { $group: { _id: '$classesTaken', count: { $sum: 1 } } },
        ]),
    ])

    const counts = new Map<string, TwinAttachmentCounts>()
    for (const id of ids) counts.set(id, { reviews: 0, content: 0, users: 0 })
    for (const row of reviews) counts.get(row._id.toString())!.reviews = row.count
    for (const row of content) counts.get(row._id.toString())!.content = row.count
    for (const row of users) counts.get(row._id.toString())!.users = row.count
    return counts
}

export async function scanTwinGroups(): Promise<TwinGroup[]> {
    const docs = await Class.find({ institution: { $ne: 'harvard' } })
        .select('term subjectNumber subjectTitle aliases display oldSubjectNumber createdAt')
        .lean()

    const pairs = findTwinPairs(docs.map((d) => ({
        _id: d._id.toString(),
        term: d.term,
        subjectNumber: d.subjectNumber,
        subjectTitle: d.subjectTitle,
        aliases: d.aliases,
        display: d.display,
        oldSubjectNumber: (d as { oldSubjectNumber?: string | null }).oldSubjectNumber,
        createdAt: d.createdAt,
    }))).filter((pair) => pair.a.display !== false && pair.b.display !== false)
    if (pairs.length === 0) return []

    const ids = [...new Set(pairs.flatMap((p) => [p.a._id, p.b._id]))]
    const counts = await attachmentCounts(ids)

    return pairs.map((pair) => {
        const a = { ...pair.a, attachments: counts.get(pair.a._id)! }
        const b = { ...pair.b, attachments: counts.get(pair.b._id)! }
        return { term: pair.term, a, b, safeToHide: pickSafeToHide(a, b) }
    })
}

export interface ResolveSafeTwinsResult {
    hidden: number
    hiddenSubjects: string[]
    remainingManual: number
}


export async function resolveSafeTwins(actorId?: string): Promise<ResolveSafeTwinsResult> {
    const groups = await scanTwinGroups()
    const toHide = groups.filter((g) => g.safeToHide !== null)
    const remainingManual = groups.length - toHide.length

    if (toHide.length > 0) {
        await Class.updateMany(
            { _id: { $in: toHide.map((g) => g.safeToHide) } },
            { $set: { display: false } }
        )
        const hiddenSubjects = toHide.map((g) => {
            const hiddenDoc = g.safeToHide === g.a._id ? g.a : g.b
            return `${hiddenDoc.subjectNumber} (${g.term})`
        })
        if (actorId) {
            await AuditLog.create({
                actor: actorId,
                type: 'ResolveTwinClasses',
                description: `Auto-hid ${toHide.length} duplicate class doc(s): ${hiddenSubjects.slice(0, 20).join(', ')}${hiddenSubjects.length > 20 ? ', ...' : ''}`,
            })
        }
        return { hidden: toHide.length, hiddenSubjects, remainingManual }
    }

    return { hidden: 0, hiddenSubjects: [], remainingManual }
}
