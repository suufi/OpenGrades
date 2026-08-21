/**
 * Display helpers for registrar (Data Warehouse) fields on classes.
 * Shared by the web and mobile apps.
 */

/**
 * Render a schedule string ("Lecture,32-124/MW/0/9,...;Lab,TBA") into
 * human-readable lines per section type. Consecutive TBA meetings collapse
 * into one. Evening meetings get a PM suffix when the time does not carry one.
 */
export function formatScheduleForDisplay(schedule: string | null | undefined): Array<{
  type: string
  meetings: string[]
}> {
  if (!schedule) return []
  const out: Array<{ type: string; meetings: string[] }> = []
  for (const section of schedule.split(';')) {
    const [type, ...meetings] = section.split(',')
    if (!type || meetings.length === 0) continue
    const formatted: string[] = []
    for (const meeting of meetings) {
      if (meeting === 'TBA') {
        if (!formatted.includes('TBA')) formatted.push('TBA')
        continue
      }
      const [place, days, eveningFlag, time] = meeting.split('/')
      if (!place || !days || time === undefined) continue
      const prettyTime = time.replace(/\./g, ':')
      const pmSuffix = eveningFlag === '1' && !/pm/i.test(time) ? ' PM' : ''
      formatted.push(`${days} ${prettyTime}${pmSuffix} (${place})`)
    }
    if (formatted.length) out.push({ type, meetings: formatted })
  }
  return out
}

/** Short human label for a non-full-term TERM_DURATION; null for full-term/unknown. */
export function termDurationLabel(termDuration: string | null | undefined): string | null {
  switch (termDuration) {
    case 'First Half Term Subject': return 'First half of term'
    case 'Second Half Term Subject': return 'Second half of term'
    case 'Partial Term Subject': return 'Partial term'
    default: return null
  }
}
