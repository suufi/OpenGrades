export const APP_STORE_URL = 'https://apps.apple.com/app/id6761009968'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=edu.mit.OpenGrades'

export type MobilePlatform = 'ios' | 'android'

export function detectMobilePlatform(userAgent: string | undefined): MobilePlatform | null {
    const ua = userAgent ?? ''
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
    if (/Android/i.test(ua)) return 'android'
    return null
}

export function storeUrlForUserAgent(userAgent: string | undefined): string | null {
    switch (detectMobilePlatform(userAgent)) {
        case 'ios':
            return APP_STORE_URL
        case 'android':
            return PLAY_STORE_URL
        default:
            return null
    }
}
