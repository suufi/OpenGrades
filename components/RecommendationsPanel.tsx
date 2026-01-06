// @ts-nocheck
import { IClass } from '@/types'
import {
    Card,
    Text,
    Title,
    Stack,
    Group,
    Badge,
    UnstyledButton,
    Loader,
    Center,
    Accordion,
    Tooltip,
    Button
} from '@mantine/core'
import { IconStars, IconUsers, IconBook, IconArrowRight } from '@tabler/icons'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { usePlausibleTracker } from '@/utils/plausible'

interface Recommendation {
    class: IClass
    score: number
    reason: string
}

interface RecommendationGroup {
    type: string
    title: string
    description: string
    items: Recommendation[]
}

const RecommendationsPanel = () => {
    const router = useRouter()
    const plausible = usePlausibleTracker()
    const [recommendations, setRecommendations] = useState<RecommendationGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                const response = await fetch('/api/recommendations/for-user?limit=5')
                const result = await response.json()

                if (result.success) {
                    setRecommendations(result.data)
                } else {
                    setError(result.message)
                }
            } catch (err) {
                console.error('Error fetching recommendations:', err)
                setError('Failed to load recommendations')
            } finally {
                setLoading(false)
            }
        }

        fetchRecommendations()
    }, [])

    const getIcon = (type: string) => {
        switch (type) {
            case 'collaborative':
                return <IconUsers size={18} />
            case 'department':
                return <IconBook size={18} />
            case 'content':
                return <IconStars size={18} />
            case 'embeddings':
                return <IconStars size={18} />
            default:
                return <IconStars size={18} />
        }
    }

    const getColor = (type: string) => {
        switch (type) {
            case 'collaborative':
                return 'blue'
            case 'department':
                return 'grape'
            case 'content':
                return 'teal'
            case 'embeddings':
                return 'violet'
            default:
                return 'gray'
        }
    }

    if (loading) {
        return (
            <Card>
                <Center p="xl">
                    <Loader size="md" />
                </Center>
            </Card>
        )
    }

    if (error || recommendations.length === 0) {
        return null // Don't show if there's an error or no recommendations
    }

    return (
        <Card>
            <Group justify="space-between" mb="md">
                <div>
                    <Title order={3}>💡 Recommended For You</Title>
                    <Text size="sm" c="dimmed">
                        Classes you might be interested in
                    </Text>
                </div>
                <Button
                    variant="subtle"
                    rightSection={<IconArrowRight size={16} />}
                    onClick={() => router.push('/discover')}
                >
                    Discover More
                </Button>
            </Group>

            <Accordion variant="contained">
                {recommendations.map((group, idx) => (
                    <Accordion.Item key={group.type} value={group.type}>
                        <Accordion.Control icon={getIcon(group.type)}>
                            <Group gap="xs">
                                <Text fw={500}>{group.title}</Text>
                                <Badge size="sm" color={getColor(group.type)} variant="light">
                                    {group.items.length}
                                </Badge>
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Text size="sm" c="dimmed" mb="md">
                                {group.description}
                            </Text>
                            <Stack gap="xs">
                                {group.items.map((rec) => (
                                    <Tooltip
                                        key={rec.class._id}
                                        label={
                                            <div style={{ whiteSpace: 'pre-line', maxWidth: '300px' }}>
                                                {rec.reason}
                                            </div>
                                        }
                                        position="top"
                                        withArrow
                                        multiline
                                    >
                                        <UnstyledButton
                                            onClick={() => {
                                                plausible('Recommendation Click', {
                                                    props: {
                                                        classNumber: rec.class.subjectNumber,
                                                        source: group.type
                                                    }
                                                })
                                                router.push(`/classes/${rec.class._id}`)
                                            }}
                                            style={{ width: '100%' }}
                                        >
                                            <Card padding="sm" withBorder style={{ cursor: 'pointer' }}>
                                                <Group justify="space-between">
                                                    <div style={{ flex: 1 }}>
                                                        <Text size="sm" fw={600}>
                                                            {rec.class.subjectNumber}
                                                        </Text>
                                                        <Text size="xs" lineClamp={1}>
                                                            {rec.class.subjectTitle}
                                                        </Text>
                                                    </div>
                                                    <Badge size="xs" variant="light" color={getColor(group.type)}>
                                                        {rec.class.department}
                                                    </Badge>
                                                </Group>
                                            </Card>
                                        </UnstyledButton>
                                    </Tooltip>
                                ))}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                ))}
            </Accordion>
        </Card>
    )
}

export default RecommendationsPanel
