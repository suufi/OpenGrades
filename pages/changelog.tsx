// @ts-nocheck
import Changelog from '@/models/Changelog'
import mongoConnection from '@/utils/mongoConnection'
import { IChangelogEntry } from '@/types'
import { Container, Divider, List, Paper, Stack, Text, Title } from '@mantine/core'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import Head from 'next/head'

export interface ChangelogMonthCluster {
  monthKey: string
  monthLabel: string
  entries: IChangelogEntry[]
}

interface ChangelogPageProps {
  clusters: ChangelogMonthCluster[]
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const ChangelogPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ clusters }) => {
  return (
    <Container size="md" py="xl">
      <Head>
        <title>Changelog - MIT OpenGrades</title>
        <meta name="description" content="Release history and updates for MIT OpenGrades" />
      </Head>

      <Stack gap="lg">
        <div>
          <Title order={1}>Changelog</Title>
          <Text c="dimmed" size="sm" mt="xs">
            Release history and notable updates.
          </Text>
        </div>

        <Divider />

        {!clusters || clusters.length === 0 ? (
          <Paper p="lg" withBorder>
            <Text c="dimmed">No changelog entries yet. Check back later.</Text>
          </Paper>
        ) : (
          clusters.map((cluster) => (
            <Paper key={cluster.monthKey} p="md" withBorder shadow="xs" radius="md">
              <Stack gap="md">
                <Text fw={700} size="lg">
                  {cluster.monthLabel}
                </Text>
                {cluster.entries.map((entry, idx) => (
                  <Stack key={entry._id ?? entry.date} gap="xs">
                    {idx > 0 && <Divider />}
                    <Text fw={600} size="sm">
                      {entry.title ?? entry.date}
                    </Text>
                    <List size="sm" spacing="xs" listStyleType="disc" pl="md">
                      {entry.bullets.map((bullet, i) => (
                        <List.Item key={i}>
                          <Text size="sm" component="span">{bullet}</Text>
                        </List.Item>
                      ))}
                    </List>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          ))
        )}
      </Stack>
    </Container>
  )
}

export const getServerSideProps: GetServerSideProps<ChangelogPageProps> = async () => {
  try {
    await mongoConnection()
    const entries = await Changelog.find({})
      .sort({ order: -1, date: -1 })
      .lean()
    const list = JSON.parse(JSON.stringify(entries)) as IChangelogEntry[]

    const byMonth = new Map<string, IChangelogEntry[]>()
    for (const e of list) {
      const monthKey = e.date.slice(0, 7)
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, [])
      byMonth.get(monthKey)!.push(e)
    }
    const clusters: ChangelogMonthCluster[] = Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, entries]) => ({
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        entries
      }))

    return {
      props: {
        clusters
      }
    }
  } catch (error) {
    console.error('Changelog getServerSideProps error:', error)
    return {
      props: {
        clusters: []
      }
    }
  }
}

export default ChangelogPage
