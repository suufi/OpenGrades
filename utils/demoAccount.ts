/**
 * Mobile review demo accounts, configured as a comma-separated list of
 * emails in DEMO_ACCOUNT_EMAILS.
 */
export function getDemoAccountEmails(
    env: string | undefined = process.env.DEMO_ACCOUNT_EMAILS
): string[] {
    if (!env) return []
    return env
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
}

export function isDemoAccountEmail(
    email: string | null | undefined,
    env: string | undefined = process.env.DEMO_ACCOUNT_EMAILS
): boolean {
    if (!email) return false
    return getDemoAccountEmails(env).includes(email.trim().toLowerCase())
}
