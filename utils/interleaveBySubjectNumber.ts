/**
 * Round-robin offerings by subjectNumber.
 * Input should already be sorted by the caller's preferred key (e.g. userCount desc).
 * Groups are created in first-seen order; within each group, order is preserved.
 */
export function interleaveBySubjectNumber<T extends { subjectNumber: string }>(
  items: T[]
): T[] {
  if (items.length <= 1) return items.slice()

  const groups = new Map<string, T[]>()
  const groupOrder: string[] = []

  for (const item of items) {
    const key = item.subjectNumber
    if (!groups.has(key)) {
      groups.set(key, [])
      groupOrder.push(key)
    }
    groups.get(key)!.push(item)
  }

  const queues = groupOrder.map((key) => groups.get(key)!)
  const result: T[] = []

  let remaining = items.length
  while (remaining > 0) {
    for (const queue of queues) {
      if (queue.length === 0) continue
      result.push(queue.shift()!)
      remaining -= 1
    }
  }

  return result
}
