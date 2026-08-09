import AISearchBox from '@/components/AISearchBox'
import ParleySettings from '@/components/ParleySettings'
import mongoConnection from '@/utils/mongoConnection'
import User from '@/models/User'
import { hasRecentGradeReport, hasEnoughReviewsForAI } from '@/utils/hasRecentGradeReport'
import ui from '@/styles/Interface.module.css'
import classes from '@/styles/AISearchPage.module.css'
import {
    Container,
    Title,
    Text,
    Paper,
    Button,
    Stack,
    Group,
    Modal
} from '@mantine/core'
import { IconCircleCheck, IconCircleX, IconPencil, IconUpload, IconSettings } from '@tabler/icons-react'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import { getServerSession, Session } from 'next-auth'
import Head from 'next/head'
import Link from 'next/link'
import { config as authOptions } from '@/utils/auth'
import { useCallback, useEffect, useState } from 'react'

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
    const [showParleySettings, setShowParleySettings] = useState(false)
    const [providerLabel, setProviderLabel] = useState('SIPB LLMs')

    const refreshProviderLabel = useCallback(() => {
        const configured = Boolean(localStorage.getItem('parleyApiKey'))
        setProviderLabel(configured ? 'Parley connected' : 'SIPB LLMs')
    }, [])

    useEffect(() => {
        refreshProviderLabel()
    }, [refreshProviderLabel])

    if (!eligibility.eligible) {
        return (
            <Container size="md" className={ui.page}>
                <Head>
                    <title>AI Course Search - MIT OpenGrades</title>
                    <meta name="description" content="Search for MIT courses using natural language" />
                    <link rel="icon" href="/static/images/favicon.ico" />
                </Head>

                <header className={classes.pageHeader}>
                    <div>
                        <Title order={1} className={classes.pageTitle}>AI course search</Title>
                        <Text className={classes.pageSub}>
                            Search for classes by describing them — suggestions draw on OpenGrades reviews and the classes you have already taken.
                        </Text>
                    </div>
                </header>

                <Paper className={classes.requirementsPanel} mt="md">
                    <Title order={3} className={ui.sectionTitle}>Two things unlock AI search</Title>
                    <div className={classes.requirementList}>
                        <div className={classes.requirementItem}>
                            <span className={classes.statusMark}>
                                {eligibility.hasRecentGradeReport
                                    ? <IconCircleCheck size={20} className={classes.statusDone} />
                                    : <IconCircleX size={20} className={classes.statusPending} />}
                            </span>
                            <div>
                                <Text fw={600}>Upload a grade report from the last 4 months</Text>
                                <Text size="sm" c="dimmed">
                                    {eligibility.hasRecentGradeReport
                                        ? 'Your transcript is current enough for personalized search.'
                                        : 'Upload your latest grade report from WebSIS to continue.'}
                                </Text>
                            </div>
                        </div>
                        <div className={classes.requirementItem}>
                            <span className={classes.statusMark}>
                                {eligibility.hasEnoughReviews
                                    ? <IconCircleCheck size={20} className={classes.statusDone} />
                                    : <IconCircleX size={20} className={classes.statusPending} />}
                            </span>
                            <div>
                                <Text fw={600}>Write full reviews for at least 20% of your classes</Text>
                                <Text size="sm" c="dimmed">
                                    {eligibility.hasEnoughReviews
                                        ? 'You have enough detailed reviews to use the feature.'
                                        : `You have ${eligibility.reviewStats.fullReviews} full review${eligibility.reviewStats.fullReviews !== 1 ? 's' : ''} out of ${eligibility.reviewStats.totalReviews} total. You need ${eligibility.reviewStats.requiredReviews}.`}
                                </Text>
                            </div>
                        </div>
                    </div>

                    <Stack gap="sm" mt="lg">
                        {!eligibility.hasRecentGradeReport && (
                            <Button
                                component={Link}
                                href="/"
                                leftSection={<IconUpload size={16} />}
                                color="brick"
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
                                color="brick"
                            >
                                Write Reviews
                            </Button>
                        )}
                    </Stack>
                </Paper>
            </Container>
        )
    }

    return (
        <Container size="lg" px="md" className={ui.page}>
            <Head>
                <title>AI Course Search - MIT OpenGrades</title>
                <meta name="description" content="Search for MIT courses using natural language" />
                <link rel="icon" href="/static/images/favicon.ico" />
            </Head>

            <Stack className={classes.pageStack}>
                <header className={classes.pageHeader}>
                    <div>
                        <Title order={1} className={classes.pageTitle}>AI course search</Title>
                        <Text className={classes.pageSub}>
                            Search for classes by describing them — suggestions draw on OpenGrades reviews and the classes you have already taken.
                        </Text>
                    </div>
                    <Group gap="sm" className={classes.pageActions}>
                        <Text size="sm" c="dimmed">Using {providerLabel}</Text>
                        <Button
                            variant="default"
                            size="sm"
                            leftSection={<IconSettings size={16} />}
                            onClick={() => setShowParleySettings(true)}
                        >
                            AI settings
                        </Button>
                    </Group>
                </header>

                <Modal
                    opened={showParleySettings}
                    onClose={() => setShowParleySettings(false)}
                    centered
                    size="md"
                    title="AI provider settings"
                >
                    <Text size="sm" c="dimmed" mb="lg">
                        OpenGrades works out of the box. Optionally connect MIT Parley to choose a different model.
                    </Text>
                    <ParleySettings embedded onSettingsChange={refreshProviderLabel} />
                </Modal>

                <section className={`${ui.sectionCard} ${classes.searchShell}`}>
                    <AISearchBox fullPage={true} showDebugInfo={trustLevel === 2} />
                </section>
            </Stack>
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
