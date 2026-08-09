import {
    Text,
    Textarea,
    Button,
    Stack,
    Group,
    Badge,
    Loader,
    Paper,
    ActionIcon,
    Tooltip,
    UnstyledButton,
    Box,
    Collapse,
    Code,
    ScrollArea,
    Modal,
    Select,
    TextInput
} from '@mantine/core'
import {
    IconBrain,
    IconBug,
    IconChevronDown,
    IconChevronUp,
    IconMessages,
    IconPencil,
    IconPlus,
    IconSend
} from '@tabler/icons-react'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { showNotification } from '@mantine/notifications'
import { createMitCourseNumberRegex, normalizeCourseNumber } from '@/utils/courseNumbers'
import { splitThinkingContent } from '@/utils/llmThinking'
import { usePlausibleTracker } from '@/utils/plausible'
import classes from '@/styles/AISearchBox.module.css'

interface Message {
    role: 'user' | 'assistant'
    content: string
    reasoning?: string
    courses?: Array<{ id: string; number: string; title: string; institution?: string }>
}

type CourseRef = { id: string; number: string; title: string; institution?: string }

type ConversationSummary = {
    id: string
    title: string
    messageCount: number
    createdAt?: string
    updatedAt?: string
}

function CourseChips({
    courses,
    onNavigate,
    divider = true,
}: {
    courses: CourseRef[]
    onNavigate: (id: string) => void
    divider?: boolean
}) {
    if (courses.length === 0) return null

    return (
        <div className={`${classes.courseChips} ${divider ? '' : classes.courseChipsFlat}`}>
            <Text size="xs" fw={600} c="dimmed" className={classes.courseChipsLabel}>
                Suggested courses
            </Text>
            <Group gap="xs">
                {courses.map((course) => (
                    <Tooltip key={course.id} label={course.title} withArrow>
                        <Badge
                            component="button"
                            type="button"
                            variant="light"
                            color={course.institution === 'harvard' ? 'blue' : 'brick'}
                            size="lg"
                            className={classes.courseChip}
                            onClick={() => onNavigate(course.id)}
                        >
                            {course.number}
                            {course.institution === 'harvard' ? ' · H' : ''}
                        </Badge>
                    </Tooltip>
                ))}
            </Group>
        </div>
    )
}

function linkifyCourseNumbers(
    text: string,
    courseMap: Map<string, { id: string; number: string; title: string }>,
    router: any
): React.ReactNode[] {
    if (!text || courseMap.size === 0) return [text]

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    const regex = createMitCourseNumberRegex('g')
    while ((match = regex.exec(text)) !== null) {
        const courseNum = normalizeCourseNumber(match[0])
        const courseInfo = courseMap.get(courseNum)

        if (courseInfo) {
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index))
            }

            parts.push(
                <Tooltip key={`${courseInfo.id}-${match.index}`} label={courseInfo.title} withArrow>
                    <Badge
                        component="button"
                        variant="light"
                        color="brick"
                        size="sm"
                        style={{
                            cursor: 'pointer',
                            verticalAlign: 'baseline',
                            fontWeight: 600
                        }}
                        onClick={(e: React.MouseEvent) => {
                            e.preventDefault()
                            e.stopPropagation()
                            router.push(`/classes/${courseInfo.id}`)
                        }}
                    >
                        {courseNum}
                    </Badge>
                </Tooltip>
            )
            lastIndex = match.index + match[0].length
        }
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
}

function splitThinkBlock(content: string): { think: string; visible: string } {
    return splitThinkingContent(content)
}

function resolveMessageParts(content: string, reasoning?: string): { think: string; visible: string } {
    const split = splitThinkBlock(content)
    if (split.visible || !content) {
        return { think: reasoning || split.think, visible: split.visible }
    }
    return { think: '', visible: split.think || content }
}

