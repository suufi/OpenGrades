import type { ParsedUrlQuery } from 'querystring'

export const APP_STORE_URL = 'https://apps.apple.com/app/id6761009968'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=edu.mit.OpenGrades'

export type MobilePlatform = 'ios' | 'android'

export function detectMobilePlatform(userAgent: string | undefined): MobilePlatform | null {
    const ua = userAgent ?? ''
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
    if (/Android/i.test(ua)) return 'android'
    return null
}

export function storeUrl(platform: MobilePlatform, query: ParsedUrlQuery = {}, providerToken?: string): string {
    const utm = Object.entries(query).filter(
        (entry): entry is [string, string] => entry[0].startsWith('utm_') && typeof entry[1] === 'string' && entry[1] !== ''
    )
    if (platform === 'android') {
        if (utm.length === 0) return PLAY_STORE_URL
        return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(new URLSearchParams(utm).toString())}`
    }
    const source = utm.find(([key]) => key === 'utm_source')?.[1]
    if (!source) return APP_STORE_URL
    const params = new URLSearchParams({ ct: source, mt: '8' })
    if (providerToken) params.set('pt', providerToken)
    return `${APP_STORE_URL}?${params.toString()}`
}

export function storeUrlForUserAgent(userAgent: string | undefined, query: ParsedUrlQuery = {}, providerToken?: string): string | null {
    const platform = detectMobilePlatform(userAgent)
    return platform ? storeUrl(platform, query, providerToken) : null
}
