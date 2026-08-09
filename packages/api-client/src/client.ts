export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientConfig {
  baseUrl: string
  getHeaders?: () => Promise<HeadersInit> | HeadersInit
  credentials?: RequestCredentials
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  meta?: Record<string, unknown>
}

export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, getHeaders, credentials = 'include' } = config

  async function resolveHeaders(init?: RequestInit): Promise<HeadersInit> {
    const base = (await getHeaders?.()) ?? {}
    return { ...base, ...init?.headers }
  }

  async function requestJson<T>(
    path: string,
    init?: RequestInit
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      credentials,
      ...init,
      headers: await resolveHeaders(init),
    })

    const body = (await response.json().catch(() => null)) as ApiResponse<T> | null

    if (!response.ok) {
      throw new ApiError(
        response.status,
        (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string')
          ? body.message
          : 'Request failed',
        body
      )
    }

    return body ?? { success: true }
  }

  return { requestJson }
}

export type ApiClient = ReturnType<typeof createApiClient>
