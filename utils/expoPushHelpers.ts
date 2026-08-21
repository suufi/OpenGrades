export interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export function backoffMs(attempt: number): number {
  return 1000 * 2 ** (attempt - 1)
}

export function expoRequestHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  return headers
}

export function partitionTickets(tokens: string[], tickets: ExpoPushTicket[]): {
  sent: number
  okTickets: { ticketId: string; token: string }[]
  invalidTokens: string[]
} {
  let sent = 0
  const okTickets: { ticketId: string; token: string }[] = []
  const invalidTokens: string[] = []

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]
    const token = tokens[i]
    if (ticket.status === 'ok') {
      sent++
      if (ticket.id && token) {
        okTickets.push({ ticketId: ticket.id, token })
      }
    } else if (ticket.details?.error === 'DeviceNotRegistered' && token) {
      invalidTokens.push(token)
    }
  }

  return { sent, okTickets, invalidTokens }
}

export function partitionReceipts(
  pending: { ticketId: string; token: string; attempts: number }[],
  receipts: Record<string, ExpoPushReceipt>,
  maxAttempts: number
): {
  resolvedTicketIds: string[]
  tokensToRemove: string[]
  retryTicketIds: string[]
  expiredTicketIds: string[]
} {
  const resolvedTicketIds: string[] = []
  const tokensToRemove: string[] = []
  const retryTicketIds: string[] = []
  const expiredTicketIds: string[] = []

  for (const entry of pending) {
    const receipt = receipts[entry.ticketId]
    if (receipt) {
      resolvedTicketIds.push(entry.ticketId)
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        tokensToRemove.push(entry.token)
      }
    } else if (entry.attempts + 1 >= maxAttempts) {
      expiredTicketIds.push(entry.ticketId)
    } else {
      retryTicketIds.push(entry.ticketId)
    }
  }

  return { resolvedTicketIds, tokensToRemove, retryTicketIds, expiredTicketIds }
}
