// @ts-nocheck
import {
  Container,
  Table,
  Title,
  Text,
  Stack,
  Select,
  Card,
  Badge,
  Group,
  Box,
  Loader,
  ThemeIcon,
  SegmentedControl,
} from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons'
import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { Trophy } from 'tabler-icons-react'
import { formatDepartmentOptionLabel } from '@/utils/departments'

type LeaderboardRow = {
  rank: number
  userId: string
  displayName: string
  total: number
  classOf?: number | null
  rankPercent?: number | null
}

type MeEntry = {
  rank: number
  userId: string
  displayName: string
  total: number
  classOf: number | null
  rankPercent?: number | null
}

export default function LeaderboardPage() {
  const { status } = useSession()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [classYears, setClassYears] = useState<number[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [me, setMe] = useState<MeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [classOfFilter, setClassOfFilter] = useState<string | null>(null)
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null)
  const [mode, setMode] = useState<'current' | 'alltime'>('current')

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (classOfFilter != null && classOfFilter !== '') params.set('classOf', classOfFilter)
    if (departmentFilter != null && departmentFilter !== '') params.set('department', departmentFilter)
    if (mode === 'alltime') params.set('mode', 'alltime')
    const url = `/api/karma/leaderboard${params.toString() ? `?${params.toString()}` : ''}`
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) return { success: false }
        return res.json()
      })
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          setRows(data.data)
          setMe(data.me ?? null)
          if (Array.isArray(data.classYears)) setClassYears(data.classYears)
          if (Array.isArray(data.departments)) setDepartments(data.departments)
        } else {
          setRows([])
          setMe(null)
        }
        setLoading(false)
      })
      .catch(() => {
        setRows([])
        setMe(null)
        setLoading(false)
      })
  }, [classOfFilter, departmentFilter, mode])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const isCurrentUser = (row: LeaderboardRow) => me && row.userId === me.userId
  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy size={18} color="#d4af37" /> // gold
    if (rank === 2) return <Trophy size={18} color="#c0c0c0" /> // silver
    if (rank === 3) return <Trophy size={18} color="#cd7f32" /> // bronze
    return null
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Box>
          <Title order={2}>Karma Leaderboard</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Earn karma by posting reviews, uploading grade reports and syllabi, and getting upvotes.
            Top 100 contributors by total karma.
          </Text>
        </Box>

        {me && (
          <Card withBorder padding="md" radius="md" bg="var(--mantine-color-blue-light)">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" variant="light">
                <IconInfoCircle size={22} />
              </ThemeIcon>
              <Box style={{ flex: 1 }}>
                <Text fw={600} size="sm" color='light'>
                  You&apos;re #{me.rank}
                  {me.rankPercent != null && me.rankPercent > 0 && (
                    <Text component="span" size="xs" c="dimmed" ml={6}>
                      (Top {me.rankPercent}%)
                    </Text>
                  )}
                  {me.total > 0 ? ` with ${me.total} karma` : ''}
                </Text>
                <Text size="xs" c="dimmed">
                  {me.total === 0
                    ? 'Start contributing to climb the board!'
                    : 'Keep it up! Post reviews/class information, and upload grade reports to earn more.'}
                </Text>
              </Box>
              {me.rank <= 3 && (
                <Badge size="lg" variant="light" color="yellow" leftSection={rankIcon(me.rank)}>
                  Top {me.rank}
                </Badge>
              )}
            </Group>
          </Card>
        )}

        <Group gap="md" align="flex-end">
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as 'current' | 'alltime')}
            data={[
              { label: 'Current karma', value: 'current' },
              { label: 'All-time earned', value: 'alltime' },
            ]}
          />
          {classYears.length > 0 && (
            <Select
              label="Class year"
              placeholder="All years"
              clearable
              data={[
                { value: '', label: 'All years' },
                ...classYears.map((y) => ({ value: String(y), label: String(y) })),
              ]}
              value={classOfFilter ?? ''}
              onChange={(v) => setClassOfFilter(v || null)}
              size="sm"
              w={160}
            />
          )}
          {departments.length > 0 && (
            <Select
              label="Department"
              placeholder="All departments"
              clearable
              data={[
                { value: '', label: 'All departments' },
                ...departments.map((d) => ({ value: d, label: formatDepartmentOptionLabel(d) })),
              ]}
              value={departmentFilter ?? ''}
              onChange={(v) => setDepartmentFilter(v || null)}
              size="sm"
              w={180}
            />
          )}
        </Group>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text c="dimmed">Loading leaderboard...</Text>
          </Group>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 72 }}>Rank</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Karma</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr
                  key={row.userId}
                  bg={isCurrentUser(row) ? 'var(--mantine-color-blue-light)' : undefined}
                  fw={isCurrentUser(row) ? 600 : undefined}
                >
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      {rankIcon(row.rank)}
                      <Box>
                        <Text size="sm" fw={500}>{row.rank}</Text>
                      </Box>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      {row.displayName}
                      {isCurrentUser(row) && (
                        <Badge size="xs" variant="light" color="blue">
                          You
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{row.total}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {!loading && rows.length === 0 && (
          <Text c="dimmed">
            No karma data yet{classOfFilter ? ' for this class year.' : '.'} Be the first to earn
            karma by contributing!
          </Text>
        )}

        {status === 'unauthenticated' && (
          <Text size="xs" c="dimmed">
            Sign in to see your rank and highlight on the leaderboard.
          </Text>
        )}
      </Stack>
    </Container>
  )
}
