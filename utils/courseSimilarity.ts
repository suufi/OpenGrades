import Class from '@/models/Class'
import CourseEmbedding from '@/models/CourseEmbedding'
import type { IClass } from '@/types'
import { hybridSearchES } from './vectorSearchES'

export type SimilarCourseResult = {
    class: IClass
    score: number
    institution: 'mit' | 'harvard'
}

/** Canonical key for deduplicating sections / aliases (one card per subject number). */
export function canonicalSubjectKey(cls: Pick<IClass, 'subjectNumber' | 'institution'>): string {
    const subject = (cls.subjectNumber || '').trim().toUpperCase()
    if (!subject) return ''
    const inst = (cls.institution || 'mit').toString().toLowerCase() === 'harvard' ? 'harvard' : 'mit'
    return `${inst}:${subject}`
}

function collectAliasKeys(cls: IClass): Set<string> {
    const keys = new Set<string>()
    const primary = canonicalSubjectKey(cls)
    if (primary) keys.add(primary)
    for (const alias of cls.aliases || []) {
        const a = alias.trim().toUpperCase()
        if (!a) continue
        const inst = (cls.institution || 'mit').toString().toLowerCase() === 'harvard' ? 'harvard' : 'mit'
        keys.add(`${inst}:${a}`)
    }
    return keys
}

export async function findSimilarCoursesByEmbedding(
    classId: string,
    options?: {
        limit?: number
        includeHarvard?: boolean
        scope?: 'public' | 'private'
    }
): Promise<SimilarCourseResult[]> {
    const limit = options?.limit ?? 12
    const includeHarvard = options?.includeHarvard ?? false
    const scope = options?.scope ?? 'public'

    const sourceClass = await Class.findById(classId).lean()
    if (!sourceClass) return []
    const sourceInstitution: 'mit' | 'harvard' =
        (sourceClass as any).institution === 'harvard' ? 'harvard' : 'mit'

    const excludeKeys = collectAliasKeys(sourceClass as IClass)

    const sameSubjectDocs = await Class.find({
        subjectNumber: sourceClass.subjectNumber,
        offered: true
    }).select('_id').lean()

    const embedding = await CourseEmbedding.findOne({
        class: { $in: sameSubjectDocs.map(c => c._id) },
        embeddingType: 'description',
        scope
    }).lean()

    if (!embedding?.embedding?.length) {
        return []
    }

    const hits = await hybridSearchES(
        embedding.embedding,
        `${sourceClass.subjectNumber} ${sourceClass.subjectTitle}`,
        limit * 10,
        'description',
        undefined,
        { scope }
    )

    const seen = new Set<string>(excludeKeys)
    const sameInstitution: SimilarCourseResult[] = []
    const otherInstitution: SimilarCourseResult[] = []

    for (const hit of hits) {
        const cls = hit.class
        const classIdStr = cls._id?.toString()
        if (!classIdStr || classIdStr === classId) continue

        const inst: 'mit' | 'harvard' = cls.institution === 'harvard' ? 'harvard' : 'mit'
        if (inst === 'harvard' && !includeHarvard) continue

        const key = canonicalSubjectKey(cls)
        if (!key || seen.has(key)) continue
        seen.add(key)

        const entry: SimilarCourseResult = {
            class: cls,
            score: hit.score,
            institution: inst
        }

        if (inst === sourceInstitution) sameInstitution.push(entry)
        else otherInstitution.push(entry)
    }

    const wantCrossInstitution =
        includeHarvard && (sourceInstitution === 'mit' || sourceInstitution === 'harvard')
    const minCross = wantCrossInstitution ? Math.min(4, Math.max(2, Math.floor(limit / 3))) : 0

    const results: SimilarCourseResult[] = []

    let crossTaken = 0
    while (results.length < limit && crossTaken < minCross && otherInstitution.length > 0) {
        results.push(otherInstitution.shift()!)
        crossTaken += 1
    }

    while (results.length < limit && (sameInstitution.length > 0 || otherInstitution.length > 0)) {
        const nextSame = sameInstitution[0]
        const nextOther = otherInstitution[0]

        if (!nextOther) {
            results.push(sameInstitution.shift()!)
            continue
        }
        if (!nextSame) {
            results.push(otherInstitution.shift()!)
            continue
        }

        results.push(nextSame.score >= nextOther.score ? sameInstitution.shift()! : otherInstitution.shift()!)
    }

    return results.slice(0, limit)
}
