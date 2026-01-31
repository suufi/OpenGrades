import { IClass } from '@/types'
import mongoConnection from '@/utils/mongoConnection'
import User from '@/models/User'
import { hasRecentGradeReport, hasEnoughReviewsForAI } from '@/utils/hasRecentGradeReport'
import {
    Badge,
    Card,
    Container,
    Grid,
    Group,
    Space,
    Stack,
    Text,
    Title,
    UnstyledButton,
    Loader,
    Center,
    Tabs,
    Alert,
    List,
    Button
} from '@mantine/core'
import { IconFlame, IconStars, IconTrendingUp, IconDiamond, IconAlertTriangle, IconUpload, IconPencil } from '@tabler/icons'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import { getServerSession, Session } from 'next-auth'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import authOptions from 'pages/api/auth/[...nextauth]'
import { useEffect, useState } from 'react'

interface EligibilityStatus {
    eligible: boolean
    hasRecentGradeReport: boolean
    hasEnoughReviews: boolean
    reviewStats: {
        fullReviews: number
        totalReviews: number
        requiredReviews: number
    }
}

interface DiscoverData {
    hiddenGems: Array<IClass & { avgRating: number; reviewCount: number }>
    trending: Array<IClass & { trendingScore: number; recentReviews: number; recentAdds: number }>
    newClasses: Array<IClass & { firstOffered: number }>
    highestImprovement: Array<IClass & { currentRating: number; previousRating: number; improvement: number }>
}

const ClassCard = ({ classData, badge, onNavigate }: any) => {
    return (
        <UnstyledButton
            onClick={() => onNavigate(classData._id)}
            style={{ width: '100%' }}
        >
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{ height: '100%' }}>
                <Group justify="space-between" mb="xs">
                    <Text fw={600} size="lg">
                        {classData.subjectNumber}
                    </Text>
                    {badge}
                </Group>
                <Text size="sm" fw={500} lineClamp={2} mb="xs">
                    {classData.subjectTitle}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                    {classData.instructors?.join(', ') || 'No instructor listed'}
                </Text>
                <Text size="xs" c="dimmed">
                    {classData.units} • {classData.department}
                </Text>
            </Card>
        </UnstyledButton>
    )
}

const DiscoverPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ session, eligibility }) => {
    const router = useRouter()
    const [data, setData] = useState<DiscoverData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Only fetch if eligible
        if (!eligibility.eligible) {
            setLoading(false)
            return
        }

        const fetchData = async () => {
            try {
                const response = await fetch('/api/discover')
                const result = await response.json()
                if (result.success) {
                    setData(result.data)
                }
            } catch (error) {
                console.error('Error fetching discover data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [eligibility.eligible])

    const handleNavigate = (classId: string) => {
        router.push(`/classes/${classId}`)
    }

    if (!eligibility.eligible) {
        return (
            <Container size="xl" style={{ padding: 'var(--mantine-spacing-lg)' }}>
                <Head>
                    <title>Discover - MIT OpenGrades</title>
                    <meta name="description" content="Discover hidden gems, trending classes, and more" />
                    <link rel="icon" href="/static/images/favicon.ico" />
                </Head>

                <Title order={1}>
                    ✨ Discover Classes
                </Title>
                <Text c="dimmed" size="lg" mb="xl">
                    Find your next favorite class
                </Text>

                <Alert
                    icon={<IconAlertTriangle size={24} />}
                    title="Access Requirements Not Met"
                    color="orange"
                    variant="light"
                    mb="xl"
                >
                    <Text mb="md">
                        To use Discover, you need to meet the following requirements:
                    </Text>
                    <List spacing="sm" mb="lg">
                        <List.Item
                            icon={
                                eligibility.hasRecentGradeReport
                                    ? <Text c="green">✓</Text>
                                    : <Text c="red">✗</Text>
                            }
                        >
                            <Text fw={eligibility.hasRecentGradeReport ? 500 : 400}>
                                Upload a grade report within the last 4 months
                            </Text>
                            {!eligibility.hasRecentGradeReport && (
                                <Text size="sm" c="dimmed">
                                    Upload your latest grade report from WebSIS to continue.
                                </Text>
                            )}
                        </List.Item>
                        <List.Item
                            icon={
                                eligibility.hasEnoughReviews
                                    ? <Text c="green">✓</Text>
                                    : <Text c="red">✗</Text>
                            }
                        >
                            <Text fw={eligibility.hasEnoughReviews ? 500 : 400}>
                                Complete at least 20% of your reviews as full reviews
                            </Text>
                            {!eligibility.hasEnoughReviews && (
                                <Text size="sm" c="dimmed">
                                    You have {eligibility.reviewStats.fullReviews} full reviews out of {eligibility.reviewStats.totalReviews} total.
                                    You need at least {eligibility.reviewStats.requiredReviews} full review{eligibility.reviewStats.requiredReviews !== 1 ? 's' : ''}.
                                </Text>
                            )}
                        </List.Item>
                    </List>

                    <Stack gap="sm">
                        {!eligibility.hasRecentGradeReport && (
                            <Button
                                component={Link}
                                href="/"
                                leftSection={<IconUpload size={16} />}
                                variant="filled"
                                color="blue"
                            >
                                Upload Grade Report
                            </Button>
                        )}
                        {!eligibility.hasEnoughReviews && (
                            <Button
                                component={Link}
                                href="/classes"
                                leftSection={<IconPencil size={16} />}
                                variant="light"
                            >
                                Write Reviews
                            </Button>
                        )}
                    </Stack>
                </Alert>
            </Container>
        )
    }

    if (loading) {
        return (
            <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
                <Center style={{ minHeight: '400px' }}>
                    <Loader size="lg" />
                </Center>
            </Container>
        )
    }

    return (
        <Container size="xl" style={{ padding: 'var(--mantine-spacing-lg)' }}>
            <Head>
                <title>Discover - MIT OpenGrades</title>
                <meta name="description" content="Discover hidden gems, trending classes, and more" />
                <link rel="icon" href="/static/images/favicon.ico" />
            </Head>

            <Title order={1}>
                ✨ Discover Classes
            </Title>
            <Text c="dimmed" size="lg" mb="xl">
                Find your next favorite class
            </Text>

            <Tabs defaultValue="hidden-gems">
                <Tabs.List>
                    <Tabs.Tab value="hidden-gems" leftSection={<IconDiamond size={16} />}>
                        Hidden Gems
                    </Tabs.Tab>
                    <Tabs.Tab value="trending" leftSection={<IconFlame size={16} />}>
                        Trending Now
                    </Tabs.Tab>
                    <Tabs.Tab value="new" leftSection={<IconStars size={16} />}>
                        New Classes
                    </Tabs.Tab>
                    <Tabs.Tab value="improvement" leftSection={<IconTrendingUp size={16} />}>
                        Rising Stars
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="hidden-gems">
                    <Space h="md" />
                    <Text c="dimmed" mb="lg">
                        High-rated classes that haven't gotten much attention yet
                    </Text>
                    <Grid>
                        {data?.hiddenGems.map((cls) => (
                            <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                <ClassCard
                                    classData={cls}
                                    badge={
                                        <Badge color="yellow" variant="light">
                                            ⭐ {cls.avgRating.toFixed(1)}
                                        </Badge>
                                    }
                                    onNavigate={handleNavigate}
                                />
                            </Grid.Col>
                        )) || <Text c="dimmed">No hidden gems found</Text>}
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="trending">
                    <Space h="md" />
                    <Text c="dimmed" mb="lg">
                        Classes with the most recent activity and interest
                    </Text>
                    <Grid>
                        {data?.trending.map((cls) => (
                            <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                <ClassCard
                                    classData={cls}
                                    badge={
                                        <Badge color="red" variant="light">
                                            🔥 {cls.recentReviews + cls.recentAdds} recent
                                        </Badge>
                                    }
                                    onNavigate={handleNavigate}
                                />
                            </Grid.Col>
                        )) || <Text c="dimmed">No trending classes found</Text>}
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="new">
                    <Space h="md" />
                    <Text c="dimmed" mb="lg">
                        Classes offered for the first time recently
                    </Text>
                    <Grid>
                        {data?.newClasses.map((cls) => (
                            <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                <ClassCard
                                    classData={cls}
                                    badge={
                                        <Badge color="blue" variant="light">
                                            ✨ New {cls.firstOffered}
                                        </Badge>
                                    }
                                    onNavigate={handleNavigate}
                                />
                            </Grid.Col>
                        )) || <Text c="dimmed">No new classes found</Text>}
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="improvement">
                    <Space h="md" />
                    <Text c="dimmed" mb="lg">
                        Classes that have significantly improved from previous years
                    </Text>
                    <Grid>
                        {data?.highestImprovement.map((cls) => (
                            <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                <ClassCard
                                    classData={cls}
                                    badge={
                                        <Badge color="green" variant="light">
                                            📈 +{cls.improvement.toFixed(1)}
                                        </Badge>
                                    }
                                    onNavigate={handleNavigate}
                                />
                            </Grid.Col>
                        )) || <Text c="dimmed">No improvement data available</Text>}
                    </Grid>
                </Tabs.Panel>
            </Tabs>
        </Container>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    await mongoConnection()

    const session: Session | null = await getServerSession(context.req, context.res, authOptions)

    if (!session) {
        return {
            redirect: {
                destination: '/api/auth/signin',
                permanent: false
            }
        }
    }

    const user = await User.findOne({ email: session.user?.email?.toLowerCase() }).lean() as any

    if (!user) {
        return {
            redirect: {
                destination: '/api/auth/signin',
                permanent: false
            }
        }
    }

    const hasRecent = hasRecentGradeReport(user.lastGradeReportUpload)

    const reviewCheck = await hasEnoughReviewsForAI(user._id.toString())

    const eligibility: EligibilityStatus = {
        eligible: hasRecent && reviewCheck.hasAccess,
        hasRecentGradeReport: hasRecent,
        hasEnoughReviews: reviewCheck.hasAccess,
        reviewStats: {
            fullReviews: reviewCheck.fullReviews,
            totalReviews: reviewCheck.totalReviews,
            requiredReviews: reviewCheck.requiredReviews
        }
    }

    return {
        props: {
            session: JSON.parse(JSON.stringify(session)),
            eligibility
        }
    }
}

export default DiscoverPage
