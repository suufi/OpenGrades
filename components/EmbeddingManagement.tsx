import { Button, Card, Group, Progress, Stack, Text, Title, Grid, Badge, ActionIcon, Tooltip, Switch } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconRefresh, IconDatabase, IconFileText, IconMessageCircle, IconFiles } from '@tabler/icons'
import { useState, useEffect } from 'react'

interface EmbeddingStats {
    descriptions: { total: number; embedded: number; pending: number }
    reviews: { total: number; embedded: number; pending: number }
    content: { total: number; embedded: number; pending: number }
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

    const generateEmbeddings = async (type: 'all' | 'descriptions' | 'reviews' | 'content') => {
        setGenerating(type)
        setStartTime(Date.now())
        setProcessedCount(0)
        setTotalProcessed(0)
        
        notifications.show({
            title: 'Generating Embeddings',
            message: `Started generating ${type} embeddings. This process runs in batches...`,
            loading: true,
            autoClose: false,
            id: 'generating-embeddings'
        })

        const timerInterval = setInterval(() => {
            if (startTime && totalProcessed > 0) {
                const elapsed = (Date.now() - startTime) / 1000
                const rate = formatRate(totalProcessed, elapsed)
                const timeStr = formatTime(elapsed)
                
                notifications.update({
                    id: 'generating-embeddings',
                    title: 'Generating...',
                    message: `Processed ${totalProcessed} items in ${timeStr} (${rate})`,
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
                    body: JSON.stringify({ type, force, limit: 500 })
                })
                const data = await res.json()

                if (!data.success) throw new Error(data.message)

                if (data.processed) {
                    const batchProcessed = data.processed.total || 0
                    setProcessedCount(prev => prev + batchProcessed)
                    setTotalProcessed(prev => prev + batchProcessed)
                }

                await fetchStats()
                batchCount++

                const statsRes = await fetch('/api/embeddings/status')
                const statsData = await statsRes.json()

                if (statsData.success) {
                    const currentStats = statsData.data
                    let pendingCount = 0

                    if (type === 'all') {
                        pendingCount = currentStats.descriptions.pending + currentStats.reviews.pending + currentStats.content.pending
                    } else {
                        pendingCount = currentStats[type].pending
                    }

                    const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0
                    const rate = totalProcessed > 0 ? formatRate(totalProcessed, elapsed) : '0/min'
                    const timeStr = formatTime(elapsed)

                    notifications.update({
                        id: 'generating-embeddings',
                        title: 'Generating...',
                        message: `Batch ${batchCount}: Processed ${totalProcessed} items in ${timeStr} (${rate}). ${pendingCount} remaining...`,
                        loading: true,
                        autoClose: false
                    })

                    if (pendingCount <= 0) {
                        pending = false
                    }
                } else {
                    throw new Error('Failed to check status')
                }

                if (batchCount > 1000) {
                    throw new Error('Max batches reached')
                }
            }

            const finalElapsed = startTime ? (Date.now() - startTime) / 1000 : 0
            const finalRate = totalProcessed > 0 ? formatRate(totalProcessed, finalElapsed) : '0/min'
            const finalTimeStr = formatTime(finalElapsed)

            notifications.update({
                id: 'generating-embeddings',
                title: 'Generation Complete',
                message: `Successfully processed ${totalProcessed} ${type} embeddings in ${finalTimeStr} (${finalRate}).`,
                color: 'green',
                loading: false,
                autoClose: 10000
            })

        } catch (error) {
            console.error('Generation error:', error)
            const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0
            const timeStr = formatTime(elapsed)
            
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

    const StatCard = ({ title, icon: Icon, data, type }: { title: string, icon: any, data: any, type: string }) => {
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
                    onClick={() => generateEmbeddings(type as any)}
                    loading={generating === type || generating === 'all'}
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
                    onClick={() => generateEmbeddings('all')}
                    loading={generating === 'all'}
                    disabled={!!generating}
                >
                    Generate All Embeddings
                </Button>
            </Group>
        </Stack>
    )
}
