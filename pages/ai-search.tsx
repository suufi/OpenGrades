import AISearchBox from '@/components/AISearchBox'
import mongoConnection from '@/utils/mongoConnection'
import User from '@/models/User'
import { hasRecentGradeReport, hasEnoughReviewsForAI } from '@/utils/hasRecentGradeReport'
import {
    Container,
    Title,
    Text,
    Paper,
    Grid,
    Group,
    Alert,
    List,
    Button,
    Stack
} from '@mantine/core'
import { IconStars, IconRobot, IconSearch, IconBrain, IconAlertTriangle, IconUpload, IconPencil } from '@tabler/icons'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import { getServerSession, Session } from 'next-auth'
import Head from 'next/head'
import Link from 'next/link'
import authOptions from './api/auth/[...nextauth]'

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

const AISearchPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ session, eligibility, trustLevel }) => {
    if (!eligibility.eligible) {
        return (
            <Container size="md" style={{ padding: 'var(--mantine-spacing-xl)' }}>
                <Head>
                    <title>AI Course Search - MIT OpenGrades</title>
                    <meta name="description" content="Search for MIT courses using natural language" />
                    <link rel="icon" href="/static/images/favicon.ico" />
                </Head>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <Title
                        order={1}
                        style={{
                            fontSize: '2.5rem',
                            fontWeight: 700,
                            marginBottom: '0.5rem'
                        }}
                    >
                        🤖 AI Course Assistant
                    </Title>
                    <Text c="dimmed" size="lg" mb="xl">
                        Ask questions in natural language and get intelligent course recommendations
                    </Text>
                </div>

                <Alert
                    icon={<IconAlertTriangle size={24} />}
                    title="Access Requirements Not Met"
                    color="orange"
                    variant="light"
                    mb="xl"
                >
                    <Text mb="md">
                        To use AI Search, you need to meet the following requirements:
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

                <Paper withBorder p="xl" radius="md" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                    <Text ta="center" c="dimmed">
                        Complete the requirements above to unlock AI Course Search
                    </Text>
                </Paper>
            </Container>
        )
    }

    return (
        <Container size="md" style={{ padding: 'var(--mantine-spacing-xl)' }}>
            <Head>
                <title>AI Course Search - MIT OpenGrades</title>
                <meta name="description" content="Search for MIT courses using natural language" />
                <link rel="icon" href="/static/images/favicon.ico" />
            </Head>

            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <Title
                    order={1}
                    style={{
                        fontSize: '2.5rem',
                        fontWeight: 700,
                        marginBottom: '0.5rem'
                    }}
                >
                    🤖 AI Course Assistant
                </Title>
                <Text c="dimmed" size="lg" mb="md">
                    Ask questions in natural language and get intelligent course recommendations
                </Text>

                <Group justify="center" gap="xl" mb="xl">
                    <Group gap="xs">
                        <IconRobot size={18} style={{ color: 'var(--mantine-color-blue-6)' }} />
                        <Text size="sm" c="dimmed">Natural Language</Text>
                    </Group>
                    <Group gap="xs">
                        <IconBrain size={18} style={{ color: 'var(--mantine-color-grape-6)' }} />
                        <Text size="sm" c="dimmed">Powered by AI</Text>
                    </Group>
                    <Group gap="xs">
                        <IconSearch size={18} style={{ color: 'var(--mantine-color-teal-6)' }} />
                        <Text size="sm" c="dimmed">Smart Search</Text>
                    </Group>
                </Group>
            </div>

            <AISearchBox fullPage={true} showDebugInfo={trustLevel === 2} />
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
            eligibility,
            trustLevel: user.trustLevel || 0
        }
    }
}

export default AISearchPage

