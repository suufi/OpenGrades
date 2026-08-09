import { Button, Card, Group, Progress, Stack, Text, Title, Grid, Badge, ActionIcon, Tooltip, Switch } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconRefresh, IconDatabase, IconFileText, IconMessageCircle, IconFiles } from '@tabler/icons-react'
import { useState, useEffect } from 'react'

interface EmbeddingStats {
    descriptions: { total: number; embedded: number; pending: number }
    reviews: { total: number; embedded: number; pending: number }
    content: { total: number; embedded: number; pending: number }
    public?: {
        descriptions: { total: number; embedded: number; pending: number; missing?: number; stale?: number }
        model: string
        dimensions: number
        provider: string
        index: string
    }
    private?: {
        reviews: { total: number; embedded: number; pending: number }
        content: { total: number; embedded: number; pending: number }
        model: string
        dimensions: number
        provider: string
        index: string
    }
    overall?: { total: number; embedded: number; pending: number }
    skipped: number
}

export function EmbeddingManagement() {
    const [stats, setStats] = useState<EmbeddingStats | null>(null)
    const [loading, setLoading] = useState(false)
    const [generating, setGenerating] = useState<string | null>(null)
    const [force, setForce] = useState(false)
    const [startTime, setStartTime] = useState<number | null>(null)
    const [processedCount, setProcessedCount] = useState(0)
    const [totalProcessed, setTotalProcessed] = useState(0)

    const fetchStats = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/embeddings/status')
            const data = await res.json()
            if (data.success) {
                setStats(data.data)
            }
        } catch (error) {
            console.error('Failed to fetch embedding stats:', error)
            notifications.show({
                title: 'Error',
                message: 'Failed to fetch embedding statistics',
                color: 'red'
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStats()
        const interval = setInterval(() => {
            if (generating) fetchStats()
        }, 5000)
        return () => clearInterval(interval)
    }, [generating])

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        if (mins > 0) {
            return `${mins}m ${secs}s`
        }
        return `${secs}s`
    }

    const formatRate = (count: number, seconds: number): string => {
        if (seconds === 0) return '0/min'
        const perMin = Math.round((count / seconds) * 60)
        return `${perMin}/min`
    }

    const generateEmbeddings = async (
        scope: 'all' | 'public' | 'private',
        type: 'all' | 'descriptions' | 'reviews' | 'content'
    ) => {
        const jobKey = `${scope}:${type}`
        setGenerating(jobKey)
        const jobStartTime = Date.now()
        setStartTime(jobStartTime)
        setProcessedCount(0)
        setTotalProcessed(0)
        let cumulativeProcessed = 0
        let previousPendingCount: number | null = null
        let consecutiveZeroBatches = 0
        
        notifications.show({
            title: 'Generating Embeddings',
            message: `Started generating ${scope} / ${type} embeddings. This process runs in batches...`,
            loading: true,
            autoClose: false,
            id: 'generating-embeddings'
        })

        const timerInterval = setInterval(() => {
            if (cumulativeProcessed > 0) {
                const elapsed = (Date.now() - jobStartTime) / 1000
                const rate = formatRate(cumulativeProcessed, elapsed)
                const timeStr = formatTime(elapsed)
                
                notifications.update({
                    id: 'generating-embeddings',
                    title: 'Generating...',
                    message: `Processed ${cumulativeProcessed} items in ${timeStr} (${rate})`,
                    loading: true,
                    autoClose: false
                })
            }
        }, 1000)

        try {
            let pending = true
            let batchCount = 0

            while (pending) {
                const res = await fetch('/api/embeddings/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scope, type, force, limit: 500 })
                })
                const data = await res.json()

                if (!data.success) throw new Error(data.message)

                const batchProcessed = data.processed?.total || 0
                cumulativeProcessed += batchProcessed
                setProcessedCount(cumulativeProcessed)
                setTotalProcessed(cumulativeProcessed)

                if (batchProcessed === 0) {
                    consecutiveZeroBatches += 1
                } else {
                    consecutiveZeroBatches = 0
                }

                await fetchStats()
                batchCount++

                const statsRes = await fetch('/api/embeddings/status')
                const statsData = await statsRes.json()

                if (statsData.success) {
                    const currentStats = statsData.data
                    let pendingCount = 0

                    if (type === 'all') {
                        pendingCount = currentStats.overall?.pending || (
                            currentStats.descriptions.pending + currentStats.reviews.pending + currentStats.content.pending
                        )
                    } else if (scope === 'public') {
                        pendingCount = currentStats.public?.descriptions?.pending ?? currentStats.descriptions.pending
                    } else if (scope === 'private') {
                        pendingCount = type === 'reviews'
                            ? (currentStats.private?.reviews?.pending ?? currentStats.reviews.pending)
                            : (currentStats.private?.content?.pending ?? currentStats.content.pending)
                    } else {
                        pendingCount = currentStats[type].pending
                    }

                    const elapsed = (Date.now() - jobStartTime) / 1000
                    const rate = cumulativeProcessed > 0 ? formatRate(cumulativeProcessed, elapsed) : '0/min'
                    const timeStr = formatTime(elapsed)
                    const batchDetail = batchProcessed > 0
                        ? `+${batchProcessed} this batch`
                            : data.stats?.errors
                                ? '0 this batch (embedding errors)'
                                : (data.stats?.public?.candidates || data.stats?.private?.reviewCandidates || data.stats?.private?.contentCandidates)
                                    ? '0 this batch (candidates failed or skipped)'
                                    : '0 this batch (nothing matched)'

                    notifications.update({
                        id: 'generating-embeddings',
                        title: 'Generating...',
                        message: `Batch ${batchCount}: ${cumulativeProcessed} total (${batchDetail}) in ${timeStr} (${rate}). ${pendingCount} remaining...`,
                        loading: true,
                        autoClose: false
                    })

                    if (pendingCount <= 0) {
                        pending = false
                    } else if (
                        batchProcessed === 0 &&
                        previousPendingCount !== null &&
                        pendingCount >= previousPendingCount
                    ) {
                        if (consecutiveZeroBatches >= 3) {
                            const errorHint = data.stats?.errors
                                ? `${data.stats.errors} embedding error(s) in the last batch.`
                                : 'No embeddable items matched the current filters (try Force Regenerate).'
                            throw new Error(`Stalled after ${batchCount} batches with ${pendingCount} still pending. ${errorHint}`)
                        }
                    }
                    previousPendingCount = pendingCount
                } else {
                    throw new Error('Failed to check status')
                }

                if (batchCount > 1000) {
                    throw new Error('Max batches reached')
                }
            }

            const finalElapsed = (Date.now() - jobStartTime) / 1000
            const finalRate = cumulativeProcessed > 0 ? formatRate(cumulativeProcessed, finalElapsed) : '0/min'
            const finalTimeStr = formatTime(finalElapsed)

            notifications.update({
                id: 'generating-embeddings',
                title: 'Generation Complete',
                message: `Successfully processed ${cumulativeProcessed} ${type} embeddings in ${finalTimeStr} (${finalRate}).`,
                color: 'green',
                loading: false,
                autoClose: 10000
            })

        } catch (error) {
            console.error('Generation error:', error)
            notifications.update({
                id: 'generating-embeddings',
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to generate embeddings',
                color: 'red',
                loading: false,
                autoClose: 5000
            })
        } finally {
            clearInterval(timerInterval)
            setGenerating(null)
            setStartTime(null)
            setProcessedCount(0)
            setTotalProcessed(0)
        }
    }

    const StatCard = ({ title, icon: Icon, data, type }: { title: string, icon: any, data: any, type: 'descriptions' | 'reviews' | 'content' }) => {
        if (!data) return null
        const progress = data.total > 0 ? (data.embedded / data.total) * 100 : 0

        return (
            <Card withBorder padding="lg" radius="md">
                <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                        <Icon size={20} />
                        <Text fw={500}>{title}</Text>
                    </Group>
                    <Badge color={progress === 100 ? 'green' : 'blue'}>
                        {Math.round(progress)}%
                    </Badge>
                </Group>

                <Text size="xs" c="dimmed" mb="xs">
                    {data.embedded} / {data.total} embedded ({data.pending} pending)
                </Text>

                <Progress value={progress} mb="md" size="sm" color={progress === 100 ? 'green' : 'blue'} animated={generating === type || generating === 'all'} />

                    <Button
                        variant="light"
                        fullWidth
                        size="xs"
                        onClick={() => generateEmbeddings(type === 'descriptions' ? 'public' : 'private', type as any)}
                        loading={generating === `${type === 'descriptions' ? 'public' : 'private'}:${type}` || generating === 'all:all'}
                        disabled={!!generating}
                    >
                        Generate {title}
                </Button>
            </Card>
        )
    }

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Title order={3}>AI Embeddings</Title>
                <Group>
                    {stats && stats.skipped > 0 && (
                        <Badge color="gray" variant="light">
                            {stats.skipped} Skipped (Up to date)
                        </Badge>
                    )}
                    <Button
                        leftSection={<IconRefresh size={16} />}
                        variant="subtle"
                        onClick={fetchStats}
                        loading={loading}
                    >
                        Refresh Stats
                    </Button>
                </Group>
            </Group>

            {stats && (
                <Grid>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <StatCard
                            title="Descriptions"
                            icon={IconFileText}
                            data={stats.descriptions}
                            type="descriptions"
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <StatCard
                            title="Reviews"
                            icon={IconMessageCircle}
                            data={stats.reviews}
                            type="reviews"
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <StatCard
                            title="Content (PDFs)"
                            icon={IconFiles}
                            data={stats.content}
                            type="content"
                        />
                    </Grid.Col>
                </Grid>
            )}

            {stats?.public && (
                <Card withBorder padding="md" radius="md">
                    <Group justify="space-between">
                        <Text fw={600}>Public Embeddings</Text>
                        <Badge color="blue" variant="light">{stats.public.provider}</Badge>
                    </Group>
                    <Text size="sm" c="dimmed">Model: {stats.public.model} ({stats.public.dimensions} dims)</Text>
                    <Text size="sm" c="dimmed">Index: {stats.public.index}</Text>
                    <Text size="sm" c="dimmed">
                        Pending: {stats.public.descriptions.pending}
                        {typeof stats.public.descriptions.missing === 'number' ? ` | Missing: ${stats.public.descriptions.missing}` : ''}
                        {typeof stats.public.descriptions.stale === 'number' ? ` | Stale: ${stats.public.descriptions.stale}` : ''}
                    </Text>
                </Card>
            )}

            {stats?.private && (
                <Card withBorder padding="md" radius="md">
                    <Group justify="space-between">
                        <Text fw={600}>Private Embeddings</Text>
                        <Badge color="grape" variant="light">{stats.private.provider}</Badge>
                    </Group>
                    <Text size="sm" c="dimmed">Model: {stats.private.model} ({stats.private.dimensions} dims)</Text>
                    <Text size="sm" c="dimmed">Index: {stats.private.index}</Text>
                    <Text size="sm" c="dimmed">
                        Pending reviews: {stats.private.reviews.pending} | Pending content: {stats.private.content.pending}
                    </Text>
                </Card>
            )}

            <Group justify="space-between" align="center">
                <Switch
                    label="Force Regenerate (Overwrite existing)"
                    checked={force}
                    onChange={(event) => setForce(event.currentTarget.checked)}
                    color="red"
                />
                <Button
                    color="violet"
                    leftSection={<IconDatabase size={16} />}
                    onClick={() => generateEmbeddings('all', 'all')}
                    loading={generating === 'all:all'}
                    disabled={!!generating}
                >
                    Generate All Embeddings
                </Button>
            </Group>
        </Stack>
    )
}
