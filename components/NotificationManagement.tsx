import React, { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Group,
  Stack,
  Table,
  Text,
  Title
} from '@mantine/core'
import { showNotification } from '@mantine/notifications'

import { CATEGORY_OPTIONS, NotificationComposer } from '@/components/admin/NotificationComposer'

interface ScheduledNotification {
  _id: string
  title: string
  body: string
  category: string
  scheduledAt: string | null
  sentAt: string | null
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
  data?: { targetPath?: string } | null
  recipientCount: number
  createdBy?: { name: string; kerb: string }
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'yellow',
  sending: 'blue',
  sent: 'green',
  failed: 'red',
  cancelled: 'gray',
}

export function NotificationManagement() {
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([])
  const [loading, setLoading] = useState(true)

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

      {/* Compose window: templates, registrar calendar, scheduling, anti-spam checks */}
      <NotificationComposer recent={notifications} onSubmitted={fetchNotifications} />

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
                    {n.data?.targetPath && (
                      <Text size="xs" c="cyan" lineClamp={1}>→ {n.data.targetPath}</Text>
                    )}
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
