export type MitApiEnv = 'DEV' | 'TEST' | 'PROD'

const VALID_ENVS = new Set<MitApiEnv>(['DEV', 'TEST', 'PROD'])

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

export function getMitApiEnv(): MitApiEnv {
  const raw = process.env.MIT_API_ENV
  if (!raw || !VALID_ENVS.has(raw as MitApiEnv)) {
    throw new Error(`MIT_API_ENV must be one of DEV, TEST, PROD (got: ${raw ?? 'undefined'})`)
  }
  return raw as MitApiEnv
}

export function getMitCoursesBaseUrl(): string {
  const env = getMitApiEnv()
  return withTrailingSlash(requireEnv(`MIT_COURSES_API_BASE_URL_${env}`))
}

export function getMitCourseCatalogBaseUrl(): string {
  const env = getMitApiEnv()
  return withTrailingSlash(requireEnv(`MIT_COURSE_CATALOG_API_BASE_URL_${env}`))
}

export function getMitBasicAuthHeader(): string {
  const clientId = requireEnv('MIT_API_CLIENT_ID')
  const secret = requireEnv(`MIT_COURSES_API_CLIENT_SECRET_${getMitApiEnv()}`)
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`
}

export async function mitApiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', getMitBasicAuthHeader())
  return fetch(url, { ...init, headers })
}
