/**
 * Display name for karma leaderboard: kerb if user opted in, else "Student (classOf)".
 */
export function getKarmaDisplayName(user: {
  karmaDisplayKerb?: boolean | null
  kerb?: string | null
  classOf?: number | null
}): string {
  if (user?.karmaDisplayKerb && user?.kerb) {
    return user.kerb
  }
  const year = user?.classOf ?? '?'
  return `Student (${year})`
}
