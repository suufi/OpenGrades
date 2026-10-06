// Routes that signed-out visitors can open. Pages listed here must strip
// review, grade and upload data from their props when there is no session.
const PUBLIC_PATHS = new Set(['/', '/app', '/classes', '/classes/[id]', '/404'])
const PUBLIC_PREFIXES = ['/about', '/privacy']

export function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
