import {
    TextInput,
    Select,
    Button,
    Group,
    Stack,
    Text,
    Paper,
    Anchor,
    Badge,
    Alert
} from '@mantine/core'
import { IconKey, IconCheck, IconX, IconInfoCircle, IconShieldLock } from '@tabler/icons-react'
import { useState, useEffect } from 'react'
import { showNotification } from '@mantine/notifications'

const PARLEY_MODELS = [
    {
        group: 'Free',
        items: [
            { value: 'llama-4-maverick', label: 'Llama 4 Maverick — Free' }
        ]
    },
    {
        group: 'Budget',
        items: [
            { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano — $0.20 / $1.25' },
            { value: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash — $0.50 / $3' },
            { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini — $0.75 / $4.50' },
            { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5 — $1 / $5' }
        ]
    },
    {
        group: 'Recommended',
        items: [
            { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Recommended) — $2 / $10' }
        ]
    },
    {
        group: 'Standard',
        items: [
            { value: 'gpt-5.4', label: 'GPT-5.4 — $2.50 / $15' },
            { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6 — $3 / $15' },
            { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro — $4 / $18' }
        ]
    }
]

const ParleySettings = ({ onSettingsChange, embedded = false }: { onSettingsChange?: () => void; embedded?: boolean }) => {
    const [apiKey, setApiKey] = useState('')
    const [model, setModel] = useState<string>('claude-sonnet-5')
    const [testing, setTesting] = useState(false)
    const [isConfigured, setIsConfigured] = useState(false)

    useEffect(() => {
        const savedKey = localStorage.getItem('parleyApiKey') || ''
        const savedModel = localStorage.getItem('parleyModel') || 'claude-sonnet-5'
        setApiKey(savedKey)
        setModel(savedModel)
        setIsConfigured(Boolean(savedKey))
    }, [])

    const handleSave = () => {
        if (!apiKey.trim()) {
            showNotification({
                title: 'API key required',
                message: 'Please enter your Parley API key',
                color: 'red'
            })
            return
        }

        localStorage.setItem('parleyApiKey', apiKey.trim())
        localStorage.setItem('parleyModel', model)
        setIsConfigured(true)
        showNotification({
            title: 'Parley configured',
            message: `Using ${PARLEY_MODELS.flatMap(g => g.items).find(m => m.value === model)?.label || model}. Your key is stored locally in your browser only.`,
            color: 'green',
            icon: <IconCheck size={16} />
        })
        onSettingsChange?.()
    }

    const handleClear = () => {
        localStorage.removeItem('parleyApiKey')
        localStorage.removeItem('parleyModel')
        setApiKey('')
        setModel('claude-sonnet-5')
        setIsConfigured(false)
        showNotification({
            title: 'Parley disconnected',
            message: 'Switched back to the default AI model',
            color: 'gray'
        })
        onSettingsChange?.()
    }

    const handleTest = async () => {
        if (!apiKey.trim()) {
            showNotification({
                title: 'API key required',
                message: 'Enter your API key first',
                color: 'red'
            })
            return
        }

        setTesting(true)
        try {
            const response = await fetch('https://platform.parley.mit.edu/api/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
            })

            if (response.ok) {
                showNotification({
                    title: 'Connection successful',
                    message: 'Your Parley API key is valid',
                    color: 'green',
                    icon: <IconCheck size={16} />
                })
            } else if (response.status === 401 || response.status === 403) {
                showNotification({
                    title: 'Invalid API key',
                    message: 'Please check your key at platform.parley.mit.edu',
                    color: 'red',
                    icon: <IconX size={16} />
                })
            } else {
                showNotification({
                    title: 'Connection issue',
                    message: `Parley returned status ${response.status}`,
                    color: 'orange'
                })
            }
        } catch {
            showNotification({
                title: 'Connection failed',
                    message: 'Could not reach the Parley API. Check your network connection.',
                color: 'red'
            })
        } finally {
            setTesting(false)
        }
    }

    return (
        <Paper withBorder={!embedded} radius="md" p={embedded ? 0 : 'md'} shadow={embedded ? undefined : 'xs'}>
            <Stack gap="sm">
                <Group justify="space-between">
                    <Group gap="xs">
                        <IconKey size={18} />
                        <Text fw={600} size="sm">MIT Parley</Text>
                    </Group>
                    {isConfigured && (
                        <Badge variant="light" color="green" size="sm">
                            Connected
                        </Badge>
                    )}
                </Group>

                <Text size="xs" c="dimmed">
                    Use your own{' '}
                    <Anchor href="https://platform.parley.mit.edu" target="_blank" size="xs">
                        MIT Parley
                    </Anchor>
                    {' '}API key to power AI search with cloud models like Claude and GPT.
                    Prices shown are per 1M tokens (input / output).
                </Text>

                <Alert
                    variant="light"
                    color="blue"
                    icon={<IconShieldLock size={16} />}
                    p="xs"
                >
                    <Text size="xs">
                        Your API key is stored only in your browser's local storage and is never saved on our servers.
                        It is sent directly to Parley's API for each request.
                    </Text>
                </Alert>

                <TextInput
                    label="API Key"
                    placeholder="sk-parkey-..."
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    size="sm"
                />

                <Select
                    label="Model"
                    data={PARLEY_MODELS}
                    value={model}
                    onChange={(val) => setModel(val || 'claude-sonnet-5')}
                    size="sm"
                />

                <Group gap="xs" justify="flex-end">
                    <Button
                        variant="subtle"
                        size="xs"
                        onClick={handleTest}
                        loading={testing}
                    >
                        Test Connection
                    </Button>
                    {isConfigured && (
                        <Button
                            variant="light"
                            color="red"
                            size="xs"
                            onClick={handleClear}
                        >
                            Disconnect
                        </Button>
                    )}
                    <Button
                        size="xs"
                        color="brick"
                        onClick={handleSave}
                        disabled={!apiKey.trim()}
                    >
                        {isConfigured ? 'Update' : 'Save'}
                    </Button>
                </Group>
            </Stack>
        </Paper>
    )
}

export default ParleySettings
