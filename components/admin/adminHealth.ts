import { useQuery } from '@tanstack/react-query'

import { MIT_DEPARTMENT_OPTIONS } from '@/utils/departments'
import { compareTermsLatest } from '@/utils/formatTerm'

export const adminQueryKeys = {
    catalogCounts: ['admin', 'catalog-counts'] as const,
    twins: ['admin', 'twins'] as const,
    embeddingStatus: ['admin', 'embedding-status'] as const,
    notifications: ['admin', 'notifications'] as const,
}

export interface DepartmentCount {
    department: string
    classCount: number
    displayCount: number
}

export interface TermDeptCounts {
    term: string
    departments: DepartmentCount[]
}

export interface TwinGroup {
    term: string
    a: { _id: string; subjectNumber: string; attachments: { reviews: number; content: number; users: number } }
    b: { _id: string; subjectNumber: string; attachments: { reviews: number; content: number; users: number } }
    safeToHide: string | null
}

export interface TwinData {
    groups: TwinGroup[]
    total: number
    autoResolvable: number
}

export interface EmbeddingStatusData {
    descriptions: { total: number; embedded: number; pending: number }
    reviews: { total: number; embedded: number; pending: number }
    content: { total: number; embedded: number; pending: number }
    overall?: { total: number; embedded: number; pending: number }
    skipped: number
}

export interface ScheduledNotificationSummary {
    _id: string
    title: string
    status: 'pending' | 'sent' | 'failed' | 'cancelled'
    scheduledAt: string | null
    sentAt: string | null
}

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url)
    const body = await res.json()
    if (!res.ok || body.success === false) {
        throw new Error(body.message || `Request to ${url} failed`)
    }
    return body.data as T
}

export function useCatalogCounts() {
    return useQuery({
        queryKey: adminQueryKeys.catalogCounts,
        queryFn: () => getJson<TermDeptCounts[]>('/api/classes/count'),
    })
}

export function useTwinScan() {
    return useQuery({
        queryKey: adminQueryKeys.twins,
        queryFn: () => getJson<TwinData>('/api/classes/twins'),
        staleTime: 5 * 60_000,
    })
}

export function useEmbeddingStatus() {
    return useQuery({
        queryKey: adminQueryKeys.embeddingStatus,
        queryFn: () => getJson<EmbeddingStatusData>('/api/embeddings/status'),
    })
}

export function useNotificationLog() {
    return useQuery({
        queryKey: adminQueryKeys.notifications,
        queryFn: () => getJson<ScheduledNotificationSummary[]>('/api/notifications?limit=50'),
    })
}

export type HealthStatus = 'ok' | 'attention' | 'loading' | 'error'

export interface AreaHealth {
    status: HealthStatus
    metric: string
    headline: string
    detail: string
}

export interface AdminHealth {
    catalog: AreaHealth & { latestTerm: string | null }
    duplicates: AreaHealth
    embeddings: AreaHealth
    notifications: AreaHealth
}

function pendingFrom(stats: EmbeddingStatusData): number {
    if (stats.overall) return stats.overall.pending
    return stats.descriptions.pending + stats.reviews.pending + stats.content.pending
}

export function useAdminHealth(): AdminHealth {
    const counts = useCatalogCounts()
    const twins = useTwinScan()
    const embeddings = useEmbeddingStatus()
    const notifications = useNotificationLog()

    let catalog: AdminHealth['catalog']
    if (counts.isPending) {
        catalog = { status: 'loading', metric: '—', headline: 'Checking coverage…', detail: '', latestTerm: null }
    } else if (counts.isError || !counts.data?.length) {
        catalog = {
            status: 'error',
            metric: '—',
            headline: counts.isError ? 'Coverage check failed' : 'No classes in the catalog',
            detail: counts.isError ? 'Retry from the Classes tab.' : 'Sync a term from the Classes tab.',
            latestTerm: null,
        }
    } else {
        const latest = [...counts.data].sort((a, b) => compareTermsLatest(a.term, b.term))[0]
        const synced = new Set(latest.departments.filter((d) => d.classCount > 0).map((d) => d.department))
        const unsynced = MIT_DEPARTMENT_OPTIONS.filter((d) => !synced.has(d.value)).length
        const total = latest.departments.reduce((sum, d) => sum + d.classCount, 0)
        catalog = {
            status: unsynced > 0 ? 'attention' : 'ok',
            metric: String(unsynced),
            headline: `department${unsynced === 1 ? '' : 's'} not synced for ${latest.term}`,
            detail: unsynced > 0
                ? `${total.toLocaleString()} classes synced so far. Sync the rest from the Classes tab.`
                : `${total.toLocaleString()} classes in the latest term.`,
            latestTerm: latest.term,
        }
    }

    let duplicates: AreaHealth
    if (twins.isPending) {
        duplicates = { status: 'loading', metric: '—', headline: 'Scanning for duplicates…', detail: '' }
    } else if (twins.isError) {
        duplicates = { status: 'error', metric: '—', headline: 'Duplicate scan failed', detail: 'Retry from the Catalog health tab.' }
    } else {
        const { total, autoResolvable } = twins.data
        duplicates = {
            status: total > 0 ? 'attention' : 'ok',
            metric: String(total),
            headline: `duplicate pair${total === 1 ? '' : 's'} in the catalog`,
            detail: total === 0
                ? 'Every subject has one doc per term.'
                : autoResolvable > 0
                    ? `${autoResolvable} can be hidden automatically.`
                    : 'All pairs need manual review.',
        }
    }

    let embeddingsHealth: AreaHealth
    if (embeddings.isPending) {
        embeddingsHealth = { status: 'loading', metric: '—', headline: 'Checking embeddings…', detail: '' }
    } else if (embeddings.isError) {
        embeddingsHealth = { status: 'error', metric: '—', headline: 'Embedding check failed', detail: 'Retry from the AI embeddings tab.' }
    } else {
        const pending = pendingFrom(embeddings.data)
        embeddingsHealth = {
            status: pending > 0 ? 'attention' : 'ok',
            metric: pending.toLocaleString(),
            headline: `item${pending === 1 ? '' : 's'} awaiting embedding`,
            detail: pending > 0
                ? 'AI search misses items until they are embedded.'
                : 'AI search covers the full catalog.',
        }
    }

    let notificationsHealth: AreaHealth
    if (notifications.isPending) {
        notificationsHealth = { status: 'loading', metric: '—', headline: 'Checking notifications…', detail: '' }
    } else if (notifications.isError) {
        notificationsHealth = { status: 'error', metric: '—', headline: 'Notification check failed', detail: 'Retry from the Notifications tab.' }
    } else {
        const failed = notifications.data.filter((n) => n.status === 'failed').length
        const pending = notifications.data.filter((n) => n.status === 'pending').length
        notificationsHealth = {
            status: failed > 0 ? 'attention' : 'ok',
            metric: failed > 0 ? String(failed) : String(pending),
            headline: failed > 0
                ? `failed send${failed === 1 ? '' : 's'} in the recent log`
                : `notification${pending === 1 ? '' : 's'} scheduled`,
            detail: failed > 0 ? 'Review and resend from the Notifications tab.' : 'Recent sends all delivered.',
        }
    }

    return { catalog, duplicates, embeddings: embeddingsHealth, notifications: notificationsHealth }
}
