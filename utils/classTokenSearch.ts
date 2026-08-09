import type { Model } from 'mongoose'
import type { IClass } from '@/types'
import type { Institution } from './institutionFilters'

export function buildTokenSearchClauses(tokens: string[]) {
  return tokens.map((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return {
      $or: [
        { subjectNumber: { $regex: escaped, $options: 'i' } },
        { subjectTitle: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { instructors: { $regex: escaped, $options: 'i' } },
        { department: { $regex: escaped, $options: 'i' } },
      ],
    }
  })
}

type TokenSearchOptions = {
  institution?: Institution
  offeredOnly?: boolean
  limit?: number
}

export async function findClassIdsByTokenSearch(
  Class: Model<IClass>,
  tokens: string[],
  options: TokenSearchOptions = {}
): Promise<string[]> {
  if (tokens.length === 0) return []

  const filter: Record<string, unknown> = {
    $and: buildTokenSearchClauses(tokens),
  }

  if (options.institution) {
    filter.institution = options.institution
  }

  if (options.offeredOnly) {
    filter.offered = true
  }

  const matches = await Class.find(filter)
    .select('_id')
    .limit(options.limit ?? 1000)
    .lean()

  return matches.map((course) => String(course._id))
}
