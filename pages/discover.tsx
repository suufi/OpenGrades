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
import { IconFlame, IconStars, IconTrendingUp, IconDiamond, IconAlertTriangle, IconUpload, IconPencil, IconEye } from '@tabler/icons-react'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { auth } from '@/utils/auth'
import { useDiscover } from '@/lib/query'
import ui from '@/styles/Interface.module.css'
import styles from '@/styles/Discover.module.css'

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
    popular?: Array<IClass & { pageviews: number; subjectNumber: string; linkToAggregate?: boolean }>
}

const ClassCard = ({
    classData,
    badge,
    meta,
    onNavigate,
}: {
    classData: IClass
    badge: React.ReactNode
    meta?: string
    onNavigate: (classData: { _id: string; subjectNumber?: string; linkToAggregate?: boolean }) => void
}) => {
    return (
        <UnstyledButton
            onClick={() => onNavigate({ _id: classData._id, subjectNumber: classData.subjectNumber, linkToAggregate: false })}
            className={styles.classCardButton}
        >
            <Card radius="md" padding="md" withBorder className={styles.classCard}>
                <Group justify="space-between" align="flex-start" gap="sm" mb="xs" wrap="nowrap">
                    <Text fw={700} size="md" className={styles.classNumber}>
                        {classData.subjectNumber}
                    </Text>
                    {badge}
                </Group>
                <Text size="sm" fw={600} lineClamp={2} mb={6}>
                    {classData.subjectTitle}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                    {classData.instructors?.join(', ') || 'No instructor listed'}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                    {[classData.units, classData.department].filter(Boolean).join(' · ')}
                    {meta ? ` · ${meta}` : ''}
                </Text>
            </Card>
        </UnstyledButton>
    )
}

const DiscoverPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ eligibility }) => {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<string | null>('hidden-gems')
    const { data, isLoading: loading } = useDiscover(eligibility.eligible)
    const discoverData = data as DiscoverData | null

    const handleNavigate = (classData: { _id: string; subjectNumber?: string; linkToAggregate?: boolean }) => {
        if (classData.linkToAggregate && classData.subjectNumber) {
            router.push(`/classes/aggregate/${encodeURIComponent(classData.subjectNumber)}`)
        } else {
            router.push(`/classes/${classData._id}`)
        }
    }

    if (!eligibility.eligible) {
        return (
            <Container size="lg" px="md" className={ui.page}>
                <Head>
                    <title>Discover - MIT OpenGrades</title>
                    <meta name="description" content="Discover hidden gems, trending classes, and more" />
                    <link rel="icon" href="/static/images/favicon.ico" />
                </Head>

                <Title order={1} className={ui.heroTitle}>Discover</Title>
                <Text c="dimmed" mt="xs" mb="lg">
                    Find high-rated, trending, and newly offered classes.
                </Text>

                <Alert
                    icon={<IconAlertTriangle size={20} />}
                    title="Access requirements not met"
                    color="orange"
                    variant="light"
                >
                    <Text mb="md" size="sm">
                        To use Discover, you need to meet the following requirements:
                    </Text>
                    <List spacing="sm" mb="lg" size="sm">
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
                                color="brick"
                            >
                                Upload grade report
                            </Button>
                        )}
                        {!eligibility.hasEnoughReviews && (
                            <Button
                                component={Link}
                                href="/classes"
                                leftSection={<IconPencil size={16} />}
                                variant="light"
                            >
                                Write reviews
                            </Button>
                        )}
                    </Stack>
                </Alert>
            </Container>
        )
    }

    if (loading) {
        return (
            <Container size="lg" px="md" className={ui.page}>
                <Center style={{ minHeight: '320px' }}>
                    <Loader size="lg" />
                </Center>
            </Container>
        )
    }

    return (
        <Container size="lg" px="md" className={ui.page}>
            <Head>
                <title>Discover - MIT OpenGrades</title>
                <meta name="description" content="Discover hidden gems, trending classes, and more" />
                <link rel="icon" href="/static/images/favicon.ico" />
            </Head>

            <Title order={1} className={ui.heroTitle}>Discover</Title>
            <Text c="dimmed" mt="xs" mb="lg">
                Find high-rated, trending, and newly offered classes.
            </Text>

            <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
                <Tabs.List>
                    <Tabs.Tab value="hidden-gems" leftSection={<IconDiamond size={16} />}>
                        Hidden gems
                    </Tabs.Tab>
                    <Tabs.Tab value="trending" leftSection={<IconFlame size={16} />}>
                        Trending
                    </Tabs.Tab>
                    <Tabs.Tab value="new" leftSection={<IconStars size={16} />}>
                        New
                    </Tabs.Tab>
                    <Tabs.Tab value="improvement" leftSection={<IconTrendingUp size={16} />}>
                        Rising
                    </Tabs.Tab>
                    <Tabs.Tab value="popular" leftSection={<IconEye size={16} />}>
                        Most viewed
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="hidden-gems" pt="md">
                    <Text c="dimmed" size="sm" mb="md">
                        High-rated classes that haven&apos;t gotten much attention yet
                    </Text>
                    <Grid>
                        {discoverData?.hiddenGems?.length
                            ? discoverData.hiddenGems.map((cls) => (
                                <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                    <ClassCard
                                        classData={cls}
                                        badge={<Badge color="yellow" variant="light">{cls.avgRating.toFixed(1)}</Badge>}
                                        meta={`${cls.reviewCount} reviews`}
                                        onNavigate={handleNavigate}
                                    />
                                </Grid.Col>
                            ))
                            : <Text c="dimmed">No hidden gems found</Text>}
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="trending" pt="md">
                    <Text c="dimmed" size="sm" mb="md">
                        Classes with the most recent activity and interest
                    </Text>
                    <Grid>
                        {discoverData?.trending?.length
                            ? discoverData.trending.map((cls) => (
                                <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                    <ClassCard
                                        classData={cls}
                                        badge={<Badge color="red" variant="light">{cls.recentReviews + cls.recentAdds} recent</Badge>}
                                        onNavigate={handleNavigate}
                                    />
                                </Grid.Col>
                            ))
                            : <Text c="dimmed">No trending classes found</Text>}
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="new" pt="md">
                    <Text c="dimmed" size="sm" mb="md">
                        Classes offered for the first time recently
                    </Text>
                    <Grid>
                        {discoverData?.newClasses?.length
                            ? discoverData.newClasses.map((cls) => (
                                <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                    <ClassCard
                                        classData={cls}
                                        badge={<Badge color="blue" variant="light">New {cls.firstOffered}</Badge>}
                                        onNavigate={handleNavigate}
                                    />
                                </Grid.Col>
                            ))
                            : <Text c="dimmed">No new classes found</Text>}
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="improvement" pt="md">
                    <Text c="dimmed" size="sm" mb="md">
                        Classes that have significantly improved from previous years
                    </Text>
                    <Grid>
                        {discoverData?.highestImprovement?.length
                            ? discoverData.highestImprovement.map((cls) => (
                                <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                    <ClassCard
                                        classData={cls}
                                        badge={<Badge color="green" variant="light">+{(cls.improvement ?? 0).toFixed(1)}</Badge>}
                                        meta={`${(cls.previousRating ?? 0).toFixed(1)} → ${(cls.currentRating ?? 0).toFixed(1)}`}
                                        onNavigate={handleNavigate}
                                    />
                                </Grid.Col>
                            ))
                            : <Text c="dimmed">No improvement data available</Text>}
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="popular" pt="md">
                    <Text c="dimmed" size="sm" mb="md">
                        Most viewed class pages in the last 30 days
                    </Text>
                    <Grid>
                        {discoverData?.popular?.length
                            ? discoverData.popular.map((cls) => (
                                <Grid.Col span={{ base: 12, sm: 6, md: 4 }} key={cls._id}>
                                    <ClassCard
                                        classData={cls}
                                        badge={
                                            <Badge color="violet" variant="light" leftSection={<IconEye size={12} />}>
                                                {(cls.pageviews ?? 0).toLocaleString()}
                                            </Badge>
                                        }
                                        onNavigate={handleNavigate}
                                    />
                                </Grid.Col>
                            ))
                            : <Text c="dimmed">No view data available yet. Check back later!</Text>}
                    </Grid>
                </Tabs.Panel>
            </Tabs>
        </Container>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    await mongoConnection()

    const session = await auth(context.req, context.res)

    if (!session) {
        return {
            redirect: {
                destination: '/api/auth/signin',
                permanent: false
            }
        }
    }

    const user = await User.findOne({ email: session.user?.email?.toLowerCase() }).lean()

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
