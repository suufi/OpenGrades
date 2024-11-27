// @ts-nocheck

import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'

import { Badge, Box, Button, Card, Container, Group, Input, Modal, SimpleGrid, Space, Text, Title, Tooltip } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import mongoConnection from '../utils/mongoConnection'


import User from '@/models/User'
import { showNotification } from '@mantine/notifications'
import { Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import { useRouter } from 'next/router'
import authOptions from "pages/api/auth/[...nextauth]"
import { useState } from 'react'
import Report from '../models/Report'
import { IReport } from '../types'

const ResolveModal = ({ reportId, callback }: { reportId?: string, callback: Function }) => {
  const [opened, { toggle, close }] = useDisclosure()

  const [value, setValue] = useState('')

  async function resolveReport () {
    await fetch('/api/reports', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reportId,
        outcome: value
      })
    }).then(async (res) => {
      if (res.status === 200) {
        close()
        setValue('')
        close()
        callback(true, value)
        showNotification({
          title: 'Report resolved',
          message: 'The report has been resolved.',
          color: 'blue',
          autoClose: 5000
        })
      } else {
        showNotification({
          title: 'Error',
          message: 'There was an error resolving the report.',
          color: 'red',
          autoClose: 5000
        })
      }
    })
  }

  return (
    <>
      <Button variant="light" color="blue" fullWidth mt="md" radius="md" onClick={toggle}>
        Resolve
      </Button>

      <Modal title="Resolve Report" size="md" opened={opened} onClose={close}>

        <Input.Wrapper label="What was the outcome of this report?" required>
          <Input value={value} onChange={(e) => setValue(e.currentTarget.value)} placeholder="Outcome" />
        </Input.Wrapper>

        <Group grow>
          <Button variant="light" color="red" mt="md" radius="md" onClick={close}>
            Cancel
          </Button>
          <Button disabled={value.length < 5} variant="light" color="blue" mt="md" radius="md" onClick={resolveReport}>
            Resolve
          </Button>
        </Group>
      </Modal>
    </>
  )
}

interface ApprovalsProps {
  reportsProp: IReport[]
}

const ReportCard = ({ report }: { report: IReport }) => {

  const router = useRouter()

  const [resolved, setResolved] = useState(report.resolved)
  const [outcome, setOutcome] = useState(report.outcome)

  return (<Card key={report._id} shadow="sm" style={{ marginBottom: 'var(--mantine-spacing-lg)' }}>
    <Badge color={resolved ? "green" : "red"} variant="filled">
      {resolved ? "Resolved" : "Unresolved"}
    </Badge>
    <Space h="lg" />
    <Group>
      <Text c="dimmed">
        <b>Report ID:</b> {report._id || "None"}
      </Text>
    </Group>
    <Text c="dimmed">
      <b>Reporter:</b> {report.reporter.name} ({report.reporter.email})
    </Text>
    <Text c="dimmed">
      <b>Reason:</b> {report.reason}
    </Text>
    <Text c="dimmed">
      <Text span c="dimmed" inherit fw="bold">Created at:</Text> {new Date(report.createdAt).toLocaleString()}
    </Text>
    <Space h="lg" />
    <Tooltip label={report.contentSubmission ? report.contentSubmission._id : report.classReview._id} position="bottom">
      <Text c="dimmed">
        <Text span c="dimmed" inherit fw="bold">Reported:</Text> <Text c="blue" span inherit onClick={() => router.push('/classes/' + (report.contentSubmission ? report.contentSubmission.class : report.classReview.class))}>{report.contentSubmission ? report.contentSubmission.contentTitle : report.classReview.classComments}</Text>
      </Text>
    </Tooltip>
    {resolved && (
      <Text c="dimmed">
        <Text span c="dimmed" fw="bold"> Outcome: </Text> {outcome}
      </Text>
    )}

    <Group>
      <ResolveModal reportId={report._id} callback={(val: boolean, outcome: string) => {
        setResolved(val)
        setOutcome(outcome)
      }} />
    </Group>
  </Card>)
}

const Approvals: NextPage<ApprovalsProps> = ({ reportsProp }) => {

  const router = useRouter()

  return (
    <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
      <Head>
        <title>Reports | MIT OpenGrades</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <Title>
        Reports
      </Title>

      <Space h="lg" />

      <SimpleGrid cols={2}>
        {
          reportsProp.length > 0 ?
            reportsProp
              .sort((a: IReport, b: IReport) => {
                return a.createdAt > b.createdAt ? -1 : 1
              })
              .map((report: IReport) => {
                return <ReportCard key={report._id} report={report} />
              })
            : <Box>
              <Text c="dimmed">
                There are no reports to review.
              </Text>
            </Box>
        }
      </SimpleGrid>

    </Container>
  )
}

interface ServerSideProps {
  reportsProp: IReport[]
}

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (context) => {
  await mongoConnection()

  const session: Session | null = await getServerSession(context.req, context.res, authOptions)

  if (session) {
    if (session.user && session.user?.email) {
      const user = await User.findOne({ email: session.user.email })
      if (user.trustLevel < 2) {
        return {
          redirect: {
            destination: '/',
            permanent: false
          }
        }
      }

      const reports = await Report.find({}).populate('reporter contentSubmission classReview').lean()

      return {
        props: {
          reportsProp: JSON.parse(JSON.stringify(reports))
        },
      }
    }
  }

  return {
    redirect: {
      destination: '/api/auth/signin',
      permanent: false
    }
  }
}

export default Approvals