const ThinkBlock = ({ content, isStreaming, components }: { content: string, isStreaming?: boolean, components: any }) => {
    const [expanded, setExpanded] = useState(false)

    if (!content.trim()) return null

    return (
        <Paper
            p="xs"
            radius="md"
            withBorder
            className={classes.thinkingCard}
        >
            <UnstyledButton onClick={() => setExpanded(!expanded)} style={{ width: '100%', display: 'block' }}>
                <Group justify="space-between">
                    <Group gap="xs">
                        {isStreaming ? <Loader size="xs" color="gray" /> : <IconBrain size={14} color="var(--app-text-subtle)" />}
                        <Text size="xs" fw={600} c="dimmed">
                            {isStreaming ? 'Reasoning...' : 'Reasoning'}
                        </Text>
                    </Group>
                    <ActionIcon size="xs" variant="subtle" color="gray" component="div">
                        {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    </ActionIcon>
                </Group>
            </UnstyledButton>

            <Collapse expanded={expanded}>
                <Box mt="xs" pt="xs" style={{
                    borderTop: '1px dashed var(--app-border-strong)',
                    fontSize: '0.8rem',
                    lineHeight: '1.5',
                    fontFamily: 'monospace',
                    color: 'var(--app-text-muted)'
                }}>
                    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </Box>
            </Collapse>
        </Paper>
    )
}

const AISearchBox = ({
    fullPage = false,
    showDebugInfo = false
}: {
    fullPage?: boolean
    showDebugInfo?: boolean
}) => {
    const router = useRouter()
    const plausible = usePlausibleTracker()
    const [query, setQuery] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [conversations, setConversations] = useState<ConversationSummary[]>([])
    const [historyLoading, setHistoryLoading] = useState(true)
    const [creatingConversation, setCreatingConversation] = useState(false)
    const [switchingConversation, setSwitchingConversation] = useState(false)
    const [savingName, setSavingName] = useState(false)
    const [nameDialogMode, setNameDialogMode] = useState<'new' | 'rename' | null>(null)
    const [conversationName, setConversationName] = useState('')
    const [loading, setLoading] = useState(false)
    const [thinkingMessage, setThinkingMessage] = useState('')
    const [reasoningContent, setReasoningContent] = useState('')
    const [streamingContent, setStreamingContent] = useState('')
    const [streamingCourses, setStreamingCourses] = useState<Array<{ id: string; number: string; title: string; institution?: string }>>([])
    const [debugPrompt, setDebugPrompt] = useState('')
    const [debugClasses, setDebugClasses] = useState<Array<{ number: string; title: string; relevance: string }>>([])
    const [debugLlm, setDebugLlm] = useState<{ provider?: string; model?: string; rerankerLatencyMs?: number; advisorLatencyMs?: number; totalTokens?: number } | null>(null)
    const [showDebug, setShowDebug] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<HTMLTextAreaElement>(null)
    const sessionRequestRef = useRef<AbortController | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        const restoreConversation = async () => {
            try {
                const response = await fetch('/api/search/conversations', {
                    method: 'GET',
                    signal: controller.signal
                })
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}))
                    throw new Error(error.message || 'Could not load saved conversation')
                }

                const result = await response.json()
                setConversations(Array.isArray(result.conversations) ? result.conversations : [])
                if (!result.conversation) return

                setConversationId(result.conversation.id)
                setMessages(Array.isArray(result.conversation.messages)
                    ? result.conversation.messages
                    : [])
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                console.error('Failed to restore AI search conversation:', error)
                showNotification({
                    title: 'Conversation history unavailable',
                    message: error instanceof Error ? error.message : 'Could not load your saved conversation.',
                    color: 'red'
                })
            } finally {
                if (!controller.signal.aborted) setHistoryLoading(false)
            }
        }

        restoreConversation()
        return () => {
            controller.abort()
            sessionRequestRef.current?.abort()
        }
    }, [])

    const getParleyConfig = () => {
        if (typeof window === 'undefined') return { apiKey: '', model: '' }
        return {
            apiKey: localStorage.getItem('parleyApiKey') || '',
            model: localStorage.getItem('parleyModel') || 'claude-sonnet-5'
        }
    }

    const clearTransientState = useCallback(() => {
        setQuery('')
        setStreamingContent('')
        setStreamingCourses([])
        setReasoningContent('')
        setThinkingMessage('')
        setDebugPrompt('')
        setDebugClasses([])
        setDebugLlm(null)
        setShowDebug(false)
    }, [])

    const upsertConversation = useCallback((summary: ConversationSummary) => {
        setConversations(previous => {
            const withoutCurrent = previous.filter(item => item.id !== summary.id)
            return [summary, ...withoutCurrent]
        })
    }, [])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, streamingContent, reasoningContent, loading])

    const buildMarkdownComponents = useCallback((
        courseMap: Map<string, { id: string; number: string; title: string }>
    ) => {
        const processChildren = (children: React.ReactNode) => {
            if (Array.isArray(children)) {
                return children.map((child, i) =>
                    typeof child === 'string'
                        ? <span key={i}>{linkifyCourseNumbers(child, courseMap, router)}</span>
                        : child
                )
            }
            if (typeof children === 'string') {
                return linkifyCourseNumbers(children, courseMap, router)
            }
            return children
        }

        return {
            p: ({ children, ...props }: any) => <p {...props}>{processChildren(children)}</p>,
            strong: ({ children, ...props }: any) => <strong {...props}>{processChildren(children)}</strong>,
            li: ({ children, ...props }: any) => <li {...props}>{processChildren(children)}</li>,
            em: ({ children, ...props }: any) => <em {...props}>{processChildren(children)}</em>
        }
    }, [router])

    const handleSubmit = async () => {
        if (!query.trim() || loading || historyLoading || creatingConversation || switchingConversation || savingName) return

        const userMessage: Message = { role: 'user', content: query }
        setMessages(prev => [...prev, userMessage])
        setQuery('')
        setLoading(true)
        setStreamingContent('')
        setStreamingCourses([])
        setReasoningContent('')
        setThinkingMessage('Reviewing your request...')
        setDebugPrompt('')
        setDebugClasses([])

        // Track AI query for analytics
        const parley = getParleyConfig()
        const useParley = Boolean(parley.apiKey)
        plausible('AI Query', {
            props: {
                queryLength: query.length.toString(),
                isFollowUp: (messages.length > 0).toString(),
                provider: useParley ? 'parley' : 'default',
                model: useParley ? parley.model : 'default'
            }
        })

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' }
            if (useParley) {
                headers['x-parley-api-key'] = parley.apiKey
                headers['x-parley-model'] = parley.model
            }

            const response = await fetch('/api/search/rag', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    query,
                    conversationId
                })
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Search failed')
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let assistantMessage: Message = { role: 'assistant', content: '' }
            let courses: CourseRef[] = []
            let streamError: Error | null = null
            let streamReasoning = ''
            let sseBuffer = ''
            let activeResponseConversationId = conversationId

            while (reader) {
                const { done, value } = await reader.read()
                if (done) break

                sseBuffer += decoder.decode(value, { stream: true })
                const lines = sseBuffer.split('\n')
                sseBuffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue

                    let data: { type?: string; content?: unknown }
                    try {
                        data = JSON.parse(line.substring(6))
                    } catch {
                        continue
                    }

                    if (data.type === 'thinking') {
                        setThinkingMessage(String(data.content || ''))
                    } else if (data.type === 'conversation') {
                        const nextConversation = data.content as { id?: string; title?: string } | undefined
                        if (nextConversation?.id) {
                            activeResponseConversationId = nextConversation.id
                            setConversationId(nextConversation.id)
                            upsertConversation({
                                id: nextConversation.id,
                                title: nextConversation.title || 'New course search',
                                messageCount: messages.length + 1,
                                updatedAt: new Date().toISOString()
                            })
                        }
                    } else if (data.type === 'reasoning') {
                        setThinkingMessage('')
                        streamReasoning = String(data.content || '')
                        setReasoningContent(streamReasoning)
                    } else if (data.type === 'full') {
                        setThinkingMessage('')
                        assistantMessage.content = String(data.content || '')
                        setStreamingContent(assistantMessage.content)
                    } else if (data.type === 'courses') {
                        courses = Array.isArray(data.content) ? data.content as typeof courses : []
                        setStreamingCourses(courses)
                    } else if (data.type === 'debug_prompt') {
                        setDebugPrompt(String(data.content || ''))
                    } else if (data.type === 'debug_classes') {
                        setDebugClasses((data.content || []) as Array<{ number: string; title: string; relevance: string }>)
                    } else if (data.type === 'debug_llm') {
                        setDebugLlm(data.content)
                    } else if (data.type === 'done') {
                        assistantMessage.courses = courses
                        if (streamReasoning) {
                            assistantMessage.reasoning = streamReasoning
                        }
                        setMessages(prev => [...prev, assistantMessage])
                        setStreamingContent('')
                        setStreamingCourses([])
                        setReasoningContent('')
                        streamReasoning = ''
                        if (activeResponseConversationId) {
                            setConversations(previous => previous.map(item => (
                                item.id === activeResponseConversationId
                                    ? { ...item, messageCount: messages.length + 2, updatedAt: new Date().toISOString() }
                                    : item
                            )))
                        }
                    } else if (data.type === 'error') {
                        streamError = new Error(String(data.content || 'An error occurred while generating the response'))
                        break
                    }
                }

                if (streamError) break
            }

            if (streamError) {
                throw streamError
            }
        } catch (error) {
            console.error('Search error:', error)
            const message = error instanceof Error ? error.message : 'I ran into an error while searching. Please try again.'
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: message
            }])
            setStreamingContent('')
            setStreamingCourses([])
            setReasoningContent('')
        } finally {
            setLoading(false)
            setThinkingMessage('')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    const exampleQueries = [
        'A good first machine learning class after 18.06',
        'A challenging algorithms class with real project work',
        'A lighter HASS to balance a pset-heavy semester',
        'Classes like 6.1210 but more applied'
    ]

    const createConversation = async () => {
        if (loading || creatingConversation) return
        const title = conversationName.replace(/\s+/g, ' ').trim()
        if (!title) return
        setCreatingConversation(true)

        try {
            const response = await fetch('/api/search/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title })
            })
            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Could not start a new conversation')
            }

            const result = await response.json()
            setConversationId(result.conversation.id)
            setMessages([])
            upsertConversation(result.summary)
            clearTransientState()
            setNameDialogMode(null)
            setConversationName('')
            requestAnimationFrame(() => composerRef.current?.focus())
        } catch (error) {
            console.error('Failed to start a new AI search conversation:', error)
            showNotification({
                title: 'Could not create chat',
                message: error instanceof Error ? error.message : 'Please try again.',
                color: 'red'
            })
        } finally {
            setCreatingConversation(false)
        }
    }

    const switchConversation = async (nextId: string | null) => {
        if (!nextId || nextId === conversationId || loading || creatingConversation || switchingConversation) return

        sessionRequestRef.current?.abort()
        const controller = new AbortController()
        sessionRequestRef.current = controller
        setSwitchingConversation(true)

        try {
            const response = await fetch(`/api/search/conversations?id=${encodeURIComponent(nextId)}`, {
                method: 'GET',
                signal: controller.signal
            })
            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Could not load that conversation')
            }

            const result = await response.json()
            if (!result.conversation) throw new Error('Conversation not found')

            setConversationId(result.conversation.id)
            setMessages(Array.isArray(result.conversation.messages) ? result.conversation.messages : [])
            setConversations(Array.isArray(result.conversations) ? result.conversations : conversations)
            clearTransientState()
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return
            console.error('Failed to switch AI search conversation:', error)
            showNotification({
                title: 'Could not open chat',
                message: error instanceof Error ? error.message : 'Please try again.',
                color: 'red'
            })
        } finally {
            if (!controller.signal.aborted) setSwitchingConversation(false)
        }
    }

    const renameConversation = async () => {
        const title = conversationName.replace(/\s+/g, ' ').trim()
        if (!conversationId || !title || loading || savingName) return
        setSavingName(true)

        try {
            const response = await fetch('/api/search/conversations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: conversationId, title })
            })
            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Could not rename this conversation')
            }

            const result = await response.json()
            upsertConversation(result.summary)
            setNameDialogMode(null)
            setConversationName('')
        } catch (error) {
            console.error('Failed to rename AI search conversation:', error)
            showNotification({
                title: 'Could not rename chat',
                message: error instanceof Error ? error.message : 'Please try again.',
                color: 'red'
            })
        } finally {
            setSavingName(false)
        }
    }

    const openNameDialog = (mode: 'new' | 'rename') => {
        setConversationName(mode === 'rename'
            ? conversations.find(item => item.id === conversationId)?.title || ''
            : '')
        setNameDialogMode(mode)
    }

    const submitNameDialog = () => {
        if (nameDialogMode === 'new') createConversation()
        if (nameDialogMode === 'rename') renameConversation()
    }

    const selectExample = (example: string) => {
        setQuery(example)
        requestAnimationFrame(() => composerRef.current?.focus())
    }

    const composer = (prominent = false) => (
        <div className={`${classes.composer} ${prominent ? classes.composerProminent : ''}`}>
            <Textarea
                ref={composerRef}
                aria-label="Describe the class you are looking for"
                placeholder="Describe a class — topic, workload, pace, or how it's taught"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || historyLoading || creatingConversation || switchingConversation || savingName}
                minRows={prominent ? 2 : 1}
                maxRows={6}
                autosize
                classNames={{ input: classes.composerInput }}
            />
            <div className={classes.composerFooter}>
                <Text className={classes.keyboardHint}>Enter to search · Shift+Enter for a new line</Text>
                <Button
                    rightSection={<IconSend size={16} />}
                    color="brick"
                    onClick={handleSubmit}
                    disabled={!query.trim() || loading || historyLoading || creatingConversation || switchingConversation || savingName}
                    loading={loading}
                    className={classes.submitButton}
                >
                    Search
                </Button>
            </div>
        </div>
    )

    const streamingCourseMap = useMemo(() => {
        const map = new Map<string, { id: string; number: string; title: string }>()
        for (const c of streamingCourses) {
            map.set(normalizeCourseNumber(c.number), c)
        }
        return map
    }, [streamingCourses])

    const streamingMarkdownComponents = useMemo(
        () => buildMarkdownComponents(streamingCourseMap),
        [streamingCourseMap, buildMarkdownComponents]
    )

    const streamingSplit = useMemo(
        () => resolveMessageParts(streamingContent, reasoningContent),
        [streamingContent, reasoningContent]
    )
    const streamingThink = streamingSplit.think
    const sessionBusy = loading || creatingConversation || switchingConversation || savingName
    const conversationOptions = conversations.map(item => ({
        value: item.id,
        label: item.title
    }))

    if (historyLoading) {
        return (
            <Stack gap="md" className={`${classes.shell} ${fullPage ? classes.shellFullPage : ''}`}>
                <Group justify="center" py="xl" gap="sm">
                    <Loader size="sm" color="gray" />
                    <Text size="sm" c="dimmed">Loading your saved conversation…</Text>
                </Group>
            </Stack>
        )
    }

    return (
        <Stack gap="md" className={`${classes.shell} ${fullPage ? classes.shellFullPage : ''}`}>
            <Modal
                opened={nameDialogMode !== null}
                onClose={() => {
                    if (creatingConversation || savingName) return
                    setNameDialogMode(null)
                    setConversationName('')
                }}
                title={nameDialogMode === 'rename' ? 'Rename chat' : 'New chat'}
                centered
                size="sm"
            >
                <Stack gap="md">
                    <TextInput
                        label="Chat name"
                        placeholder="e.g. Fall ML course planning"
                        value={conversationName}
                        onChange={(event) => setConversationName(event.currentTarget.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                submitNameDialog()
                            }
                        }}
                        maxLength={120}
                        autoFocus
                        disabled={creatingConversation || savingName}
                    />
                    <Group justify="flex-end" gap="sm">
                        <Button
                            variant="default"
                            onClick={() => setNameDialogMode(null)}
                            disabled={creatingConversation || savingName}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="brick"
                            onClick={submitNameDialog}
                            disabled={!conversationName.trim()}
                            loading={creatingConversation || savingName}
                        >
                            {nameDialogMode === 'rename' ? 'Save name' : 'Create chat'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {(conversations.length > 0 || conversationId) && (
            <div className={classes.sessionBar}>
                <Select
                    aria-label="Saved chats"
                    leftSection={<IconMessages size={16} />}
                    placeholder={conversations.length > 0 ? 'Select a saved chat' : 'No saved chats yet'}
                    value={conversationId}
                    data={conversationOptions}
                    onChange={switchConversation}
                    searchable
                    clearable={false}
                    allowDeselect={false}
                    disabled={sessionBusy}
                    className={classes.sessionSelect}
                    nothingFoundMessage="No chats found"
                />
                <Group gap="xs" className={classes.sessionActions}>
                    <Button
                        variant="default"
                        size="compact-sm"
                        leftSection={<IconPencil size={15} />}
                        onClick={() => openNameDialog('rename')}
                        disabled={!conversationId || sessionBusy}
                    >
                        Rename
                    </Button>
                    <Button
                        variant="light"
                        color="brick"
                        size="compact-sm"
                        leftSection={<IconPlus size={15} />}
                        onClick={() => openNameDialog('new')}
                        disabled={sessionBusy}
                    >
                        New chat
                    </Button>
                </Group>
            </div>
            )}

            {showDebugInfo && (debugPrompt || debugClasses.length > 0) && (
                <Paper withBorder radius="md" p="md" className={classes.debugPanel}>
                    <Group justify="space-between" mb={showDebug ? 'md' : 0}>
                        <Group gap="xs">
                            <IconBug size={14} color="var(--app-accent-strong)" />
                            <Text size="sm" fw={600} c="dimmed">Debug details</Text>
                        </Group>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={() => setShowDebug(!showDebug)}
                        >
                            {showDebug ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                        </ActionIcon>
                    </Group>
                    <Collapse expanded={showDebug}>
                        <Stack gap="md">
                            {debugClasses.length > 0 && (
                                <Box>
                                    <Text size="xs" fw={500} c="dimmed" mb="xs">Retrieved classes</Text>
                                    <Group gap="xs">
                                        {debugClasses.map((cls, idx) => (
                                            <Tooltip key={idx} label={cls.relevance}>
                                                <Badge size="sm" variant="light" color="brick">{cls.number}</Badge>
                                            </Tooltip>
                                        ))}
                                    </Group>
                                </Box>
                            )}
                            {debugPrompt && (
                                <Box>
                                    <Text size="xs" fw={500} c="dimmed" mb="xs">Input Prompt:</Text>
                                    <ScrollArea h={200}>
                                        <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem' }}>
                                            {debugPrompt}
                                        </Code>
                                    </ScrollArea>
                                </Box>
                            )}
                        </Stack>
                    </Collapse>
                </Paper>
            )}
            {messages.length === 0 && !loading ? (
                <div className={classes.emptyState}>
                    {composer(true)}
                    <div className={classes.suggestions}>
                        <Text className={classes.suggestionsLabel}>Try</Text>
                        <div className={classes.exampleRow}>
                            {exampleQueries.map((example) => (
                                <UnstyledButton
                                    key={example}
                                    className={classes.exampleButton}
                                    onClick={() => selectExample(example)}
                                >
                                    {example}
                                </UnstyledButton>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className={classes.messagesFrame}>
                        <div className={`${classes.messagesScroll} ${fullPage ? classes.messagesScrollFullPage : ''}`}>
                            <Stack gap="md">
                                {messages.map((message, idx) => {
                                    const messageCourseMap = new Map<string, { id: string; number: string; title: string }>()
                                    if (message.courses) {
                                        for (const c of message.courses) {
                                            messageCourseMap.set(normalizeCourseNumber(c.number), c)
                                        }
                                    }
                                    const messageComponents = buildMarkdownComponents(messageCourseMap)
                                    const { think, visible } = resolveMessageParts(message.content, message.reasoning)

                                    return (
                                        <div
                                            key={idx}
                                            className={`${classes.messageRow} ${message.role === 'user' ? classes.messageRowUser : classes.messageRowAssistant}`}
                                        >
                                            <Paper
                                                className={`${classes.messageBubble} ${message.role === 'user' ? classes.messageBubbleUser : classes.messageBubbleAssistant}`}
                                            >
                                                <Stack gap="xs">
                                                    {message.role === 'assistant' && think && (
                                                        <ThinkBlock content={think} components={messageComponents} />
                                                    )}
                                                    {visible && (
                                                        <div
                                                            className={`markdown-content ${classes.messageContent} ${message.role === 'user' ? classes.messageContentUser : ''}`}
                                                        >
                                                            <ReactMarkdown components={messageComponents} remarkPlugins={[remarkGfm]}>
                                                                {visible}
                                                            </ReactMarkdown>
                                                        </div>
                                                    )}
                                                </Stack>

                                                {message.role === 'assistant' && message.courses && message.courses.length > 0 && (
                                                    <CourseChips
                                                        courses={message.courses}
                                                        onNavigate={(id) => router.push(`/classes/${id}`)}
                                                    />
                                                )}
                                            </Paper>
                                        </div>
                                    )
                                })}

                                {loading && thinkingMessage && !streamingContent && !reasoningContent && (
                                    <div className={`${classes.messageRow} ${classes.messageRowAssistant}`}>
                                        <Paper className={`${classes.messageBubble} ${classes.messageBubbleAssistant}`}>
                                            <Group gap="sm">
                                                <Loader size="sm" color="gray" />
                                                <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                                                    {thinkingMessage}
                                                </Text>
                                            </Group>
                                        </Paper>
                                    </div>
                                )}

                                {(streamingContent || reasoningContent || (loading && streamingCourses.length > 0)) && (
                                    <div className={`${classes.messageRow} ${classes.messageRowAssistant}`}>
                                        <Paper className={`${classes.messageBubble} ${classes.messageBubbleAssistant}`}>
                                            <Stack gap="xs">
                                                {streamingThink && (
                                                    <ThinkBlock
                                                        content={streamingThink}
                                                        isStreaming={!streamingSplit.visible}
                                                        components={streamingMarkdownComponents}
                                                    />
                                                )}
                                                {streamingSplit.visible && (
                                                    <div className={`markdown-content ${classes.messageContent}`}>
                                                        <ReactMarkdown
                                                            components={streamingMarkdownComponents}
                                                            remarkPlugins={[remarkGfm]}
                                                        >
                                                            {streamingSplit.visible}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </Stack>
                                            {streamingCourses.length > 0 && (
                                                <CourseChips
                                                    courses={streamingCourses}
                                                    onNavigate={(id) => router.push(`/classes/${id}`)}
                                                    divider={Boolean(streamingThink || streamingSplit.visible)}
                                                />
                                            )}
                                            {loading && streamingContent && (
                                                <Group gap="xs" mt="sm">
                                                    <Loader size="xs" color="gray" />
                                                    <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Finishing up...</Text>
                                                </Group>
                                            )}
                                        </Paper>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </Stack>
                        </div>
                    </div>
                    {composer(false)}
                </>
            )}
        </Stack>
    )
}

export default AISearchBox
