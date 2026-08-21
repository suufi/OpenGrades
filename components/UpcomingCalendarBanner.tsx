import { useEffect, useState } from 'react'

import { Anchor, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'

import ui from '@/styles/Interface.module.css'
import { formatEventDate, RegistrarCalendarEvent } from '@/utils/icalParser'

export const UPCOMING_WINDOW_DAYS = 4

const DISMISS_KEY = 'og-calendar-banner-dismissed'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface UpcomingPayload {
    events: RegistrarCalendarEvent[]
    today: string
}

function nextIsoDate(isoDate: string): string {
    const [y, m, d] = isoDate.split('-').map(Number)
    const utc = new Date(Date.UTC(y, m - 1, d) + 24 * 3600 * 1000)
    return utc.toISOString().slice(0, 10)
}

function dayLabel(isoDate: string, today: string): string {
    if (isoDate === today) return 'Today'
    if (isoDate === nextIsoDate(today)) return 'Tomorrow'
    const [y, m, d] = isoDate.split('-').map(Number)
    const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    return `${weekday}, ${formatEventDate(isoDate)}`
}

function displaySummary(summary: string): string {
    return summary.replace(/(\.\.\.|…)\s*$/, '…').trim()
}

export function UpcomingCalendarBanner() {
    const [dismissedKey, setDismissedKey] = useState<string | null>(null)
    const [hydrated, setHydrated] = useState(false)

    useEffect(() => {
        setDismissedKey(window.localStorage.getItem(DISMISS_KEY))
        setHydrated(true)
    }, [])

    const query = useQuery({
        queryKey: ['calendar-banner-v2', UPCOMING_WINDOW_DAYS],
        queryFn: async (): Promise<UpcomingPayload> => {
            const res = await fetch(`/api/calendar/upcoming?days=${UPCOMING_WINDOW_DAYS}`)
            const body = await res.json()
            if (!res.ok || !body.success) throw new Error(body.message || 'Calendar fetch failed')
            return body.data
        },
        staleTime: 6 * 60 * 60 * 1000,
        retry: 1,
    })

    if (!hydrated || query.isPending || query.isError) return null
    const { events, today } = query.data
    if (events.length === 0) return null

    const eventSetKey = events.map(e => e.uid).join(',')
    if (dismissedKey === eventSetKey) return null

    const byDay = new Map<string, RegistrarCalendarEvent[]>()
    for (const event of events) {
        const list = byDay.get(event.date) ?? []
        list.push(event)
        byDay.set(event.date, list)
    }

    const dismiss = () => {
        window.localStorage.setItem(DISMISS_KEY, eventSetKey)
        setDismissedKey(eventSetKey)
    }

    return (
        <section className={ui.sectionCard}>
            <Group justify="space-between" align="baseline" gap="sm" wrap="wrap">
                <Title order={3} className={ui.sectionTitle}>Academic calendar</Title>
                <Group gap="md">
                    <Anchor
                        href="https://registrar.mit.edu/calendar"
                        target="_blank"
                        rel="noreferrer"
                        size="sm"
                        style={{ color: 'var(--app-accent-strong)' }}
                    >
                        Full calendar
                    </Anchor>
                    <UnstyledButton
                        onClick={dismiss}
                        style={{ color: 'var(--app-text-muted)', fontSize: 'var(--mantine-font-size-sm)' }}
                    >
                        Hide
                    </UnstyledButton>
                </Group>
            </Group>
            <Stack gap={6} mt="sm">
                {[...byDay.entries()].map(([date, dayEvents]) => (
                    <Text key={date} style={{ color: 'var(--app-text-muted)', lineHeight: 1.55 }}>
                        <Text span fw={650} style={{ color: 'var(--app-text)' }}>
                            {dayLabel(date, today)}
                        </Text>
                        {' — '}
                        {dayEvents.map(e => displaySummary(e.summary)).join(' ')}
                    </Text>
                ))}
            </Stack>
        </section>
    )
}
