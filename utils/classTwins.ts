/**
 * Twin-class detection: two Class docs in the same term that refer to the same
 * subject (each other's subjectNumber/aliases), e.g. a 6.009 doc AND a 6.1010
 * doc both present in 2022FA. Twins double-count in charts and search.
 */
import { normalizeSubjectId } from './warehouse.ts'

export interface TwinCandidateDoc {
    _id: string
    term: string
    subjectNumber: string
    subjectTitle?: string
    aliases?: string[]
    display?: boolean
    oldSubjectNumber?: string | null
    createdAt?: string | Date
}

export interface TwinPair {
    term: string
    a: TwinCandidateDoc
    b: TwinCandidateDoc
}

/**
 * Find pairs of docs in the same term that alias each other (or share a
 * normalized subject number).
 */
export function findTwinPairs(docs: TwinCandidateDoc[]): TwinPair[] {
    const byTerm = new Map<string, TwinCandidateDoc[]>()
    for (const doc of docs) {
        if (!byTerm.has(doc.term)) byTerm.set(doc.term, [])
        byTerm.get(doc.term)!.push(doc)
    }

    const pairs: TwinPair[] = []
    for (const [term, termDocs] of byTerm) {
        const bySubject = new Map<string, TwinCandidateDoc[]>()
        for (const doc of termDocs) {
            const key = normalizeSubjectId(doc.subjectNumber)
            if (!bySubject.has(key)) bySubject.set(key, [])
            bySubject.get(key)!.push(doc)
        }

        const seenPairs = new Set<string>()
        const addPair = (a: TwinCandidateDoc, b: TwinCandidateDoc) => {
            if (a._id === b._id) return
            const key = [a._id, b._id].sort().join(':')
            if (seenPairs.has(key)) return
            seenPairs.add(key)
            pairs.push({ term, a, b })
        }

        for (const doc of termDocs) {
            for (const dup of bySubject.get(normalizeSubjectId(doc.subjectNumber)) ?? []) {
                addPair(doc, dup)
            }

            for (const alias of doc.aliases ?? []) {
                for (const other of bySubject.get(normalizeSubjectId(alias)) ?? []) {
                    addPair(doc, other)
                }
            }
        }
    }
    return pairs
}

export interface TwinAttachmentCounts {
    reviews: number
    content: number
    users: number
}

export interface TwinGroup {
    term: string
    a: TwinCandidateDoc & { attachments: TwinAttachmentCounts }
    b: TwinCandidateDoc & { attachments: TwinAttachmentCounts }
    safeToHide: string | null
}

function totalAttachments(c: TwinAttachmentCounts): number {
    return c.reviews + c.content + c.users
}

/**
 * Decide which half of a pair (if any) is safe to hide:
 * - exactly one side has zero attachments: hide that side;
 * - both zero: hide the one carrying the other's old number (renumbering
 *   tombstone), when that disambiguates; otherwise manual.
 */
export function pickSafeToHide(
    a: TwinCandidateDoc & { attachments: TwinAttachmentCounts },
    b: TwinCandidateDoc & { attachments: TwinAttachmentCounts }
): string | null {
    const aTotal = totalAttachments(a.attachments)
    const bTotal = totalAttachments(b.attachments)

    if (a.display === false || b.display === false) return null
    if (aTotal === 0 && bTotal > 0) return a._id
    if (bTotal === 0 && aTotal > 0) return b._id
    if (aTotal === 0 && bTotal === 0) {
        const aIsOldOfB = b.oldSubjectNumber && normalizeSubjectId(a.subjectNumber) === normalizeSubjectId(b.oldSubjectNumber)
        const bIsOldOfA = a.oldSubjectNumber && normalizeSubjectId(b.subjectNumber) === normalizeSubjectId(a.oldSubjectNumber)
        if (aIsOldOfB && !bIsOldOfA) return a._id
        if (bIsOldOfA && !aIsOldOfB) return b._id
    }
    return null
}
