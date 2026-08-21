import React, { useMemo, useState } from 'react'

import {
    Alert, Badge, Box, Button, Collapse, Group, List, Menu, Paper, ScrollArea,
    SegmentedControl, Select, Skeleton, Stack, Text, Textarea, TextInput, Tooltip, UnstyledButton
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { openConfirmModal } from '@mantine/modals'
import { showNotification } from '@mantine/notifications'
import { IconBellRinging, IconCalendarEvent, IconChevronDown, IconRefresh, IconTemplate, IconX } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'

import { formatEventDate, RegistrarCalendarEvent } from '@/utils/icalParser'
import {
    fillTemplate, missingTokens, NOTIFICATION_TEMPLATES, NotificationTemplate, templateForEventSummary
} from '@/utils/notificationTemplates'

export const CATEGORY_OPTIONS = [
    { value: 'feature_updates', label: 'Feature Updates' },
    { value: 'catalog_updates', label: 'Catalog Updates' },
    { value: 'pe_updates', label: 'PE Updates' },
    { value: 'academic_calendar', label: 'Academic Calendar' },
]

/** The slice of the history list the composer needs for its anti-spam checks. */
export interface RecentNotification {
    _id: string
    title: string
    status: string
    scheduledAt: string | null
    sentAt: string | null
}

const TITLE_RECOMMENDED = 50
const BODY_RECOMMENDED = 178
const VISIBLE_EVENTS = 7

interface CalendarPayload {
    events: RegistrarCalendarEvent[]
    fetchedAt: string
}

function useRegistrarCalendar() {
    return useQuery({
        queryKey: ['admin', 'registrar-calendar'],
        queryFn: async (): Promise<CalendarPayload> => {
            const res = await fetch('/api/notifications/calendar?weeks=8')
            const body = await res.json()
            if (!res.ok || !body.success) throw new Error(body.message || 'Calendar fetch failed')
            return body.data
        },
        staleTime: 6 * 60 * 60 * 1000,
    })
}

/** Strips the Drupal feed's hard truncation so it doesn't leak into copy. */
function cleanSummary(summary: string): string {
    return summary.replace(/(\.\.\.|…)\s*$/, '').trim()
}

/** Local Date at hh:00 on an event's YYYY-MM-DD calendar date. */
function eventDateAt(isoDate: string, hour: number): Date {
    const [y, m, d] = isoDate.split('-').map(Number)
    return new Date(y, m - 1, d, hour, 0, 0, 0)
}

function formatDelivery(date: Date): string {
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function CharCount({ length, recommended }: { length: number; recommended: number }) {
    const over = length > recommended
    return (
        <Text size="xs" c={over ? 'orange.7' : 'dimmed'} span>
            {length}/{recommended}{over ? ' — may be cut off on lock screens' : ''}
        </Text>
    )
}

export function NotificationComposer({
    recent,
    onSubmitted,
}: {
    recent: RecentNotification[]
    onSubmitted: () => void
}) {
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [category, setCategory] = useState<string | null>('feature_updates')
    const [targetPath, setTargetPath] = useState('')
    const [mode, setMode] = useState<'now' | 'schedule'>('now')
    const [scheduledAt, setScheduledAt] = useState<Date | null>(null)
    const [linkedEvent, setLinkedEvent] = useState<RegistrarCalendarEvent | null>(null)
    const [showAllEvents, setShowAllEvents] = useState(false)
    const [sending, setSending] = useState(false)

    const calendar = useRegistrarCalendar()

    const applyTemplate = (template: NotificationTemplate, event?: RegistrarCalendarEvent) => {
        const vars = event
            ? { date: formatEventDate(event.date), event: cleanSummary(event.summary) }
            : {}
        setTitle(fillTemplate(template.title, vars))
        setBody(fillTemplate(template.body, vars))
        setCategory(template.category)
        if (template.targetPath !== undefined) setTargetPath(template.targetPath)
        setLinkedEvent(event ?? null)

        if (event) {
            const morningOf = eventDateAt(event.date, 8)
            if (morningOf.getTime() > Date.now()) {
                setMode('schedule')
                setScheduledAt(morningOf)
            }
        }
    }

    const useEvent = (event: RegistrarCalendarEvent) => {
        applyTemplate(templateForEventSummary(event.summary), event)
    }

    const clearLinkedEvent = () => setLinkedEvent(null)

    const now = new Date()
    const deliveryTime = mode === 'schedule' && scheduledAt ? scheduledAt : now
    const unfilled = useMemo(() => missingTokens(`${title}\n${body}`), [title, body])
    const trimmedTargetPath = targetPath.trim()

    const blockers: string[] = []
    if (!title.trim() || !body.trim() || !category) blockers.push('Title, body, and category are required.')
    if (unfilled.length > 0) blockers.push(`Fill in ${unfilled.map(t => `{${t}}`).join(', ')} before sending.`)
    if (trimmedTargetPath && !trimmedTargetPath.startsWith('/')) blockers.push('Target path must start with "/" (e.g. /classes/aggregate/6.1200).')
    if (mode === 'schedule' && !scheduledAt) blockers.push('Pick a delivery time, or switch to "Send now".')
    if (mode === 'schedule' && scheduledAt && scheduledAt.getTime() <= Date.now()) blockers.push('The scheduled time is in the past.')

    const warnings: string[] = []
    const DAY = 24 * 3600 * 1000
    const sentLast48h = recent.filter(n => n.sentAt && now.getTime() - new Date(n.sentAt).getTime() < 2 * DAY)
    const sentLast7d = recent.filter(n => n.sentAt && now.getTime() - new Date(n.sentAt).getTime() < 7 * DAY)
    const pendingNearby = recent.filter(n =>
        n.status === 'pending' && n.scheduledAt &&
        Math.abs(new Date(n.scheduledAt).getTime() - deliveryTime.getTime()) < DAY
    )
    if (sentLast48h.length > 0) warnings.push(`A notification already went out in the last 48 hours ("${sentLast48h[0].title}").`)
    if (sentLast7d.length >= 3) warnings.push(`This would be notification #${sentLast7d.length + 1} in 7 days — heavy weeks train students to mute us.`)
    if (pendingNearby.length > 0) warnings.push(`"${pendingNearby[0].title}" is already scheduled within 24 hours of this delivery time.`)
    const deliveryHour = deliveryTime.getHours()
    if (deliveryHour >= 21 || deliveryHour < 8) warnings.push('Delivery lands between 9 PM and 8 AM — consider a daytime slot.')
    if (/(\.\.\.|…)/.test(title) || /(\.\.\.|…)/.test(body)) warnings.push('Text contains "…" — the Registrar feed truncates summaries, finish the wording.')
    const normalizedTitle = title.trim().toLowerCase()
    if (normalizedTitle && recent.some(n => n.status === 'pending' && n.title.trim().toLowerCase() === normalizedTitle)) {
        warnings.push('A pending notification already has this exact title.')
    }

    const doSubmit = async () => {
        setSending(true)
        try {
            const payload: Record<string, unknown> = { title: title.trim(), body: body.trim(), category }
            if (mode === 'schedule' && scheduledAt) payload.scheduledAt = scheduledAt.toISOString()
            if (trimmedTargetPath) payload.data = { targetPath: trimmedTargetPath }

            const res = await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (res.ok) {
                showNotification({
                    title: mode === 'schedule' ? 'Scheduled' : 'Sent',
                    message: data.message || 'Notification processed successfully.',
                    color: 'green',
                })
                setTitle('')
                setBody('')
                setTargetPath('')
                setScheduledAt(null)
                setMode('now')
                setLinkedEvent(null)
                onSubmitted()
            } else {
                showNotification({ title: 'Error', message: data.message || 'Failed to send notification.', color: 'red' })
            }
        } catch {
            showNotification({ title: 'Error', message: 'Network error.', color: 'red' })
        } finally {
            setSending(false)
        }
    }

    const handleSubmit = () => {
        if (blockers.length > 0) return
        if (warnings.length > 0) {
            openConfirmModal({
                title: 'Send anyway?',
                children: (
                    <Stack gap="xs">
                        <Text size="sm">This notification trips the anti-spam checks:</Text>
                        <List size="sm">
                            {warnings.map((w) => <List.Item key={w}>{w}</List.Item>)}
                        </List>
                    </Stack>
                ),
                labels: { confirm: mode === 'schedule' ? 'Schedule anyway' : 'Send anyway', cancel: 'Go back' },
                confirmProps: { color: 'orange' },
                onConfirm: doSubmit,
            })
        } else {
            doSubmit()
        }
    }

    const events = calendar.data?.events ?? []
    const visibleEvents = showAllEvents ? events : events.slice(0, VISIBLE_EVENTS)
    const submitLabel = mode === 'schedule'
        ? `Schedule${scheduledAt ? ` for ${formatDelivery(scheduledAt)}` : ''}`
        : 'Send now'

    return (
        <Stack gap="sm" p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Group justify="space-between">
                <Text size="sm" fw={600}>Compose Notification</Text>
                <Menu position="bottom-end" width={280}>
                    <Menu.Target>
                        <Button variant="light" size="xs" leftSection={<IconTemplate size={14} />}>
                            Start from a template
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Academic calendar</Menu.Label>
                        {NOTIFICATION_TEMPLATES.filter(t => t.category === 'academic_calendar' || t.category === 'pe_updates').map(t => (
                            <Menu.Item key={t.id} onClick={() => applyTemplate(t, linkedEvent ?? undefined)}>
                                {t.label}
                            </Menu.Item>
                        ))}
                        <Menu.Label>Product</Menu.Label>
                        {NOTIFICATION_TEMPLATES.filter(t => t.category === 'feature_updates' || t.category === 'catalog_updates').map(t => (
                            <Menu.Item key={t.id} onClick={() => applyTemplate(t)}>
                                {t.label}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </Group>

            {/* Upcoming registrar calendar: one click prefills copy + schedule */}
            <Paper p="sm" radius="md" withBorder shadow="none">
                <Stack gap={6}>
                    <Group justify="space-between">
                        <Group gap={6}>
                            <IconCalendarEvent size={16} />
                            <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts={0.5}>Upcoming academic calendar</Text>
                        </Group>
                        <Tooltip label="Reload the Registrar feed">
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                onClick={() => calendar.refetch()}
                                loading={calendar.isFetching}
                                leftSection={<IconRefresh size={12} />}
                            >
                                Refresh
                            </Button>
                        </Tooltip>
                    </Group>

                    {calendar.isPending && <Skeleton height={72} />}
                    {calendar.isError && (
                        <Text size="sm" c="red">
                            Couldn't load the Registrar calendar. Use Refresh to retry, or compose manually.
                        </Text>
                    )}
                    {calendar.data && events.length === 0 && (
                        <Text size="sm" c="dimmed">No academic calendar events in the next 8 weeks.</Text>
                    )}

                    <ScrollArea.Autosize mah={280}>
                        <Stack gap={2}>
                            {visibleEvents.map((event) => {
                                const isLinked = linkedEvent?.uid === event.uid
                                return (
                                    <UnstyledButton
                                        key={event.uid}
                                        onClick={() => useEvent(event)}
                                        aria-label={`Use calendar event: ${event.summary}`}
                                        px={6}
                                        py={4}
                                        style={{
                                            borderRadius: 'var(--mantine-radius-sm)',
                                            backgroundColor: isLinked ? 'var(--mantine-color-default-hover)' : undefined,
                                        }}
                                    >
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge
                                                variant={isLinked ? 'filled' : 'light'}
                                                size="sm"
                                                ff="monospace"
                                                miw={64}
                                                style={{ flexShrink: 0 }}
                                            >
                                                {formatEventDate(event.date)}
                                            </Badge>
                                            <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                                                {event.summary}{event.endDate ? ` (through ${formatEventDate(event.endDate)})` : ''}
                                            </Text>
                                        </Group>
                                    </UnstyledButton>
                                )
                            })}
                        </Stack>
                    </ScrollArea.Autosize>

                    {events.length > VISIBLE_EVENTS && (
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            onClick={() => setShowAllEvents(o => !o)}
                            leftSection={<IconChevronDown size={12} style={{ transform: showAllEvents ? 'rotate(180deg)' : undefined }} />}
                        >
                            {showAllEvents ? 'Show fewer' : `Show all ${events.length}`}
                        </Button>
                    )}
                </Stack>
            </Paper>

            {linkedEvent && (
                <Group gap={6}>
                    <Badge variant="dot" color="brick" size="sm">
                        Prefilled from {formatEventDate(linkedEvent.date)}: {cleanSummary(linkedEvent.summary).slice(0, 60)}
                    </Badge>
                    <Tooltip label="Unlink this event (keeps the text)">
                        <Button variant="subtle" size="compact-xs" color="gray" onClick={clearLinkedEvent} px={4} aria-label="Unlink calendar event">
                            <IconX size={12} />
                        </Button>
                    </Tooltip>
                </Group>
            )}

            <TextInput
                label={<Group gap={6} justify="space-between" w="100%"><Text size="sm" fw={500} span>Title</Text><CharCount length={title.length} recommended={TITLE_RECOMMENDED} /></Group>}
                labelProps={{ w: '100%' }}
                placeholder="e.g. Registration deadline Sep 11"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={200}
            />
            <Textarea
                label={<Group gap={6} justify="space-between" w="100%"><Text size="sm" fw={500} span>Body</Text><CharCount length={body.length} recommended={BODY_RECOMMENDED} /></Group>}
                labelProps={{ w: '100%' }}
                placeholder="Describe the update…"
                value={body}
                onChange={e => setBody(e.target.value)}
                minRows={3}
                maxLength={1000}
            />
            <Group grow align="flex-start">
                <Select
                    label="Category"
                    description="Students subscribe per category"
                    data={CATEGORY_OPTIONS}
                    value={category}
                    onChange={(val) => setCategory(typeof val === 'string' ? val : null)}
                />
                <TextInput
                    label="Target path (optional)"
                    description="App route opened when the user taps the notification"
                    placeholder="/classes/aggregate/6.1200"
                    value={targetPath}
                    onChange={e => setTargetPath(e.target.value)}
                />
            </Group>

            <Stack gap={6}>
                <Text size="sm" fw={500}>Delivery</Text>
                <Group gap="sm" align="center" wrap="wrap">
                    <SegmentedControl
                        size="xs"
                        value={mode}
                        onChange={(v) => setMode(v as 'now' | 'schedule')}
                        data={[{ label: 'Send now', value: 'now' }, { label: 'Schedule', value: 'schedule' }]}
                    />
                    {mode === 'schedule' && (
                        <>
                            <DateTimePicker
                                size="xs"
                                w={220}
                                placeholder="Pick date and time"
                                value={scheduledAt}
                                onChange={(val) => setScheduledAt(val ? new Date(val as unknown as string) : null)}
                                minDate={new Date()}
                                valueFormat="MMM D, YYYY h:mm A"
                            />
                            <Button
                                variant="light"
                                size="compact-xs"
                                onClick={() => {
                                    const t = new Date()
                                    t.setDate(t.getDate() + 1)
                                    t.setHours(9, 0, 0, 0)
                                    setScheduledAt(t)
                                }}
                            >
                                Tomorrow 9 AM
                            </Button>
                            {linkedEvent && eventDateAt(linkedEvent.date, 8).getTime() > Date.now() && (
                                <Button variant="light" size="compact-xs" onClick={() => setScheduledAt(eventDateAt(linkedEvent.date, 8))}>
                                    Morning of ({formatEventDate(linkedEvent.date)}, 8 AM)
                                </Button>
                            )}
                            {linkedEvent && eventDateAt(linkedEvent.date, -6).getTime() > Date.now() && (
                                <Button variant="light" size="compact-xs" onClick={() => setScheduledAt(eventDateAt(linkedEvent.date, -6))}>
                                    Evening before (6 PM)
                                </Button>
                            )}
                        </>
                    )}
                </Group>
            </Stack>

            {(title || body) && (
                <Paper p="sm" radius="lg" withBorder shadow="none" bg="var(--mantine-color-default-hover)" maw={420}>
                    <Group gap={8} wrap="nowrap" align="flex-start">
                        <Box mt={2}><IconBellRinging size={16} /></Box>
                        <Stack gap={2} style={{ minWidth: 0 }}>
                            <Text size="xs" c="dimmed">OpenGrades · now</Text>
                            <Text size="sm" fw={600} lineClamp={1}>{title || 'Title'}</Text>
                            <Text size="sm" lineClamp={2}>{body || 'Body'}</Text>
                        </Stack>
                    </Group>
                </Paper>
            )}

            {blockers.length > 0 && (title || body) && (
                <Text size="xs" c="dimmed">{blockers[0]}</Text>
            )}
            {warnings.length > 0 && blockers.length === 0 && (
                <Alert color="yellow" p="xs" title={`${warnings.length} anti-spam check${warnings.length === 1 ? '' : 's'} tripped`}>
                    <List size="xs">
                        {warnings.map((w) => <List.Item key={w}>{w}</List.Item>)}
                    </List>
                </Alert>
            )}

            <Group justify="space-between" align="center">
                <Text size="xs" c="dimmed">
                    {sentLast7d.length === 0 ? 'Nothing sent in the last 7 days.' : `${sentLast7d.length} sent in the last 7 days.`}
                </Text>
                <Button
                    loading={sending}
                    disabled={blockers.length > 0}
                    onClick={handleSubmit}
                    color={warnings.length > 0 ? 'orange' : mode === 'schedule' ? 'violet' : 'blue'}
                >
                    {submitLabel}
                </Button>
            </Group>
        </Stack>
    )
}
