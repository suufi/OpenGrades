import { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Collapse,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  ActionIcon,
  Tooltip,
  Card,
  Badge,
  Avatar,
} from '@mantine/core'
import { useSession } from 'next-auth/react'
import { showNotification } from '@mantine/notifications'
import { IconChevronDown, IconChevronUp, IconMail, IconMessageCircle, IconThumbDown, IconThumbUp } from '@tabler/icons'
import { formatTermDisplay, isMitTermCode } from '@/utils/formatTerm'
import { QA_BLAST_COST_MIN } from '@/utils/karmaConstants'
import { hashToColor, getAnonLabel } from '@/utils/anonymousId'

type Answer = {
  _id: string
  body: string
  termTaken?: string
  createdAt: string
  upvotes?: number
  downvotes?: number
  userVote?: number
  authorAnonymousId?: string
  isAuthor?: boolean
}

type Question = {
  _id: string
  body: string
  createdAt: string
  solvedAt?: string | null
  blasted?: boolean
  isAuthor?: boolean
  authorAnonymousId?: string
  answers?: Answer[]
}

export default function ClassQASection({ subjectNumber }: { subjectNumber: string }) {
  const { status } = useSession()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [askModalOpen, setAskModalOpen] = useState(false)
  const [blastModalOpen, setBlastModalOpen] = useState(false)
  const [questionBody, setQuestionBody] = useState('')
  const [blastEnabled, setBlastEnabled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [blastQuestionId, setBlastQuestionId] = useState<string | null>(null)
  const [submittingBlast, setSubmittingBlast] = useState(false)
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [blastCost, setBlastCost] = useState<number | null>(null)
  const [answerBodies, setAnswerBodies] = useState<Record<string, string>>({})
  const [answerTerms, setAnswerTerms] = useState<Record<string, string>>({})
  const [submittingA, setSubmittingA] = useState<Record<string, boolean>>({})
  const [termOptions, setTermOptions] = useState<{ value: string; label: string }[]>([])
  const [karmaBalance, setKarmaBalance] = useState<number | null>(null)
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({})
  const [votingAnswerId, setVotingAnswerId] = useState<string | null>(null)

  useEffect(() => {
    if (!subjectNumber) return
    setLoading(true)
    fetch(`/api/questions?subjectNumber=${encodeURIComponent(subjectNumber)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) setQuestions(data.data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [subjectNumber])

  useEffect(() => {
    if (!subjectNumber || status !== 'authenticated') return
    fetch(`/api/me/reviews-by-subject?subjectNumber=${encodeURIComponent(subjectNumber)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.length) {
          setTermOptions(data.data.map((t: { term: string; label: string }) => ({ value: t.term, label: t.label })))
        }
      })
  }, [subjectNumber, status])

  useEffect(() => {
    if (!subjectNumber || !blastModalOpen || !blastQuestionId) return
    fetch(`/api/questions/qa-recipient-count?subjectNumber=${encodeURIComponent(subjectNumber)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          if (data.data.count != null) setRecipientCount(data.data.count)
          if (data.data.cost != null) setBlastCost(data.data.cost)
        }
      })
  }, [subjectNumber, blastModalOpen, blastQuestionId])

  useEffect(() => {
    if (!subjectNumber || !askModalOpen || !blastEnabled) return
    fetch(`/api/questions/qa-recipient-count?subjectNumber=${encodeURIComponent(subjectNumber)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          if (data.data.count != null) setRecipientCount(data.data.count)
          if (data.data.cost != null) setBlastCost(data.data.cost)
        }
      })
  }, [subjectNumber, askModalOpen, blastEnabled])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          setKarmaBalance(data.data.user.karmaBalance ?? 0)
        }
      })
  }, [status])

  const openAskModal = () => {
    setQuestionBody('')
    setBlastEnabled(false)
    setRecipientCount(null)
    setBlastCost(null)
    setAskModalOpen(true)
  }

  const closeAskModal = () => {
    setAskModalOpen(false)
    setQuestionBody('')
  }

  const openBlastModal = (questionId: string) => {
    setBlastQuestionId(questionId)
    setRecipientCount(null)
    setBlastCost(null)
    setBlastModalOpen(true)
  }

  const closeBlastModal = () => {
    setBlastModalOpen(false)
    setBlastQuestionId(null)
    setRecipientCount(null)
    setBlastCost(null)
  }

  const toggleReply = (questionId: string) => {
    setReplyOpen((prev) => ({ ...prev, [questionId]: !prev[questionId] }))
  }

  const postQuestion = async () => {
    const body = questionBody.trim()
    if (!body) return
    const cost = blastCost ?? QA_BLAST_COST_MIN
    if (blastEnabled && karmaBalance !== null && karmaBalance < cost) {
      showNotification({ title: 'Insufficient karma', message: `Need ${cost} karma.`, color: 'red' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectNumber, body }),
      })
      const data = await res.json()
      if (data.success) {
        const newQ = { ...data.data, isAuthor: true, answers: [], blasted: false }
        setQuestions((prev) => [newQ, ...prev])
        closeAskModal()
        showNotification({ title: 'Success', message: 'Your question has been posted.', color: 'green' })
        if (blastEnabled) {
          const blastResult = await doBlast(data.data._id)
          const spent = blastResult?.data?.karmaSpent
          if (typeof spent === 'number') setKarmaBalance((p) => (p != null ? p - spent : null))
        }
      } else {
        showNotification({ title: 'Error', message: data.message, color: 'red' })
      }
    } catch {
      showNotification({ title: 'Error', message: 'Failed to post', color: 'red' })
    } finally {
      setSubmitting(false)
    }
  }

  const doBlast = async (questionId: string): Promise<{ data?: { recipientCount?: number; karmaSpent?: number } } | undefined> => {
    setSubmittingBlast(true)
    try {
      const res = await fetch('/api/questions/qa-blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectNumber, questionId }),
      })
      const data = await res.json()
      if (data.success) {
        setQuestions((prev) =>
          prev.map((q) => (q._id === questionId ? { ...q, blasted: true } : q))
        )
        showNotification({
          title: 'Q&A sent',
          message: `Emailed ${data.data?.recipientCount ?? 0} people who took this class.`,
          color: 'green',
        })
        closeBlastModal()
        return data
      } else {
        showNotification({ title: 'Error', message: data.message, color: 'red' })
      }
    } catch {
      showNotification({ title: 'Error', message: 'Failed to send', color: 'red' })
    } finally {
      setSubmittingBlast(false)
    }
  }

  const blastExistingQuestion = () => {
    if (!blastQuestionId) return
    const cost = blastCost ?? QA_BLAST_COST_MIN
    if (karmaBalance !== null && karmaBalance < cost) {
      showNotification({ title: 'Insufficient karma', message: `Need ${cost} karma.`, color: 'red' })
      return
    }
    doBlast(blastQuestionId).then((result) => {
      const spent = result?.data?.karmaSpent
      if (typeof spent === 'number' && karmaBalance != null) setKarmaBalance(karmaBalance - spent)
    })
  }

  const postAnswer = async (questionId: string) => {
    const body = answerBodies[questionId]?.trim()
    if (!body) return
    setSubmittingA((prev) => ({ ...prev, [questionId]: true }))
    try {
      const res = await fetch(`/api/questions/${questionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          termTaken: (answerTerms[questionId] ?? termOptions[0]?.value) || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAnswerBodies((prev) => ({ ...prev, [questionId]: '' }))
        setAnswerTerms((prev) => ({ ...prev, [questionId]: termOptions[0]?.value ?? '' }))
        setQuestions((prev) =>
          prev.map((q) =>
            q._id === questionId
              ? {
                ...q,
                answers: [
                  ...(q.answers || []),
                  {
                    _id: data.data._id,
                    body: data.data.body,
                    termTaken: data.data.termTaken,
                    createdAt: data.data.createdAt,
                    upvotes: 0,
                    downvotes: 0,
                    userVote: 0,
                    authorAnonymousId: data.data.authorAnonymousId,
                    isAuthor: true,
                  },
                ],
              }
              : q
          )
        )
        setReplyOpen((prev) => ({ ...prev, [questionId]: false }))
        showNotification({ title: 'Success', message: 'Your answer has been posted.', color: 'green' })
      } else {
        showNotification({ title: 'Error', message: data.message, color: 'red' })
      }
    } catch {
      showNotification({ title: 'Error', message: 'Failed to post answer', color: 'red' })
    } finally {
      setSubmittingA((prev) => ({ ...prev, [questionId]: false }))
    }
  }

  const formatTermTaken = (term?: string) => {
    if (!term) return ''
    return isMitTermCode(term) ? formatTermDisplay(term) : term
  }

  const fetchQuestions = () => {
    if (!subjectNumber) return
    fetch(`/api/questions?subjectNumber=${encodeURIComponent(subjectNumber)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) setQuestions(data.data)
      })
  }

  const voteAnswer = async (questionId: string, answerId: string, vote: number) => {
    setVotingAnswerId(answerId)
    try {
      const res = await fetch(`/api/questions/${questionId}/answers/${answerId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      })
      const data = await res.json()
      if (data.success) fetchQuestions()
    } finally {
      setVotingAnswerId(null)
    }
  }

  const markSolved = async (questionId: string, solved: boolean) => {
    try {
      const res = await fetch(`/api/questions/${questionId}/solved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solved }),
      })
      const data = await res.json()
      if (data.success) {
        setQuestions((prev) =>
          prev.map((q) => (q._id === questionId ? { ...q, solvedAt: solved ? new Date().toISOString() : null } : q))
        )
        showNotification({ title: solved ? 'Success' : 'Success', message: solved ? 'Question marked as solved.' : 'Question unmarked.', color: 'green' })
      }
    } catch {
      showNotification({ title: 'Error', message: 'Failed to update', color: 'red' })
    }
  }

  if (!subjectNumber) return null

  return (
    <Box mt="xl">
      <Group justify="space-between" align="flex-end" mb="sm">
        <Box>
          <Title order={3}>Q&A</Title>
          <Text size="sm" c="dimmed">
            Ask and answer questions about this class. Shared across all offerings ({subjectNumber}).
          </Text>
        </Box>
        {status === 'authenticated' && (
          <Button leftSection={<IconMessageCircle size={16} />} onClick={openAskModal}>
            Ask a question
          </Button>
        )}
      </Group>

      {/* Ask question modal */}
      <Modal opened={askModalOpen} onClose={closeAskModal} title="Ask a question" size="md">
        <Stack gap="md">
          <Textarea
            placeholder="What would you like to ask about this class?"
            value={questionBody}
            onChange={(e) => setQuestionBody(e.target.value)}
            minRows={3}
          />
          <Switch
            label="Email everyone who took this class"
            description={
              blastEnabled
                ? `Costs ${blastCost != null ? blastCost : '…'} karma${recipientCount != null ? ` · ${recipientCount} people will receive it` : ''}`
                : undefined
            }
            checked={blastEnabled}
            onChange={(e) => setBlastEnabled(e.currentTarget.checked)}
            disabled={blastCost != null && karmaBalance !== null && karmaBalance < blastCost}
          />
          {karmaBalance !== null && (
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Your karma: {karmaBalance}
              </Text>
              {blastEnabled && blastCost != null && (
                <Text size="sm" fw={700} c="red">
                  -{blastCost}
                </Text>
              )}
            </Group>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeAskModal}>
              Cancel
            </Button>
            <Button
              onClick={postQuestion}
              loading={submitting}
              disabled={!questionBody.trim() || (blastEnabled && (blastCost == null || karmaBalance === null || karmaBalance < blastCost))}
            >
              Post
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Blast existing question modal */}
      <Modal opened={blastModalOpen} onClose={closeBlastModal} title="Send to class takers" size="md">
        <Stack gap="md">
          {blastQuestionId && (
            <>
              <Text size="sm" c="dimmed">
                Email your question to everyone who took this class. Costs {blastCost != null ? blastCost : '…'} karma.
                {karmaBalance !== null && <> You have {karmaBalance} karma.</>}
              </Text>
              {recipientCount != null && (
                <Text size="sm" fw={500}>
                  {recipientCount} {recipientCount === 1 ? 'person' : 'people'} will receive this email
                </Text>
              )}
              <Group justify="flex-end" gap="xs">
                <Button variant="default" onClick={closeBlastModal}>
                  Cancel
                </Button>
                <Button
                  leftSection={<IconMail size={16} />}
                  onClick={blastExistingQuestion}
                  loading={submittingBlast}
                  disabled={blastCost == null || (karmaBalance !== null && karmaBalance < blastCost)}
                >
                  Send ({blastCost != null ? blastCost : '…'} karma)
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      {loading ? (
        <Text c="dimmed">Loading questions...</Text>
      ) : questions.length === 0 ? (
        <Card withBorder padding="lg" radius="md">
          <Text c="dimmed" ta="center" py="md">
            No questions yet. Be the first to ask!
          </Text>
          {status === 'authenticated' && (
            <Group justify="center" mt="xs">
              <Button variant="light" size="sm" onClick={openAskModal}>
                Ask a question
              </Button>
            </Group>
          )}
        </Card>
      ) : (
        <Stack gap="md">
          {questions.map((q) => (
            <Card key={q._id} withBorder padding="md" radius="md">
              <Group justify="space-between" align="flex-start">
                <Box style={{ flex: 1 }}>
                  <Text fw={500}>{q.body}</Text>
                  <Group gap="xs" mt={6} align="center" wrap="wrap">
                    <Group gap={6} align="center">
                      <Avatar
                        size="sm"
                        radius="xl"
                        style={{ backgroundColor: hashToColor(q.authorAnonymousId), color: '#fff' }}
                      >
                        {getAnonLabel(q.authorAnonymousId).initial}
                      </Avatar>
                      <Text size="xs" c="dimmed">
                        {getAnonLabel(q.authorAnonymousId).name}
                        {' · '}
                        {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : ''}
                      </Text>
                    </Group>
                    {q.solvedAt && (
                      <Badge size="xs" variant="light" color="green">
                        Solved
                      </Badge>
                    )}
                    {q.blasted && (
                      <Badge size="xs" variant="light" color="gray">
                        Emailed
                      </Badge>
                    )}
                  </Group>
                </Box>
                {status === 'authenticated' && q.isAuthor && !q.blasted && (
                  <Tooltip label="Email this question to everyone who took this class (once per question)">
                    <ActionIcon
                      variant="light"
                      color="orange"
                      size="sm"
                      onClick={() => openBlastModal(q._id)}
                      disabled={karmaBalance !== null && karmaBalance < QA_BLAST_COST_MIN}
                    >
                      <IconMail size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {status === 'authenticated' && q.isAuthor && (
                  <Button
                    size="xs"
                    variant="light"
                    color={q.solvedAt ? 'gray' : 'green'}
                    onClick={() => markSolved(q._id, !q.solvedAt)}
                  >
                    {q.solvedAt ? 'Unmark solved' : 'Mark solved'}
                  </Button>
                )}
              </Group>

              {/* Answers */}
              <Stack gap="xs" mt="md">
                {(q.answers || []).map((a: Answer) => (
                  <Box key={a._id} pl="md" py="xs" style={{ borderLeft: '2px solid var(--mantine-color-gray-2)' }}>
                    <Text size="sm">{a.body}</Text>
                    <Group gap="xs" mt={6} align="center" wrap="nowrap">
                      <Group gap={6} align="center">
                        <Avatar
                          size="xs"
                          radius="xl"
                          style={{ backgroundColor: hashToColor(a.authorAnonymousId), color: '#fff', fontSize: 10 }}
                        >
                          {getAnonLabel(a.authorAnonymousId).initial}
                        </Avatar>
                        <Text size="xs" c="dimmed">
                          {getAnonLabel(a.authorAnonymousId).name}
                          {a.termTaken && ` · ${formatTermTaken(a.termTaken)}`}
                          {` · ${a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}`}
                        </Text>
                      </Group>
                      {status === 'authenticated' && !a.isAuthor && (
                        <Group gap={4} ml="auto">
                          <ActionIcon
                            size="xs"
                            variant={a.userVote === 1 ? 'filled' : 'subtle'}
                            color="green"
                            onClick={() => voteAnswer(q._id, a._id, a.userVote === 1 ? 0 : 1)}
                            loading={votingAnswerId === a._id}
                          >
                            <IconThumbUp size={12} />
                          </ActionIcon>
                          <Text size="xs" c="dimmed">
                            {(a.upvotes ?? 0) - (a.downvotes ?? 0)}
                          </Text>
                          <ActionIcon
                            size="xs"
                            variant={a.userVote === -1 ? 'filled' : 'subtle'}
                            color="red"
                            onClick={() => voteAnswer(q._id, a._id, a.userVote === -1 ? 0 : -1)}
                            loading={votingAnswerId === a._id}
                          >
                            <IconThumbDown size={12} />
                          </ActionIcon>
                        </Group>
                      )}
                      {status === 'authenticated' && a.isAuthor && (
                        <Text size="xs" c="dimmed" ml="auto">
                          {(a.upvotes ?? 0) - (a.downvotes ?? 0)} votes
                        </Text>
                      )}
                    </Group>
                  </Box>
                ))}
              </Stack>

              {/* Reply form - collapsible */}
              {status === 'authenticated' && (
                <Box mt="md">
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={replyOpen[q._id] ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    onClick={() => toggleReply(q._id)}
                  >
                    {replyOpen[q._id] ? 'Cancel' : 'Reply'}
                  </Button>
                  <Collapse in={!!replyOpen[q._id]}>
                    <Stack gap="xs" mt="sm">
                      <Textarea
                        placeholder="Your answer..."
                        value={answerBodies[q._id] ?? ''}
                        onChange={(e) => setAnswerBodies((prev) => ({ ...prev, [q._id]: e.target.value }))}
                        minRows={2}
                      />
                      {termOptions.length > 0 && (
                        <Select
                          label="When did you take this class?"
                          placeholder="Select term"
                          data={termOptions}
                          value={answerTerms[q._id] ?? termOptions[0]?.value ?? null}
                          onChange={(v) => setAnswerTerms((prev) => ({ ...prev, [q._id]: v ?? '' }))}
                          clearable
                          size="sm"
                        />
                      )}
                      <Button
                        size="sm"
                        onClick={() => postAnswer(q._id)}
                        loading={submittingA[q._id]}
                        disabled={!(answerBodies[q._id]?.trim())}
                      >
                        Post answer
                      </Button>
                    </Stack>
                  </Collapse>
                </Box>
              )}
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  )
}
