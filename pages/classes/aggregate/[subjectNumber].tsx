// @ts-nocheck
import authOptions from '@/auth'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import { IClass, IClassReview } from '@/types'
import mongoConnection from '@/utils/mongoConnection'
import { Accordion, Alert, Avatar, Badge, Button, Card, Center, Container, Divider, Flex, Group, Paper, Space, Stack, Switch, Text, Title } from '@mantine/core'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import { getServerSession, Session } from 'next-auth'
import { useRouter } from 'next/router'
import { useState } from 'react'


import User from '@/models/User'
import styles from '@/styles/ClassPage.module.css'
import { BarChart, DonutChart } from '@mantine/charts'
import moment from 'moment-timezone'
import { ArrowUpCircle } from 'tabler-icons-react'


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

function ClassReviewComment ({ classReview,
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

    return (
        <Paper className={styles.comment} withBorder radius="md" >
            <Group>
                <Avatar alt={author.name} radius="xl" />
                <div>
                    {
                        trustLevel && trustLevel >= 2 ? <Text size="sm" className={styles.text}>{showName ? author.hiddenName : author.name}</Text> : <Text size="sm" className={styles.text}>{author.name}</Text>
                    }
                    <Text size="xs" c="dimmed">
                        {moment(classReview.createdAt).tz('America/New_York').format('MMMM DD, YYYY hh:mm a')}
                    </Text>
                    {(classReview.firstYear || classReview.retaking || classReview.droppedClass || trustLevel && trustLevel >= 2 && (reported || hidden)) ? <Space h='sm' /> : <></>}
                    <Group gap='xs'>
                        {classReview.firstYear && <Badge color={'indigo'} variant="filled">First Year</Badge>}
                        {classReview.retaking && <Badge color={'green'} variant="filled">Retake</Badge>}
                        {classReview.droppedClass && <Badge color={'yellow'} variant="filled">Dropped</Badge>}
                        {
                            trustLevel && trustLevel >= 2 && reported && <Badge color={'red'} variant="filled">Reported</Badge>
                        }
                        {
                            trustLevel && trustLevel >= 2 && hidden && <Badge color={'orange'} variant="filled">Hidden</Badge>
                        }
                    </Group>
                </div>
            </Group>
            <Text className={`${styles.text} ${styles.commentBody}`} size="sm">
                <b> Overall Rating: </b> {classReview.overallRating}/7 <br />
                <b> Hours Per Week: </b> {classReview.hoursPerWeek} <br />
                <b> Recommendation: </b> {classReview.recommendationLevel} - {RecommendationLevels[classReview.recommendationLevel]} <br />
            </Text>
            <Text className={`${styles.text} ${styles.commentBody}`} size="sm">
                <Divider mb='sm' />
                Class Comments: <em> &ldquo;{classReview.classComments}&rdquo; </em> <br />
                Background Comments: <em> &ldquo;{classReview.backgroundComments}&rdquo; </em>
            </Text>
            <Group justify='flex-end'>
                <Group gap="xs">
                    <Text>{upvotes - downvotes}</Text>
                    <ArrowUpCircle size={20} />
                </Group>
            </Group>
        </Paper>
    )
}

const AggregatedPage: NextPage<AggregateProps> = ({ classesProp, reviewsProp, gradePointsProp, lastGradeReportUpload }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
    const router = useRouter()

    const [classes, setClasses] = useState(classesProp)
    const [onlyOffered, setOnlyOffered] = useState(true)


    return (
        <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
            <Button variant='transparent' onClick={() => router.back()}>
                ← Back
            </Button>
            <Space h='lg' />
            <Alert
                color='orange'
                variant='filled'
                title='This page is still under construction and is not yet finalized.'
            />
            <Space h='lg' />
            <Title> Aggregated for {router.query.subjectNumber} </Title>
            <Space h='lg' />

            <Title> Summary </Title>
            <Center>
                <Group align='center'>
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
                            : <Text> {lastGradeReportUpload ? "No grade points for this class yet." : "You must upload a grade report with partial reviews in the past four months to display grade data."} </Text>
                    }

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
                            ) : <Text> No reviews for this class yet. </Text>
                    }
                </Group>
            </Center>

            {
                (reviewsProp.length > 0 || gradePointsProp.length > 0) && (
                    <>
                        <Title order={2}> By Term </Title>
                        <Space h='sm' />
                    </>
                )
            }
            <Flex>
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

            <Flex justify='space-between'>
                <Title order={2}> Classes </Title>

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
                                                    <Badge variant={reviewsProp.filter(r => r.class._id === c._id).length == 0 ? 'transparent' : 'filled'} color='purple'> {reviewsProp.filter(r => r.class._id === c._id).length} review{reviewsProp.filter(r => r.class === c._id).length === 1 ? '' : 's'} </Badge>
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

    function shuffleArray (array: unknown[]) {
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

    const lastGradeReportUpload = user.lastGradeReportUpload && (new Date().getTime() - new Date(user.lastGradeReportUpload).getTime()) < 1000 * 60 * 60 * 24 * 30 * 4

    return {
        props: {
            classesProp: JSON.parse(JSON.stringify(classes)),
            reviewsProp: JSON.parse(JSON.stringify(reviews)),
            gradePointsProp: lastGradeReportUpload ? JSON.parse(JSON.stringify(shuffleArray((gradePointsData.length > 3 || user.trustLevel >= 2) ? gradePointsData : []))) : [],
            lastGradeReportUpload
        }
    }
}

export default AggregatedPage