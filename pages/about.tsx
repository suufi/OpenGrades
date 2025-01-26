// @ts-nocheck

import Class from "@/models/Class"
import ClassReview from "@/models/ClassReview"
import FAQ from "@/models/FAQ"
import User from "@/models/User"
import mongoConnection from "@/utils/mongoConnection"
import { Accordion, Avatar, Container, Divider, Flex, Grid, NumberFormatter, Skeleton, Space, Stack, Text, Title } from "@mantine/core"
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from "next"

const extractInitials = (name: string) => {
    return name.split(' ').map((name) => name[0]).join('')
}


const AboutPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ classCount, classReviewCount, userCount, faqs, maintainers, supporters }) => {


    const faqItems = faqs ? faqs.map((item) => (
        <Accordion.Item key={item._id} value={item._id}>
            <Accordion.Control>{item.question}</Accordion.Control>
            <Accordion.Panel>
                <Text>
                    <div dangerouslySetInnerHTML={{ __html: item.answer }} />
                </Text>
            </Accordion.Panel>
        </Accordion.Item>
    )) : []

    return (
        <Container style={{
            padding: 'var(--mantine-spacing-lg)',
        }}>
            <Title>MIT OpenGrades</Title>

            <Divider m={'lg'} />

            <Text>
                MIT OpenGrades is a platform for students to share their experiences with classes at MIT. We hope
                that this will help students make more informed decisions about what classes to take.
            </Text>

            <Space h={'lg'} />

            <Flex justify={'space-between'}>


                <Title order={1} style={{ textAlign: 'center' }}>
                    {classCount ? <NumberFormatter value={classCount} thousandSeparator /> : <Skeleton />}
                    <Text> classes </Text>
                </Title>

                <Title order={1} style={{ textAlign: 'center' }}>
                    {userCount ? <NumberFormatter value={userCount} thousandSeparator /> : <Skeleton />}
                    <Text> users </Text>
                </Title>

                <Title order={1} style={{ textAlign: 'center' }}>
                    {classReviewCount ? <NumberFormatter value={classReviewCount[0].partialTrueCount + classReviewCount[0].partialFalseCount} thousandSeparator /> : <Skeleton />}
                    <Text> total reviews </Text>
                </Title>

                <Title order={1} style={{ textAlign: 'center' }}>
                    {classReviewCount ? <NumberFormatter value={classReviewCount[0].partialFalseCount} thousandSeparator /> : <Skeleton />}
                    <Text> full reviews </Text>
                </Title>


            </Flex>

            <Divider m={'xl'} />
            <Title order={2}> Frequently Asked Questions </Title>
            <Accordion defaultValue={faqItems[0]._id} variant="filled">
                {faqItems}
            </Accordion>
            <Divider m={'xl'} />

            <Title order={2}> Maintainers </Title>
            <Space h={'lg'} />
            <Grid justify="space-around">
                {
                    maintainers.map((maintainer) => {
                        return (
                            <Grid.Col span={{ base: 6, xs: 6, sm: 4, md: 3, lg: 2 }}>
                                <Stack align="center" direction="column">
                                    <Avatar size='xl' src={maintainer?.avatar} name={maintainer?.initials} color="initials" />
                                    <Text>{maintainer.kerb} {maintainer?.year && '\'' + maintainer?.year}</Text>
                                </Stack>
                            </Grid.Col>
                        )
                    })
                }
            </Grid>
            <Space h={'lg'} />
            <Title order={2}> Supporters </Title>
            <Space h={'lg'} />
            <Grid justify="space-around">

                {
                    supporters.map((supporter) => {
                        return (
                            <Grid.Col span={{ base: 6, xs: 6, sm: 4, md: 3, lg: 2 }}>
                                <Stack align="center" direction="column">
                                    <Avatar size='xl' name={supporter?.initials} color="initials" />
                                    <Text>{supporter.kerb} {supporter?.year && '\'' + supporter?.year}</Text>
                                </Stack>
                            </Grid.Col>
                        )
                    })
                }
            </Grid>
        </Container >
    )
}

interface ServerSideProps {
    classCount: number,
    classReviewCount: {
        _id: null,
        partialTrueCount: number,
        partialFalseCount: number
    },
    userCount: number
}

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (context) => {
    await mongoConnection()

    const faqs = await FAQ.find({}).lean()

    const classCount = await Class.countDocuments({
        offered: true
    })

    const classReviewCount = await ClassReview.aggregate(
        [
            {
                $group: {
                    _id: null,
                    partialTrueCount: { $sum: { $cond: ["$partial", 1, 0] } },
                    partialFalseCount: { $sum: { $cond: ["$partial", 0, 1] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    partialTrueCount: 1,
                    partialFalseCount: 1
                }
            }
        ]
    )

    const userCount = await User.countDocuments()

    let maintainers = await User.find({
        supportStatus: 'Maintainer',
    }).select('kerb classOf avatar name').lean()

    maintainers = maintainers.map((maintainer) => {
        return {
            kerb: maintainer.kerb,
            year: maintainer.classOf.toString().slice(2),
            avatar: maintainer.avatar || null,
            initials: extractInitials(maintainer.name)
        }
    })

    let supporters = await User.find({
        supportStatus: 'Supporter',
    }).select('kerb classOf avatar name').lean()

    supporters = supporters.map((supporter) => {
        return {
            kerb: supporter.kerb,
            year: supporter.classOf.toString().slice(2),
            avatar: supporter.avatar || null,
            initials: extractInitials(supporter.name)
        }
    })


    console.log({
        classCount,
        classReviewCount,
        userCount
    })


    return {
        props: {
            classCount,
            classReviewCount: JSON.parse(JSON.stringify(classReviewCount)),
            userCount,
            faqs: JSON.parse(JSON.stringify(faqs)),
            maintainers,
            supporters
        }
    }

}

export default AboutPage