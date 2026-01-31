import type { NextApiRequest, NextApiResponse } from 'next'

export interface ApiLogUser {
  email?: string | null
  kerb?: string
  id?: string
  _id?: string
}

export interface ApiLoggerMeta {
  user?: ApiLogUser | null
}

const LOG_LEVEL = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

function safeUser(user: ApiLogUser | null | undefined): Record<string, string> | null {
  if (!user) return null
  const out: Record<string, string> = {}
  if (user.email) out.email = user.email
  if (user.kerb) out.kerb = user.kerb
  if (user.id) out.id = user.id
  if (user._id) out._id = String(user._id)
  return Object.keys(out).length ? out : null
}

function basePayload(req: NextApiRequest, meta?: ApiLoggerMeta) {
  const path = (req.url ?? '').split('?')[0] || req.url
  return {
    ts: new Date().toISOString(),
    type: 'api',
    method: req.method,
    path: path || req.url,
    query: req.query && Object.keys(req.query).length ? req.query : undefined,
    user: meta?.user ? safeUser(meta.user as ApiLogUser) : undefined
  }
}

export function logRequest(req: NextApiRequest, meta?: ApiLoggerMeta): void {
  const payload = { ...basePayload(req, meta), event: 'request' }
  const line = JSON.stringify(payload)
  if (LOG_LEVEL === 'debug') {
    console.log('[api]', line)
  } else {
    console.log(line)
  }
}

export function logResponse(
  req: NextApiRequest,
  statusCode: number,
  meta?: ApiLoggerMeta
): void {
  const payload = {
    ...basePayload(req, meta),
    event: 'response',
    status: statusCode
  }
  const line = JSON.stringify(payload)
  if (LOG_LEVEL === 'debug') {
    console.log('[api]', line)
  } else {
    console.log(line)
  }
}

export function logApiError(
  req: NextApiRequest,
  error: unknown,
  meta?: ApiLoggerMeta & { statusCode?: number }
): void {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  const payload = {
    ...basePayload(req, meta),
    event: 'error',
    status: meta?.statusCode,
    errorMessage: message,
    errorStack: stack,
    user: meta?.user ? safeUser(meta.user as ApiLogUser) : undefined
  }
  const line = JSON.stringify(payload)
  console.error('[api]', line)
  if (stack && LOG_LEVEL === 'debug') {
    console.error(stack)
  }
}

function wrapResForLogging(
  req: NextApiRequest,
  res: NextApiResponse,
  meta: ApiLoggerMeta
): NextApiResponse {
  let logged = false
  const originalStatus = res.status.bind(res)
  const originalJson = res.json.bind(res)
  const originalEnd = res.end.bind(res)

  const logOnce = (statusCode: number) => {
    if (logged) return
    logged = true
    logResponse(req, statusCode, meta)
  }

  res.status = function (code: number) {
    (res as any).statusCode = code
    return originalStatus(code)
  }

  res.json = function (body: any) {
    const code = (res as any).statusCode ?? 200
    logOnce(code)
    return originalJson(body)
  }

  res.end = function (chunk?: any, encoding?: any, callback?: any) {
    const code = (res as any).statusCode ?? 200
    logOnce(code)
    if (typeof chunk === 'function') return originalEnd(chunk)
    if (typeof encoding === 'function') return originalEnd(chunk, encoding)
    return originalEnd(chunk, encoding, callback)
  }

  return res
}

export type ApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => void | Promise<void>


export function withApiLogger(handler: ApiHandler): ApiHandler {
  return async function loggedHandler(
    req: NextApiRequest,
    res: NextApiResponse
  ): Promise<void> {
    let session: { user?: ApiLogUser } | null = null
    try {
      const { auth } = await import('@/utils/auth')
      session = await auth(req, res)
    } catch (_) {

    }

    const meta: ApiLoggerMeta = {
      user: session?.user ? (session.user as ApiLogUser) : undefined
    }

    logRequest(req, meta)
    wrapResForLogging(req, res, meta)

    try {
      await handler(req, res)
    } catch (error) {
      const statusCode = (res as any).statusCode
      logApiError(req, error, { ...meta, statusCode })
      if (!res.writableEnded) {
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Internal server error'
        })
      }
    }
  }
}
