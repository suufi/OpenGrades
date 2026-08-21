import { useEffect, useState } from 'react'
import Head from 'next/head'
import {
  Badge,
  Container,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  Title
} from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import { decodeHtmlEntities } from '@/utils/htmlEntities'

interface FeedItem {
  _id: string
  title: string
  body: string
  category: string
  sentAt: string | null
  data?: { targetPath?: string } | null
}

interface Preferences {
  feature_updates: boolean
  catalog_updates: boolean
  pe_updates: boolean
  academic_calendar: boolean
}

const CATEGORY_META: { key: keyof Preferences; label: string; description: string }[] = [
  { key: 'feature_updates', label: 'Feature Updates', description: 'New features and improvements to OpenGrades' },
  { key: 'catalog_updates', label: 'Catalog Updates', description: 'Changes to the MIT subject catalog' },
  { key: 'pe_updates', label: 'PE Updates', description: 'PE registration and schedule reminders' },
  { key: 'academic_calendar', label: 'Academic Calendar', description: 'Key academic dates and deadlines' },
]

const DEFAULT_PREFS: Preferences = {
  feature_updates: true,
  catalog_updates: true,
  pe_updates: true,
  academic_calendar: true,
}

function categoryLabel(category: string): string {
  return CATEGORY_META.find(c => c.key === category)?.label || category
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)
  const [loadingPrefs, setLoadingPrefs] = useState(true)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [loadingFeed, setLoadingFeed] = useState(true)

  const fetchFeed = async () => {
    setLoadingFeed(true)
    try {
      const res = await fetch('/api/me/notifications?limit=50')
      const data = await res.json()
      if (data.success) setFeed(data.data || [])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoadingFeed(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/me/notification-preferences')
        const data = await res.json()
        if (data.success) setPrefs(data.data)
      } catch (error) {
        console.error('Error fetching notification preferences:', error)
      } finally {
        setLoadingPrefs(false)
      }
    }
    load()
    fetchFeed()
  }, [])

  const togglePref = async (key: keyof Preferences) => {
    const newValue = !prefs[key]
    setPrefs(prev => ({ ...prev, [key]: newValue }))
    try {
      const res = await fetch('/api/me/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: newValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message)
      fetchFeed()
    } catch (error) {
      setPrefs(prev => ({ ...prev, [key]: !newValue }))
      showNotification({ title: 'Error', message: 'Could not update preference.', color: 'red' })
    }
  }

  return (
    <Container size="md" py="xl">
      <Head>
        <title>Notifications - MIT OpenGrades</title>
        <meta name="description" content="Notification history and preferences" />
      </Head>

      <Stack gap="lg">
        <div>
          <Title order={1}>Notifications</Title>
          <Text c="dimmed" size="sm" mt="xs">
            Push notifications are delivered through the OpenGrades mobile app. Manage which
            categories you receive and browse past announcements here.
          </Text>
        </div>

        <Paper p="md" withBorder radius="md">
          <Stack gap="xs">
            <Text fw={600}>Preferences</Text>
            {loadingPrefs ? (
              <Loader size="sm" />
            ) : (
              CATEGORY_META.map(cat => (
                <Group key={cat.key} justify="space-between" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={500}>{cat.label}</Text>
                    <Text size="xs" c="dimmed">{cat.description}</Text>
                  </div>
                  <Switch
                    checked={prefs[cat.key]}
                    onChange={() => togglePref(cat.key)}
                  />
                </Group>
              ))
            )}
          </Stack>
        </Paper>

        <Divider />

        <Stack gap="xs">
          <Text fw={600}>Recent notifications</Text>
          {loadingFeed ? (
            <Loader size="sm" />
          ) : feed.length === 0 ? (
            <Paper p="lg" withBorder>
              <Text c="dimmed">Nothing here yet. Announcements you&apos;re subscribed to will show up here.</Text>
            </Paper>
          ) : (
            feed.map(item => (
              <Paper key={item._id} p="md" withBorder radius="md">
                <Group justify="space-between" mb={4} wrap="nowrap">
                  <Text fw={600} size="sm">{decodeHtmlEntities(item.title)}</Text>
                  <Badge size="sm" variant="outline">{categoryLabel(item.category)}</Badge>
                </Group>
                <Text size="sm">{decodeHtmlEntities(item.body)}</Text>
                <Text size="xs" c="dimmed" mt={4}>{formatDate(item.sentAt)}</Text>
              </Paper>
            ))
          )}
        </Stack>
      </Stack>
    </Container>
  )
}
