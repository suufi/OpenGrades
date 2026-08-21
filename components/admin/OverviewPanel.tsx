import { Badge, Button, Card, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core'
import { DonutChart } from '@mantine/charts'
import { IconBell, IconBooks, IconCopy, IconSparkles, TablerIcon } from '@tabler/icons-react'

import { AdminHealth, AreaHealth, HealthStatus } from './adminHealth'

export type AdminAreaTab = 'classes' | 'catalog-health' | 'embeddings' | 'notifications'

const STATUS_COLOR: Record<HealthStatus, string> = {
    ok: 'teal',
    attention: 'yellow',
    error: 'red',
    loading: 'gray',
}

function StatusCard({
    label,
    icon: Icon,
    health,
    actionLabel,
    onAction,
}: {
    label: string
    icon: TablerIcon
    health: AreaHealth
    actionLabel: string
    onAction: () => void
}) {
    const color = STATUS_COLOR[health.status]

    return (
        <Paper
            p="md"
            radius="md"
            withBorder
            style={{ borderLeft: `3px solid var(--mantine-color-${color}-6)`, display: 'flex' }}
        >
            <Stack gap="xs" justify="space-between" style={{ flex: 1 }}>
                <Stack gap="xs">
                    <Group gap="xs" justify="space-between">
                        <Group gap={6}>
                            <Icon size={16} color={`var(--mantine-color-${color}-6)`} />
                            <Text size="xs" tt="uppercase" fw={600} c="dimmed" lts={0.5}>{label}</Text>
                        </Group>
                        {health.status === 'attention' && <Badge size="xs" color="yellow" variant="light">Needs attention</Badge>}
                        {health.status === 'error' && <Badge size="xs" color="red" variant="light">Check failed</Badge>}
                    </Group>
                    {health.status === 'loading' ? (
                        <>
                            <Skeleton height={30} width={90} />
                            <Skeleton height={12} width="80%" />
                        </>
                    ) : (
                        <>
                            <Group gap={8} align="baseline" wrap="nowrap">
                                <Text ff="monospace" fw={700} fz={28} lh={1} c={health.status === 'attention' ? 'yellow.8' : undefined}>
                                    {health.metric}
                                </Text>
                                <Text size="sm" fw={500} lh={1.3}>{health.headline}</Text>
                            </Group>
                            {health.detail && <Text size="xs" c="dimmed">{health.detail}</Text>}
                        </>
                    )}
                </Stack>
                <Button variant="light" size="xs" onClick={onAction} style={{ alignSelf: 'flex-start' }}>
                    {actionLabel}
                </Button>
            </Stack>
        </Paper>
    )
}

const DONUT_COLORS = ['indigo.6', 'yellow.6', 'cyan.6', 'violet.6', 'blue.6', 'orange.6', 'teal.6', 'red.6', 'green.6', 'gray.6']

function toDonutData(summary: { _id: string | number | null; count: number }[]) {
    return [...summary]
        .sort((a, b) => String(a._id ?? '').localeCompare(String(b._id ?? ''), undefined, { numeric: true }))
        .map(({ _id, count }, index) => ({
            name: _id === null || _id === undefined || _id === '' ? 'Unknown' : String(_id),
            value: count,
            color: DONUT_COLORS[index % DONUT_COLORS.length],
        }))
}

export function OverviewPanel({
    health,
    totalUsers,
    activeUsers,
    summaryByClassYear,
    summaryByLevel,
    onNavigate,
}: {
    health: AdminHealth
    totalUsers: number
    activeUsers: number
    summaryByClassYear: { _id: number | null; count: number }[]
    summaryByLevel: { _id: string | null; count: number }[]
    onNavigate: (tab: AdminAreaTab) => void
}) {
    const activePct = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0

    return (
        <Stack gap="xl">
            <Stack gap="sm">
                <Title order={4}>Status</Title>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                    <StatusCard
                        label="Catalog"
                        icon={IconBooks}
                        health={health.catalog}
                        actionLabel="Open classes"
                        onAction={() => onNavigate('classes')}
                    />
                    <StatusCard
                        label="Duplicates"
                        icon={IconCopy}
                        health={health.duplicates}
                        actionLabel="Review duplicates"
                        onAction={() => onNavigate('catalog-health')}
                    />
                    <StatusCard
                        label="AI embeddings"
                        icon={IconSparkles}
                        health={health.embeddings}
                        actionLabel="Manage embeddings"
                        onAction={() => onNavigate('embeddings')}
                    />
                    <StatusCard
                        label="Notifications"
                        icon={IconBell}
                        health={health.notifications}
                        actionLabel="Open notifications"
                        onAction={() => onNavigate('notifications')}
                    />
                </SimpleGrid>
            </Stack>

            <Stack gap="sm">
                <Title order={4}>Community</Title>
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                    <Card>
                        <Stack gap={4} justify="center" style={{ height: '100%' }}>
                            <Text size="xs" tt="uppercase" fw={600} c="dimmed" lts={0.5}>Registered users</Text>
                            <Text ff="monospace" fw={700} fz={36} lh={1}>{totalUsers.toLocaleString()}</Text>
                            <Text size="sm" c="dimmed">
                                {activeUsers.toLocaleString()} active ({activePct}%)
                            </Text>
                        </Stack>
                    </Card>
                    <Card>
                        <Stack gap="xs" align="center">
                            <Text size="xs" tt="uppercase" fw={600} c="dimmed" lts={0.5}>Verified users by level</Text>
                            <DonutChart
                                size={140}
                                thickness={18}
                                withLabels
                                withLabelsLine
                                labelsType="value"
                                data={toDonutData(summaryByLevel)}
                            />
                        </Stack>
                    </Card>
                    <Card>
                        <Stack gap="xs" align="center">
                            <Text size="xs" tt="uppercase" fw={600} c="dimmed" lts={0.5}>Verified users by class year</Text>
                            <DonutChart
                                size={140}
                                thickness={18}
                                withLabels
                                withLabelsLine
                                labelsType="value"
                                data={toDonutData(summaryByClassYear)}
                            />
                        </Stack>
                    </Card>
                </SimpleGrid>
            </Stack>
        </Stack>
    )
}
