import React, { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from '@mantine/core'
import { showNotification } from '@mantine/notifications'
// import { DateTimePicker } from '@mantine/dates'

interface ScheduledNotification {
  _id: string
  title: string
  body: string
  category: string
  scheduledAt: string | null
  sentAt: string | null
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  recipientCount: number
  createdBy?: { name: string; kerb: string }
  createdAt: string
}

const CATEGORY_OPTIONS = [
  { value: 'feature_updates', label: 'Feature Updates' },
  { value: 'catalog_updates', label: 'Catalog Updates' },
  { value: 'pe_updates', label: 'PE Updates' },
  { value: 'academic_calendar', label: 'Academic Calendar' },
]

const STATUS_COLORS: Record<string, string> = {
  pending: 'yellow',
  sent: 'green',
  failed: 'red',
  cancelled: 'gray',
}

export function NotificationManagement() {
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<string | null>('feature_updates')
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null)

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=50')
      const data = await res.json()
      if (data.success) {
        setNotifications(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  const handleSend = async () => {
    if (!title.trim() || !body.trim() || !category) {
      showNotification({
        title: 'Missing fields',
        message: 'Title, body, and category are required.',
        color: 'red',
      })
      return
    }

    setSending(true)
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        category,
      }

      if (scheduledAt) {
        payload.scheduledAt = scheduledAt.toISOString()
      }

      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok) {
        showNotification({
          title: scheduledAt ? 'Scheduled' : 'Sent',
          message: data.message || 'Notification processed successfully.',
          color: 'green',
        })
        setTitle('')
        setBody('')
        setScheduledAt(null)
        fetchNotifications()
      } else {
        showNotification({
          title: 'Error',
          message: data.message || 'Failed to send notification.',
          color: 'red',
        })
      }
    } catch (error) {
      showNotification({
        title: 'Error',
        message: 'Network error.',
        color: 'red',
      })
    } finally {
      setSending(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        showNotification({ title: 'Cancelled', message: 'Notification cancelled.', color: 'green' })
        fetchNotifications()
      } else {
        showNotification({ title: 'Error', message: data.message || 'Failed to cancel.', color: 'red' })
      }
    } catch (error) {
      showNotification({ title: 'Error', message: 'Network error.', color: 'red' })
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getCategoryLabel = (value: string) => {
    return CATEGORY_OPTIONS.find(o => o.value === value)?.label || value
  }

  return (
    <Stack gap="md">
      <Title order={3}>Push Notifications</Title>

      {/* Compose Form */}
      <Stack gap="sm" p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
        <Text size="sm" fw={600}>Compose Notification</Text>
        <TextInput
          label="Title"
          placeholder="e.g. New Feature: Class Network Graph"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={200}
        />
        <Textarea
          label="Body"
          placeholder="Describe the update..."
          value={body}
          onChange={e => setBody(e.target.value)}
          minRows={3}
          maxLength={1000}
        />
        <Group grow>
          <Select
            label="Category"
            data={CATEGORY_OPTIONS}
            value={category}
            onChange={(val) => setCategory(val)}
          />
          {/* <DateTimePicker
            label="Schedule (optional)"
            placeholder="Send immediately"
            value={scheduledAt}
            onChange={(val) => setScheduledAt(val ? new Date(val as any) : null)}
            clearable
            minDate={new Date()}
          /> */}
        </Group>
        <Group justify="flex-end">
          <Button
            loading={sending}
            onClick={handleSend}
            color={scheduledAt ? 'violet' : 'blue'}
          >
            {scheduledAt ? 'Schedule' : 'Send Now'}
          </Button>
        </Group>
      </Stack>

      {/* History Table */}
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={600}>Notification History</Text>
          <Button size="compact-xs" variant="light" onClick={fetchNotifications} loading={loading}>
            Refresh
          </Button>
        </Group>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Status</Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Recipients</Table.Th>
              <Table.Th>Scheduled</Table.Th>
              <Table.Th>Sent</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {notifications.length === 0 && !loading ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="md">No notifications yet</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              notifications.map(n => (
                <Table.Tr key={n._id}>
                  <Table.Td>
                    <Badge color={STATUS_COLORS[n.status]} size="sm" variant="light">
                      {n.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500} lineClamp={1}>{n.title}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{n.body}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="outline">{getCategoryLabel(n.category)}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{n.recipientCount || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{formatDate(n.scheduledAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{formatDate(n.sentAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    {n.status === 'pending' && (
                      <Button
                        size="compact-xs"
                        color="red"
                        variant="light"
                        onClick={() => handleCancel(n._id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Stack>
    </Stack>
  )
}
