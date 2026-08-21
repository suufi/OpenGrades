import { useState } from 'react'

import { Badge, Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import { IconCopy, IconRefresh } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'

import { DepartmentProgressTable } from '@/components/DepartmentProgressTable'

import { adminQueryKeys, useTwinScan } from './adminHealth'

function DuplicatesCard() {
    const queryClient = useQueryClient()
    const twins = useTwinScan()
    const [resolving, setResolving] = useState(false)

    const resolveTwins = async () => {
        setResolving(true)
        try {
            const res = await fetch('/api/classes/twins', { method: 'POST' })
            const body = await res.json()
            if (!res.ok || !body.success) throw new Error(body.message || 'Resolution failed')
            showNotification({
                title: 'Duplicates hidden',
                message: `Hid ${body.data.hidden} duplicate doc(s). ${body.data.remainingManual} pair(s) still need manual review.`,
                color: 'green'
            })
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.twins })
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.catalogCounts })
        } catch (e) {
            showNotification({ title: 'Twin resolution failed', message: e instanceof Error ? e.message : 'Unknown error', color: 'red' })
        } finally {
            setResolving(false)
        }
    }

    return (
        <Card>
            <Stack gap="sm">
                <Group justify="space-between" align="baseline" wrap="wrap">
                    <Group gap="xs">
                        <IconCopy size={18} />
                        <Title order={4}>Duplicate classes</Title>
                        {twins.data && twins.data.total > 0 && (
                            <Badge color="yellow" variant="light">{twins.data.total} pair{twins.data.total === 1 ? '' : 's'}</Badge>
                        )}
                    </Group>
                    <Group gap="xs">
                        <Button
                            variant="light"
                            size="xs"
                            leftSection={<IconRefresh size={14} />}
                            loading={twins.isFetching}
                            onClick={() => twins.refetch()}
                        >
                            Rescan
                        </Button>
                        <Button
                            color="orange"
                            size="xs"
                            loading={resolving}
                            disabled={!twins.data || twins.data.autoResolvable === 0}
                            onClick={resolveTwins}
                        >
                            Hide safe duplicates{twins.data ? ` (${twins.data.autoResolvable})` : ''}
                        </Button>
                    </Group>
                </Group>
                <Text size="sm" c="dimmed">
                    Two docs in the same term for one subject (renumbered or cross-listed twins) double-count in
                    charts and search. Safe duplicates (no reviews, content, or users attached) are hidden
                    (reversible via the Display flag). This also runs automatically at the end of every warehouse sync.
                </Text>
                {twins.isPending && <Skeleton height={20} width="50%" />}
                {twins.isError && (
                    <Text size="sm" c="red">
                        Duplicate scan failed{twins.error instanceof Error ? `: ${twins.error.message}` : ''}. Use Rescan to retry.
                    </Text>
                )}
                {twins.data && (
                    twins.data.groups.length === 0
                        ? <Text size="sm" c="teal">No duplicate class docs found.</Text>
                        : (
                            <Stack gap={4}>
                                {twins.data.groups.slice(0, 60).map((g) => (
                                    <Group key={`${g.a._id}-${g.b._id}`} gap="xs" wrap="wrap">
                                        <Badge variant="light">{g.term}</Badge>
                                        <Text size="sm">
                                            {g.a.subjectNumber} ({g.a.attachments.reviews}r/{g.a.attachments.content}c/{g.a.attachments.users}u)
                                            {' vs '}
                                            {g.b.subjectNumber} ({g.b.attachments.reviews}r/{g.b.attachments.content}c/{g.b.attachments.users}u)
                                        </Text>
                                        {g.safeToHide
                                            ? <Badge color="orange" variant="light" size="sm">
                                                auto-hide {g.safeToHide === g.a._id ? g.a.subjectNumber : g.b.subjectNumber}
                                            </Badge>
                                            : <Badge color="gray" variant="light" size="sm">manual</Badge>}
                                    </Group>
                                ))}
                                {twins.data.groups.length > 60 && (
                                    <Text size="xs" c="dimmed">and {twins.data.groups.length - 60} more pairs</Text>
                                )}
                            </Stack>
                        )
                )}
            </Stack>
        </Card>
    )
}

export function CatalogHealthPanel() {
    return (
        <Stack gap="xl">
            <DuplicatesCard />
            <DepartmentProgressTable />
        </Stack>
    )
}
