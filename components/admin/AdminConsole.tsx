import { useCallback } from 'react'

import { useRouter } from 'next/router'

import { Badge, Box, Container, Group, Stack, Tabs, Text, Title } from '@mantine/core'
import { IconBell, IconBook2, IconHeartRateMonitor, IconLayoutDashboard, IconSparkles } from '@tabler/icons-react'

import { EmbeddingManagement } from '@/components/EmbeddingManagement'
import { NotificationManagement } from '@/components/NotificationManagement'

import { HealthStatus, useAdminHealth } from './adminHealth'
import { CatalogHealthPanel } from './CatalogHealthPanel'
import { ClassesPanel } from './ClassesPanel'
import { OverviewPanel, AdminAreaTab } from './OverviewPanel'

const TABS = ['overview', 'classes', 'catalog-health', 'embeddings', 'notifications'] as const
type TabValue = typeof TABS[number]

export interface UserAggregates {
    totalUsers: number
    activeUsers: number
    summaryByClassYear: { _id: number | null; count: number }[]
    summaryByLevel: { _id: string | null; count: number }[]
}

function AttentionDot({ status }: { status: HealthStatus }) {
    if (status !== 'attention' && status !== 'error') return null
    const color = status === 'error' ? 'red' : 'yellow'
    return (
        <Box
            w={8}
            h={8}
            style={{ borderRadius: '50%', backgroundColor: `var(--mantine-color-${color}-6)` }}
        />
    )
}

export function AdminConsole({ totalUsers, activeUsers, summaryByClassYear, summaryByLevel }: UserAggregates) {
    const router = useRouter()
    const health = useAdminHealth()

    const queryTab = typeof router.query.tab === 'string' ? router.query.tab : 'overview'
    const activeTab: TabValue = (TABS as readonly string[]).includes(queryTab) ? queryTab as TabValue : 'overview'

    const setTab = useCallback((tab: string | null) => {
        const next = tab && (TABS as readonly string[]).includes(tab) ? tab : 'overview'
        const query = { ...router.query, tab: next }
        if (next === 'overview') delete (query as Record<string, unknown>).tab
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true })
    }, [router])

    const areas = [health.catalog, health.duplicates, health.embeddings, health.notifications]
    const attentionCount = areas.filter((area) => area.status === 'attention' || area.status === 'error').length
    const stillChecking = areas.some((area) => area.status === 'loading')

    return (
        <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
            <Stack gap="lg">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Stack gap={4}>
                        <Title>Settings</Title>
                        <Text size="sm" c="dimmed">
                            Admin console for the catalog, AI features, and platform communications.
                        </Text>
                    </Stack>
                    {!stillChecking && (
                        attentionCount > 0
                            ? <Badge size="lg" color="yellow" variant="light">{attentionCount} area{attentionCount === 1 ? '' : 's'} need{attentionCount === 1 ? 's' : ''} attention</Badge>
                            : <Badge size="lg" color="teal" variant="light">All clear</Badge>
                    )}
                </Group>

                <Tabs value={activeTab} onChange={setTab} keepMounted={false}>
                    <Tabs.List mb="lg">
                        <Tabs.Tab value="overview" leftSection={<IconLayoutDashboard size={16} />}>
                            Overview
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="classes"
                            leftSection={<IconBook2 size={16} />}
                            rightSection={<AttentionDot status={health.catalog.status} />}
                        >
                            Classes
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="catalog-health"
                            leftSection={<IconHeartRateMonitor size={16} />}
                            rightSection={<AttentionDot status={health.duplicates.status} />}
                        >
                            Catalog health
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="embeddings"
                            leftSection={<IconSparkles size={16} />}
                            rightSection={<AttentionDot status={health.embeddings.status} />}
                        >
                            AI embeddings
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="notifications"
                            leftSection={<IconBell size={16} />}
                            rightSection={<AttentionDot status={health.notifications.status} />}
                        >
                            Notifications
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="overview">
                        <OverviewPanel
                            health={health}
                            totalUsers={totalUsers}
                            activeUsers={activeUsers}
                            summaryByClassYear={summaryByClassYear}
                            summaryByLevel={summaryByLevel}
                            onNavigate={(tab: AdminAreaTab) => setTab(tab)}
                        />
                    </Tabs.Panel>
                    <Tabs.Panel value="classes">
                        <ClassesPanel />
                    </Tabs.Panel>
                    <Tabs.Panel value="catalog-health">
                        <CatalogHealthPanel />
                    </Tabs.Panel>
                    <Tabs.Panel value="embeddings">
                        <EmbeddingManagement />
                    </Tabs.Panel>
                    <Tabs.Panel value="notifications">
                        <NotificationManagement />
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Container>
    )
}
