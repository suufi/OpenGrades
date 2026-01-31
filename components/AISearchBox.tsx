import { IClass } from '@/types'
import {
    Card,
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
    ThemeIcon,
    Collapse,
    Code,
    ScrollArea
} from '@mantine/core'
import { IconSend, IconStars, IconRobot, IconBrain, IconSparkles, IconBug, IconChevronDown, IconChevronUp } from '@tabler/icons'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import ReactMarkdown from 'react-markdown'
import { usePlausibleTracker } from '@/utils/plausible'

interface Message {
    role: 'user' | 'assistant'
    content: string
    courses?: Array<{ id: string; number: string; title: string }>
}

const AISearchBox = ({ fullPage = false, showDebugInfo = false }: { fullPage?: boolean; showDebugInfo?: boolean }) => {
    const router = useRouter()
    const plausible = usePlausibleTracker()
    const [query, setQuery] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState(false)
    const [thinkingMessage, setThinkingMessage] = useState('')
    const [reasoningContent, setReasoningContent] = useState('')
    const [streamingContent, setStreamingContent] = useState('')
    const [debugPrompt, setDebugPrompt] = useState('')
    const [debugClasses, setDebugClasses] = useState<Array<{ number: string; title: string; relevance: string }>>([])
    const [showDebug, setShowDebug] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, streamingContent, reasoningContent, loading])

    const handleSubmit = async () => {
        if (!query.trim() || loading) return

        const userMessage: Message = { role: 'user', content: query }
        setMessages(prev => [...prev, userMessage])
        setQuery('')
        setLoading(true)
        setStreamingContent('')
        setReasoningContent('')
        setThinkingMessage('Analyzing your question...')
        setDebugPrompt('')
        setDebugClasses([])

        // Track AI query for analytics
        plausible('AI Query', {
            props: {
                queryLength: query.length.toString(),
                isFollowUp: (messages.length > 0).toString()
            }
        })

        try {
            const response = await fetch('/api/search/rag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    conversationHistory: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                })
            })

            if (!response.ok) {
                throw new Error('Search failed')
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let assistantMessage: Message = { role: 'assistant', content: '' }
            let courses: Array<{ id: string; number: string; title: string }> = []

            while (reader) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6))

                            if (data.type === 'thinking') {
                                setThinkingMessage(data.content)
                            } else if (data.type === 'reasoning') {

                                setThinkingMessage('')
                                setReasoningContent(prev => prev + data.content)
                            } else if (data.type === 'full') {

                                setThinkingMessage('')
                                assistantMessage.content += data.content
                                setStreamingContent(assistantMessage.content)
                            } else if (data.type === 'chunk') {

                                setThinkingMessage('')
                                assistantMessage.content += data.content
                                setStreamingContent(assistantMessage.content)
                            } else if (data.type === 'courses') {
                                courses = data.content
                            } else if (data.type === 'debug_prompt') {
                                setDebugPrompt(data.content)
                            } else if (data.type === 'debug_classes') {
                                setDebugClasses(data.content)
                            } else if (data.type === 'done') {
                                assistantMessage.courses = courses
                                setMessages(prev => [...prev, assistantMessage])
                                setStreamingContent('')
                                setReasoningContent('')
                            } else if (data.type === 'error') {
                                throw new Error(data.content)
                            }
                        } catch (e) {
                            console.error('Parse error:', e)
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Search error:', error)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '❌ Sorry, I encountered an error while searching. Please try again.'
            }])
            setStreamingContent('')
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
        'Find me a challenging algorithms class',
        'What are good intro ML courses?',
        'Easy HASS classes for engineers',
        'Classes similar to 6.1210'
    ]

    return (
        <Stack gap="md" style={{ height: fullPage ? 'calc(100vh - 300px)' : 'auto' }}>
            {/* Debug Panel - only shown to users with trustLevel == 2 */}
            {showDebugInfo && (debugPrompt || debugClasses.length > 0) && (
                <Paper withBorder radius="md" p="md" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
                    <Group justify="space-between" mb={showDebug ? 'md' : 0}>
                        <Group gap="xs">
                            <ThemeIcon size="sm" variant="light" color="orange">
                                <IconBug size={14} />
                            </ThemeIcon>
                            <Text size="sm" fw={600} c="orange">Debug Info</Text>
                        </Group>
                        <ActionIcon
                            variant="subtle"
                            color="orange"
                            onClick={() => setShowDebug(!showDebug)}
                        >
                            {showDebug ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                        </ActionIcon>
                    </Group>
                    <Collapse in={showDebug}>
                        <Stack gap="md">
                            {debugClasses.length > 0 && (
                                <Box>
                                    <Text size="xs" fw={500} c="dimmed" mb="xs">Retrieved Classes:</Text>
                                    <Stack gap="xs">
                                        {debugClasses.map((cls, idx) => (
                                            <Paper key={idx} p="xs" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-5)' }}>
                                                <Group gap="xs">
                                                    <Badge size="sm" variant="filled" color="blue">{cls.number}</Badge>
                                                    <Text size="xs" c="white">{cls.title}</Text>
                                                </Group>
                                                <Text size="xs" c="dimmed" mt="xs" style={{ fontStyle: 'italic' }}>
                                                    {cls.relevance}
                                                </Text>
                                            </Paper>
                                        ))}
                                    </Stack>
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
            {messages.length === 0 && (
                <Paper p="lg" withBorder radius="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                    <Group gap="xs" mb="md">
                        <ThemeIcon size="sm" variant="light" color="blue">
                            <IconStars size={16} />
                        </ThemeIcon>
                        <Text fw={600} size="sm">Try asking:</Text>
                    </Group>
                    <Stack gap="xs">
                        {exampleQueries.map((example, idx) => (
                            <Button
                                key={idx}
                                variant="light"
                                size="sm"
                                onClick={() => setQuery(example)}
                                leftSection={<IconRobot size={16} />}
                                style={{ justifyContent: 'flex-start' }}
                            >
                                {example}
                            </Button>
                        ))}
                    </Stack>
                </Paper>
            )}

            <div style={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: fullPage ? 'calc(100vh - 450px)' : '400px'
            }}>
                <Stack gap="md">
                    {messages.map((message, idx) => (
                        <Paper
                            key={idx}
                            p="lg"
                            radius="md"
                            withBorder
                            style={{
                                backgroundColor: message.role === 'user'
                                    ? 'var(--mantine-color-blue-0)'
                                    : 'var(--mantine-color-gray-0)',
                                borderLeft: message.role === 'assistant'
                                    ? '3px solid var(--mantine-color-grape-6)'
                                    : '3px solid var(--mantine-color-blue-6)'
                            }}
                        >
                            <Group gap="xs" mb="sm">
                                <ThemeIcon
                                    size="sm"
                                    variant="light"
                                    color={message.role === 'user' ? 'blue' : 'grape'}
                                >
                                    {message.role === 'user' ? <IconStars size={14} /> : <IconBrain size={14} />}
                                </ThemeIcon>
                                <Text size="xs" fw={600} c="dimmed">
                                    {message.role === 'user' ? 'You' : 'AI Assistant'}
                                </Text>
                            </Group>
                            <div style={{
                                fontSize: '0.95rem',
                                lineHeight: '1.6'
                            }} className="markdown-content">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                            </div>

                            {message.courses && message.courses.length > 0 && (
                                <Box mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                                    <Text size="sm" fw={500} mb="xs">📚 Recommended Courses:</Text>
                                    <Group gap="xs">
                                        {message.courses.map((course) => (
                                            <Tooltip key={course.id} label={course.title}>
                                                <UnstyledButton
                                                    onClick={() => router.push(`/classes/${course.id}`)}
                                                >
                                                    <Badge
                                                        variant="light"
                                                        size="lg"
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {course.number}
                                                    </Badge>
                                                </UnstyledButton>
                                            </Tooltip>
                                        ))}
                                    </Group>
                                </Box>
                            )}
                        </Paper>
                    ))}

                    {loading && thinkingMessage && (
                        <Paper
                            p="lg"
                            radius="md"
                            withBorder
                            style={{
                                backgroundColor: 'var(--mantine-color-grape-0)',
                                borderLeft: '3px solid var(--mantine-color-grape-6)'
                            }}
                        >
                            <Group gap="sm">
                                <Loader size="sm" color="grape" />
                                <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                                    {thinkingMessage}
                                </Text>
                            </Group>
                        </Paper>
                    )}

                    {reasoningContent && (
                        <Paper
                            p="lg"
                            radius="md"
                            withBorder
                            style={{
                                backgroundColor: 'var(--mantine-color-yellow-0)',
                                borderLeft: '3px solid var(--mantine-color-yellow-6)'
                            }}
                        >
                            <Group gap="xs" mb="sm">
                                <ThemeIcon size="sm" variant="light" color="yellow">
                                    <IconBrain size={14} />
                                </ThemeIcon>
                                <Text size="xs" fw={600} c="dimmed">AI Reasoning</Text>
                            </Group>
                            <Text
                                size="xs"
                                c="dimmed"
                                style={{
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.6'
                                }}
                            >
                                {reasoningContent}
                            </Text>
                        </Paper>
                    )}

                    {streamingContent && (
                        <Paper
                            p="lg"
                            radius="md"
                            withBorder
                            style={{
                                backgroundColor: 'var(--mantine-color-gray-0)',
                                borderLeft: '3px solid var(--mantine-color-grape-6)'
                            }}
                        >
                            <Group gap="xs" mb="sm">
                                <ThemeIcon size="sm" variant="light" color="grape">
                                    <IconBrain size={14} />
                                </ThemeIcon>
                                <Text size="xs" fw={600} c="dimmed">AI Assistant</Text>
                            </Group>
                            <div style={{
                                fontSize: '0.95rem',
                                lineHeight: '1.6'
                            }} className="markdown-content">
                                <ReactMarkdown key={streamingContent.length}>{streamingContent}</ReactMarkdown>
                            </div>
                            <Group gap="xs" mt="sm">
                                <Loader size="xs" color="grape" />
                                <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>typing...</Text>
                            </Group>
                        </Paper>
                    )}

                    <div ref={messagesEndRef} />
                </Stack>
            </div>

            <Paper p="md" withBorder radius="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                <Group gap="xs" align="flex-end">
                    <Textarea
                        placeholder="Ask about MIT courses... (Shift+Enter for new line)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        minRows={2}
                        maxRows={4}
                        style={{ flex: 1 }}
                        styles={{
                            input: {
                                border: 'none',
                                backgroundColor: 'white'
                            }
                        }}
                    />
                    <ActionIcon
                        size="xl"
                        radius="md"
                        variant="filled"
                        color="blue"
                        onClick={handleSubmit}
                        disabled={!query.trim() || loading}
                        loading={loading}
                    >
                        <IconSend size={20} />
                    </ActionIcon>
                </Group>
            </Paper>
        </Stack>
    )
}

export default AISearchBox
