// @ts-nocheck
import authOptions from '@/auth'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import { IClass, IClassReview, TimeRange } from '@/types'
import mongoConnection from '@/utils/mongoConnection'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'
import { Accordion, Avatar, Badge, Box, Button, Card, Center, Container, Divider, Flex, Grid, Group, Paper, RingProgress, Space, Stack, Switch, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import { getServerSession, Session } from 'next-auth'
import { useRouter } from 'next/router'
import { useState } from 'react'


import GradeReportModal from '@/components/GradeReportModal'
import ContentSubmission from '@/models/ContentSubmission'
import User from '@/models/User'
import styles from '@/styles/ClassPage.module.css'
import { BarChart, DonutChart } from '@mantine/charts'
import { showNotification } from '@mantine/notifications'
import moment from 'moment-timezone'
import { IconArrowUpCircle, IconClock, IconMessage, IconThumbUp } from '@tabler/icons'
import RelatedClasses from '@/components/RelatedClasses'
import { extractCourseNumbers } from '@/utils/prerequisiteGraph'


const RecommendationLevels: Record<number, string> = {
    1: 'Definitely not recommend',
    2: 'Unlikely to recommend',
    3: 'Recommend with reservations',
    4: 'Likely to recommend',
    5: 'Recommend with enthusiasm'
}

const letterGradeColors = {
    A: '#40C057',
    B: '#15AABF',
    C: '#4C6EF5',
    D: '#BE4BDB',
    F: '#FA5252'
}

interface AggregateProps {
    classesProp: IClass[]
    reviewsProp: IClassReview[],
    lastGradeReportUpload: boolean,
    submissionsProp: Array<{
        _id: string,
        class: IClass,
        contentTitle: string,
        type: string,
        contentURL?: string,
        bucketPath?: string,
        createdAt: string
    }>
    relatedClasses?: {
        prerequisites: { subjectNumber: string; subjectTitle: string }[]
        corequisites: { subjectNumber: string; subjectTitle: string }[]
        requiredBy: { subjectNumber: string; subjectTitle: string }[]
    }
}

interface ClassReviewCommentProps {
    classReview: IClassReview,
    author: {
        name: string,
        hiddenName: string
    },
    reported: boolean,
    trustLevel: number,

    userVote: number | null // null for no vote, 1 for upvote, -1 for downvote
    upvotes: number
    downvotes: number
    onVoteChange: (vote: number) => void // Function to change the vote
}

function ClassReviewComment({ classReview,
    author,
    reported,
    trustLevel,
    userVote,
    upvotes,
    downvotes,
    onVoteChange,
}: ClassReviewCommentProps) {
    const [showName, setShowName] = useState(false)
    const [hidden, setHidden] = useState(!classReview.display)

    const [previousVote, setPreviousVote] = useState(userVote) // Track previous vote state

    const getWorkloadInfo = (timeRange: TimeRange | string | undefined): { label: string; color: string; ringValue: number } => {
        const unknown = { label: 'Unknown', color: 'gray', ringValue: 0 }
        if (!timeRange || timeRange === TimeRange.Unknown) return unknown
        const rangeMap: Record<string, { label: string; color: string; midpoint: number }> = {
            [TimeRange['0-2 hours']]: { label: 'Light', color: 'green', midpoint: 1 },
            [TimeRange['3-5 hours']]: { label: 'Light', color: 'green', midpoint: 4 },
            [TimeRange['6-8 hours']]: { label: 'Moderate', color: 'yellow', midpoint: 7 },
            [TimeRange['9-11 hours']]: { label: 'Moderate', color: 'yellow', midpoint: 10 },
            [TimeRange['12-14 hours']]: { label: 'Moderate', color: 'yellow', midpoint: 13 },
            [TimeRange['15-17 hours']]: { label: 'Heavy', color: 'orange', midpoint: 16 },
            [TimeRange['18-20 hours']]: { label: 'Heavy', color: 'orange', midpoint: 19 },
            [TimeRange['21-23 hours']]: { label: 'Very Heavy', color: 'red', midpoint: 22 },
            [TimeRange['24-26 hours']]: { label: 'Very Heavy', color: 'red', midpoint: 25 },
            [TimeRange['37-40 hours']]: { label: 'Very Heavy', color: 'red', midpoint: 38.5 }
        }
        const info = rangeMap[timeRange]
        if (!info) return unknown
        return { ...info, ringValue: Math.min((info.midpoint / 40) * 100, 100) }
    }

    // Helper function to get recommendation color
    const getRecommendationColor = (level: number) => {
        if (level >= 6) return 'green'
        if (level >= 4) return 'yellow'
        return 'red'
    }

    const workloadInfo = getWorkloadInfo(classReview.hoursPerWeek)
    const ratingPercent = ((classReview.overallRating || 0) / 7) * 100

    return (
        <Paper className={styles.comment} withBorder radius="md" p="md">
            {/* Header: Author info and badges */}
            <Group justify="space-between" mb="sm">
                <Group>
                    <Avatar alt={author.name} radius="xl" />
                    <div>
                        <Text size="sm" fw={500} className={styles.text}>{author.name}</Text>
                        <Text size="xs" c="dimmed">
                            {moment(classReview.createdAt).tz('America/New_York').format('MMMM DD, YYYY')}
                        </Text>
                    </div>
                </Group>
                <Group gap='xs'>
                    {classReview.firstYear && <Badge size="sm" color='indigo' variant="light">First Year</Badge>}
                    {classReview.retaking && <Badge size="sm" color='green' variant="light">Retake</Badge>}
                    {classReview.droppedClass && <Badge size="sm" color='yellow' variant="light">Dropped</Badge>}
                </Group>
            </Group>

            {/* Metrics Grid */}
            <Grid mb="md" gutter="md">
                {/* Overall Rating */}
                <Grid.Col span={{ base: 4, sm: 4 }}>
                    <Group gap="xs" align="center">
                        <Tooltip label={`${classReview.overallRating}/7 overall rating`}>
                            <RingProgress
                                size={50}
                                thickness={5}
                                roundCaps
                                sections={[{ value: ratingPercent, color: ratingPercent >= 70 ? 'green' : ratingPercent >= 40 ? 'yellow' : 'red' }]}
                                label={
                                    <Text size="xs" ta="center" fw={700}>
                                        {classReview.overallRating}
                                    </Text>
                                }
                            />
                        </Tooltip>
                        <div>
                            <Text size="xs" c="dimmed">Rating</Text>
                            <Text size="sm" fw={500}>{classReview.overallRating}/7</Text>
                        </div>
                    </Group>
                </Grid.Col>

                {/* Hours Per Week */}
                <Grid.Col span={{ base: 4, sm: 4 }}>
                    <Group gap="xs" align="center">
                        <Tooltip label={`${classReview.hoursPerWeek ?? 'Unknown'} per week (${workloadInfo.label})`}>
                            <RingProgress
                                size={50}
                                thickness={5}
                                roundCaps
                                sections={[{ value: workloadInfo.ringValue, color: workloadInfo.color }]}
                                label={
                                    <Center>
                                        <IconClock size={16} />
                                    </Center>
                                }
                            />
                        </Tooltip>
                        <div>
                            <Text size="xs" c="dimmed">Hours/Week</Text>
                            <Text size="sm" fw={500}>{classReview.hoursPerWeek ?? 'Unknown'} <Text component="span" size="xs" c="dimmed">({workloadInfo.label})</Text></Text>
                        </div>
                    </Group>
                </Grid.Col>

                {/* Recommendation */}
                <Grid.Col span={{ base: 4, sm: 4 }}>
                    <Group gap="xs" align="center">
                        <Tooltip label={RecommendationLevels[classReview.recommendationLevel]}>
                            <RingProgress
                                size={50}
                                thickness={5}
                                roundCaps
                                sections={[{ value: (classReview.recommendationLevel / 7) * 100, color: getRecommendationColor(classReview.recommendationLevel) }]}
                                label={
                                    <Center>
                                        <IconThumbUp size={16} />
                                    </Center>
                                }
                            />
                        </Tooltip>
                        <div>
                            <Text size="xs" c="dimmed">Would Recommend</Text>
                            <Text size="sm" fw={500}>{classReview.recommendationLevel}/7</Text>
                        </div>
                    </Group>
                </Grid.Col>
            </Grid>

            {/* Comments Section - Only show if there's content */}
            {(classReview.classComments || classReview.backgroundComments) && (
                <Stack gap="xs">
                    {classReview.classComments && (
                        <Box>
                            <Group gap="xs" mb={4}>
                                <IconMessage size={14} color="gray" />
                                <Text size="xs" fw={600} c="dimmed">Class Comments</Text>
                            </Group>
                            <Text size="sm" style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                                "{classReview.classComments}"
                            </Text>
                        </Box>
                    )}

                    {classReview.backgroundComments && (
                        <Box>
                            <Group gap="xs" mb={4}>
                                <IconMessage size={14} color="gray" />
                                <Text size="xs" fw={600} c="dimmed">Background & Tips</Text>
                            </Group>
                            <Text size="sm" style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                                "{classReview.backgroundComments}"
                            </Text>
                        </Box>
                    )}
                </Stack>
            )}

            {/* Footer with vote count */}
            <Divider my="sm" />
            <Group justify='flex-end'>
                <Group gap="xs">
                    <Text size="sm" fw={500} c={upvotes - downvotes > 0 ? 'green' : upvotes - downvotes < 0 ? 'red' : 'gray'}>
                        {upvotes - downvotes}
                    </Text>
                    <IconArrowUpCircle size={20} />
                </Group>
            </Group>
        </Paper>
    )
}

const AggregatedPage: NextPage<AggregateProps> = ({ classesProp, reviewsProp, gradePointsProp, lastGradeReportUpload, submissionsProp, relatedClasses }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
    const router = useRouter()

    const [classes, setClasses] = useState(classesProp)
    const [onlyOffered, setOnlyOffered] = useState(true)
    const [gradeReportModalOpened, setGradeReportModalOpened] = useState(false)

    const handleAddClassesFromModal = async (classes: { [key: string]: IClass[] }, partialReviews: { class: string; letterGrade: string; droppedClass: boolean, firstYear: boolean }[]) => {
        const flatClasses = Object.values(classes).flat().map((c: IClass) => ({ _id: c._id }))

        try {
            const response = await fetch('/api/me/classes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    classesTaken: flatClasses,
                    partialReviews
                }),
            })

            const body = await response.json()

            if (response.ok) {
                showNotification({
                    title: 'Classes added!',
                    message: 'Your classes have been added successfully.',
                    color: 'green',
                })
            } else {
                showNotification({
                    title: 'Error adding classes',
                    message: body.message,
                    color: 'red',
                })
            }
        } catch (error) {
            showNotification({
                title: 'Error!',
                message: 'Failed to add classes.',
                color: 'red',
            })
        } finally {
            router.replace(router.asPath) // Refresh data
        }
    }


    return (
        <Container style={{ padding: 'var(--mantine-spacing-lg)', maxWidth: 1200 }}>
            <Button variant='transparent' onClick={() => router.back()}>
                ← Back
            </Button>
            <Space h='lg' />

            <Space h='lg' />
            <Title>Aggregated for {router.query.subjectNumber}</Title>
            <Space h='lg' />

            <Title order={2}>Summary</Title>
            <Center>
                <Group align='center' gap='xl'>
                    {
                        gradePointsProp.length > 0 ?
                            (
                                <DonutChart
                                    size={300}
                                    labelsType='value'
                                    startAngle={0}
                                    endAngle={360}
                                    withLabels
                                    withTooltip
                                    data={gradePointsProp.reduce((acc, { letterGrade }) => {
                                        const existing = acc.find((entry) => entry.name === letterGrade)
                                        if (existing) {
                                            existing.value++
                                        } else {
                                            acc.push({ name: letterGrade, value: 1, color: letterGradeColors[letterGrade] })
                                        }
                                        return acc
                                    }, [] as { name: string, value: number, color: string }[]
                                    )}
                                />)
                            : <Text c='dimmed'>
                                {
                                    lastGradeReportUpload ? "No grade points for this class yet." :
                                        <>

                                            You must <UnstyledButton style={{ textDecoration: "underline", color: "blue" }} onClick={() => setGradeReportModalOpened(true)}>upload</UnstyledButton> a grade report with partial reviews in the past four months to display grade data.
                                        </>
                                }
                            </Text>
                    }
                    <GradeReportModal opened={gradeReportModalOpened} onClose={() => setGradeReportModalOpened(false)} onAddClasses={handleAddClassesFromModal} />

                    {
                        reviewsProp.length > 0 ?
                            (
                                <DonutChart
                                    size={300}
                                    labelsType='value'
                                    startAngle={0}
                                    endAngle={360}
                                    withLabels
                                    withTooltip
                                    data={reviewsProp.reduce((acc, { recommendationLevel }) => {
                                        const existing = acc.find((entry) => entry.name === RecommendationLevels[recommendationLevel])
                                        if (existing) {
                                            existing.value++
                                        } else {
                                            const colors = {
                                                1: 'red',
                                                2: 'orange',
                                                3: 'yellow',
                                                4: 'green',
                                                5: 'blue'
                                            }
                                            acc.push({ name: RecommendationLevels[recommendationLevel], value: 1, color: colors[recommendationLevel] })
                                        }
                                        return acc
                                    }, [] as { name: string, value: number, color: string }[]
                                    )}
                                />
                            ) : <Text c='dimmed'>No reviews for this class yet.</Text>
                    }
                </Group>
            </Center>

            {
                (reviewsProp.length > 0 || gradePointsProp.length > 0) && (
                    <>
                        <Space h='lg' />
                        <Title order={2}>By Term</Title>
                        <Space h='sm' />
                    </>
                )
            }
            <Flex gap='md' wrap='wrap'>
                {reviewsProp.length > 0 &&
                    <BarChart
                        h={400}
                        type='percent'
                        withLegend
                        data={reviewsProp.reduce((acc, { class: { term }, recommendationLevel }) => {
                            const existing = acc.find((entry) => entry.term === term)
                            const recommendationLevelString = RecommendationLevels[recommendationLevel]
                            if (existing) {
                                existing[recommendationLevelString]++
                            } else {
                                const newEntry = {
                                    term,
                                }
                                for (const level of Object.values(RecommendationLevels)) {
                                    newEntry[level] = 0
                                }

                                newEntry[recommendationLevelString] = 1
                                acc.push(newEntry)
                            }
                            return acc
                        }, [] as { term: string }[])
                        }
                        dataKey='term'
                        series={[
                            { name: 'Definitely not recommend', color: 'red', stackId: 'recommendation' },
                            { name: 'Unlikely to recommend', color: 'orange', stackId: 'recommendation' },
                            { name: 'Recommend with reservations', color: 'yellow', stackId: 'recommendation' },
                            { name: 'Likely to recommend', color: 'green', stackId: 'recommendation' },
                            { name: 'Recommend with enthusiasm', color: 'blue', stackId: 'recommendation' },
                        ]}

                    />
                }

                {gradePointsProp.length > 0 &&
                    <BarChart
                        h={400}
                        type='percent'
                        withLegend
                        data={gradePointsProp.sort((a, b) => a.class.term.localeCompare(b.class.term)).reduce((acc, { class: { term }, letterGrade }) => {
                            const existing = acc.find((entry) => entry.term === term)
                            if (existing) {
                                existing[letterGrade]++
                            } else {
                                const newEntry = {
                                    term,
                                    A: 0,
                                    B: 0,
                                    C: 0,
                                    D: 0,
                                    F: 0,
                                    DR: 0,
                                    P: 0
                                }

                                newEntry[letterGrade] = 1

                                acc.push(newEntry)
                            }
                            return acc
                        }, [] as { term: string }[])
                        }
                        dataKey='term'
                        series={[
                            { name: 'A', color: letterGradeColors.A, stackId: 'grades' },
                            { name: 'B', color: letterGradeColors.B, stackId: 'grades' },
                            { name: 'C', color: letterGradeColors.C, stackId: 'grades' },
                            { name: 'D', color: letterGradeColors.D, stackId: 'grades' },
                            { name: 'F', color: letterGradeColors.F, stackId: 'grades' },
                            { name: 'DR', color: 'gray', stackId: 'grades' },
                            { name: 'P', color: 'purple', stackId: 'grades' }
                        ]}

                    />
                }
            </Flex>

            <Space h='lg' />

            <Space h='xl' />
            <Flex justify='space-between' align='center'>
                <Title order={2}>Classes</Title>
                <Switch checked={onlyOffered} onChange={(e) => setOnlyOffered(e.currentTarget.checked)} label="Only show classes offered" />
            </Flex>
            <Space h='sm' />
            <Stack gap='sm'>
                <Accordion chevronPosition='left' variant='filled' multiple>
                    {
                        classes.sort((a, b) => a.term.localeCompare(b.term)).filter(c => !onlyOffered || c.offered).map(c => (
                            <Accordion.Item key={c._id} value={c._id}>
                                <Accordion.Control>
                                    <Card key={c._id} shadow='xs' variant='outlined' withBorder>
                                        <Stack>
                                            <Flex justify='space-between'>
                                                <Title order={4}> {c.subjectNumber}: {c.subjectTitle} <Text c='dimmed'> {c.aliases.length > 0 && "aka"} {c.aliases.join(', ')} </Text> </Title>
                                                <Title order={5}> {c.term} </Title>
                                            </Flex>
                                            <Flex justify='space-between'>
                                                <Text> {c.instructors.join(", ")} </Text>
                                                <Group>
                                                    {!c.offered && <Badge color='red'> Not offered </Badge>}
                                                    <Badge variant={reviewsProp.filter(r => r.class._id === c._id).length == 0 ? 'transparent' : 'filled'} color='purple'> {reviewsProp.filter(r => r.class._id === c._id).length} review{reviewsProp.filter(r => r.class._id === c._id).length === 1 ? '' : 's'} </Badge>
                                                </Group>
                                            </Flex>
                                        </Stack>
                                    </Card>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    {
                                        reviewsProp.filter(r => r.class._id === c._id).length == 0 && <Text> No reviews for this class yet. </Text>
                                    }
                                    {
                                        reviewsProp.filter(r => r.class._id === c._id).map(r => (
                                            <>
                                                <ClassReviewComment
                                                    key={r._id}
                                                    classReview={r}
                                                    author={{ name: 'Anonymous', hiddenName: 'Anonymous' }}
                                                    reported={false}
                                                    trustLevel={0}
                                                    userVote={null}
                                                    upvotes={r.upvotes}
                                                    downvotes={r.downvotes}
                                                    onVoteChange={() => { }}
                                                />
                                                <Space h='sm' />
                                            </>
                                        ))
                                    }
                                </Accordion.Panel>
                            </Accordion.Item>
                        ))
                    }
                </Accordion>
            </Stack>

            {relatedClasses && (
                <>
                    <Space h='xl' />
                    <RelatedClasses
                        subjectNumber={router.query.subjectNumber as string}
                        prerequisites={relatedClasses.prerequisites}
                        corequisites={relatedClasses.corequisites}
                        requiredBy={relatedClasses.requiredBy}
                    />
                </>
            )}

            <Space h='xl' />
            <Title order={2}>Content Submissions</Title>
            <Space h='sm' />
            {
                submissionsProp.length === 0 ? (
                    <Text c='dimmed'>No content submissions for this class yet.</Text>
                ) : (
                    <Accordion chevronPosition='left' variant='separated' multiple>
                        {submissionsProp
                            .sort((a, b) => a.class.term.localeCompare(b.class.term))
                            .map((s) => (
                                <Accordion.Item key={s._id} value={s._id}>
                                    <Accordion.Control>
                                        <Flex justify='space-between' align='center'>
                                            <Stack gap={0}>
                                                <Text fw={600}>{s.contentTitle}</Text>
                                                <Text c='dimmed' size='sm'>{s.type} • {s.class.subjectNumber} {s.class.subjectTitle} • {s.class.term}</Text>
                                            </Stack>
                                            <Badge variant='light'>{moment(s.createdAt).tz('America/New_York').format('MMM DD, YYYY')}</Badge>
                                        </Flex>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Group gap='sm'>
                                            {s.contentURL && (
                                                <Button component='a' href={s.contentURL} target='_blank' rel='noopener noreferrer' variant='light'>Open Link</Button>
                                            )}
                                            {s.bucketPath && (
                                                <Button component='a' href={`/api/content/${encodeURIComponent(s.bucketPath)}`} target='_blank' rel='noopener noreferrer' variant='light'>Download</Button>
                                            )}
                                            {!s.contentURL && !s.bucketPath && (
                                                <Text c='dimmed'>No file or URL attached.</Text>
                                            )}
                                        </Group>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            ))}
                    </Accordion>
                )
            }
        </Container >

    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    const { subjectNumber } = context.query

    await mongoConnection()

    const session: Session | null = await getServerSession(context.req, context.res, authOptions)
    if (!session) {
        return {
            redirect: {
                destination: '/auth/signin',
                permanent: false
            }
        }
    }

    const user = await User.findOne({ email: session.user.email })

    const classes = await Class.find({
        $or: [{ subjectNumber }, { aliases: { $in: [subjectNumber] } }],
        display: true
    }).lean()
    const classIds = classes.map(c => c._id)

    function shuffleArray(array: unknown[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]
        }
        return array
    }

    // const reviews = await ClassReview.find({
    //     class: { $in: classIds },
    //     partial: false
    // }).populate('class').lean()

    // aggregate reviews with # of upvotes and downvotes
    const reviews = await ClassReview.aggregate([
        {
            $match: {
                class: { $in: classIds },
                partial: false
            }
        },
        {
            $lookup: {
                from: 'classes',
                localField: 'class',
                foreignField: '_id',
                as: 'class'
            }
        },
        {
            $unwind: '$class'
        },
        {
            $lookup: {
                from: 'reviewvotes',
                localField: '_id',
                foreignField: 'classReview',
                as: 'votes'
            }
        },
        {
            $addFields: {
                upvotes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.vote', 1] } } } },
                downvotes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.vote', -1] } } } }
            }
        },
        {
            $project: {
                'votes': 0,
                'author': 0,
                'numericGrade': 0,
                'letterGrade': 0,
            }
        }
    ])

    const gradePointsData = await ClassReview.find({
        class: { $in: classIds },
    }).populate('class').select('letterGrade').lean()

    const lastGradeReportUpload = hasRecentGradeReport(user.lastGradeReportUpload, 4)

    const submissions = await ContentSubmission.find({
        class: { $in: classIds },
        approved: true
    }).populate('class').select('contentTitle type contentURL bucketPath class createdAt').select('-author -approved').lean()

    // Sort classes to find the latest one for prerequisites
    const sortedClasses = [...classes].sort((a: any, b: any) => {
        // Sort by academic year descending, then term
        if (b.academicYear !== a.academicYear) return b.academicYear - a.academicYear
        return b.term.localeCompare(a.term)
    })
    const latestClass = sortedClasses[0] || {}

    // Fetch related classes data
    const prereqNumbers = extractCourseNumbers(latestClass.prerequisites || '')
    const coreqNumbers = extractCourseNumbers(latestClass.corequisites || '')

    const [prerequisiteClasses, corequisiteClasses, requiredByClasses] = await Promise.all([
        Class.find({
            subjectNumber: { $in: prereqNumbers },
            offered: true
        }).select('subjectNumber subjectTitle department').lean(),

        Class.find({
            subjectNumber: { $in: coreqNumbers },
            offered: true
        }).select('subjectNumber subjectTitle department').lean(),

        Class.find({
            offered: true,
            $or: [
                { prerequisites: { $regex: new RegExp(`\\b${subjectNumber}\\b`, 'i') } },
                { corequisites: { $regex: new RegExp(`\\b${subjectNumber}\\b`, 'i') } }
            ]
        }).select('subjectNumber subjectTitle department').lean()
    ])

    const relatedClasses = {
        prerequisites: prerequisiteClasses.map((c: any) => ({
            subjectNumber: c.subjectNumber,
            subjectTitle: c.subjectTitle,
            department: c.department
        })),
        corequisites: corequisiteClasses.map((c: any) => ({
            subjectNumber: c.subjectNumber,
            subjectTitle: c.subjectTitle,
            department: c.department
        })),
        requiredBy: requiredByClasses.map((c: any) => ({
            subjectNumber: c.subjectNumber,
            subjectTitle: c.subjectTitle,
            department: c.department
        }))
    }

    return {
        props: {
            classesProp: JSON.parse(JSON.stringify(classes)),
            reviewsProp: JSON.parse(JSON.stringify(reviews)),
            gradePointsProp: lastGradeReportUpload ? JSON.parse(JSON.stringify(shuffleArray((gradePointsData.length > 3 || user.trustLevel >= 2) ? gradePointsData : []))) : [],
            lastGradeReportUpload,
            submissionsProp: JSON.parse(JSON.stringify(submissions)),
            relatedClasses: JSON.parse(JSON.stringify(relatedClasses))
        }
    }
}

export default AggregatedPage