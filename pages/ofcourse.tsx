import { IClass } from "@/types"
import GradeReportModal from "@/components/GradeReportModal"
import User from "@/models/User"
import { buildGroupedCourseOptionSelectData } from "@/utils/courseOptions"
import mongoConnection from "@/utils/mongoConnection"
import { hasRecentGradeReport } from "@/utils/hasRecentGradeReport"
import { buildOfCourseData } from "@/utils/ofcourseData"
import { Center, Container, Select, Space, Table, Tabs, Text, Title, UnstyledButton, Stack, Card, Box, Badge, Group } from "@mantine/core"
import { showNotification } from "@mantine/notifications"
import { Chart as ChartJS, registerables } from "chart.js"
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from "next"
import Head from "next/head"
import { useRouter } from "next/router"
import { useMemo, useState } from "react"
import { auth } from "@/utils/auth"
import ui from "@/styles/Interface.module.css"
ChartJS.register(...registerables)

const yearsOrdered = [
    "First Year",
    "Sophomore Year",
    "Junior Year",
    "Senior Year",
] as const

const mengTab = "MEng"

const termsOrdered = [
    "FA",
    "JA",
    "SP"
]

const formatMengHeader = (yearTerm: string): string => {
    const parts = yearTerm.split(' ')
    const termCode = parts[1] || ''
    let termLabel = termCode

    if (termCode === 'FA') termLabel = 'Fall'
    else if (termCode === 'SP') termLabel = 'Spring'
    else if (termCode === 'JA') termLabel = 'IAP'

    return `${termLabel} Semester (MEng)`
}

type ClassEntry = { subjectNumber: string; subjectTitle: string; count: number | string; realCount?: number }

type CourseOptionLite = {
    id: string
    departmentCode: string
    courseOption: string | null
    courseName: string
}

type CourseOptionData = {
    courseOption: CourseOptionLite
    classes: Record<string, ClassEntry[]>
    mengClasses: Record<string, ClassEntry[]>
}

function ClassCountTable({
    classList,
    caption,
}: {
    classList: ClassEntry[]
    caption?: string
}) {
    return (
        <Center style={{ width: '100%' }}>
            <Box visibleFrom="sm" style={{ width: '100%' }}>
                <Table striped>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Subject Number</Table.Th>
                            <Table.Th>Subject Title</Table.Th>
                            <Table.Th>Count</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {classList.map((c) => (
                            <Table.Tr key={c.subjectNumber}>
                                <Table.Td>{c.subjectNumber}</Table.Td>
                                <Table.Td>{c.subjectTitle}</Table.Td>
                                <Table.Td>{c.count}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                    {caption && <Table.Caption>{caption}</Table.Caption>}
                </Table>
            </Box>
            <Stack gap="xs" hiddenFrom="sm" style={{ width: '100%' }} mt="xs">
                {classList.map((c) => (
                    <Card key={c.subjectNumber} withBorder padding="sm" radius="md">
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <Stack gap={2} style={{ flex: 1 }}>
                                <Text fw={700} size="sm">{c.subjectNumber}</Text>
                                <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>{c.subjectTitle}</Text>
                            </Stack>
                            <Badge variant="light" size="sm" color="blue" style={{ flexShrink: 0 }}>
                                {c.count} {c.count === 1 ? 'student' : 'students'}
                            </Badge>
                        </Group>
                    </Card>
                ))}
                {caption && (
                    <Text size="xs" c="dimmed" ta="center" mt="sm">{caption}</Text>
                )}
            </Stack>
        </Center>
    )
}

function YearPanel({
    year,
    classes,
}: {
    year: string
    classes: Record<string, ClassEntry[]> | undefined
}) {
    const entries = Object.entries(classes ?? {})
        .filter(([yearTerm]) => yearTerm.startsWith(year))
        .sort(([a], [b]) => {
            const termA = termsOrdered.indexOf(a.split(' ')[2])
            const termB = termsOrdered.indexOf(b.split(' ')[2])
            return termA - termB
        })

    if (entries.length === 0) {
        return (
            <>
                <Space h="sm" />
                <Text>No data available for this year.</Text>
            </>
        )
    }

    const springCaption = 'Reflected counts are based on the number of reviews (partial and full) submitted for each class. Students who are listed across two majors have class counts counted for both degrees. Classes are attributed to the last recorded degree affiliation for user and may have discrepancies due to changes in degree. Due to formatting of first year fall grades, the counts may not be accurate for first year fall classes. Classes with less than 3 reviews will not show counts.'

    return (
        <>
            {entries.map(([yearTerm, classList]) => (
                <div key={yearTerm}>
                    <Space h="md" />
                    <Title order={4}>{yearTerm}</Title>
                    <ClassCountTable
                        classList={classList}
                        caption={yearTerm.slice(-2) === 'SP' ? springCaption : undefined}
                    />
                </div>
            ))}
        </>
    )
}

function MengPanel({ mengClasses }: { mengClasses: Record<string, ClassEntry[]> | undefined }) {
    const entries = Object.entries(mengClasses ?? {}).sort(([a], [b]) => {
        const [yearA, termA] = a.split(' ')
        const [yearB, termB] = b.split(' ')
        if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB)
        return termsOrdered.indexOf(termA) - termsOrdered.indexOf(termB)
    })

    if (entries.length === 0) {
        return (
            <>
                <Space h="sm" />
                <Text>No MEng data available.</Text>
            </>
        )
    }

    const springCaption = 'Reflected counts are based on the number of reviews (partial and full) submitted for each class during MEng program. Students with term assignments show only their graduate degree classes here.'

    return (
        <>
            {entries.map(([yearTerm, classList]) => (
                <div key={yearTerm}>
                    <Space h="md" />
                    <Title order={4}>{formatMengHeader(yearTerm)}</Title>
                    <ClassCountTable
                        classList={classList}
                        caption={yearTerm.split(' ')[1] === 'SP' ? springCaption : undefined}
                    />
                </div>
            ))}
        </>
    )
}

const WhosTakenWhatPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({
    access,
    courseOptionsData
}: {
    access: boolean
    courseOptionsData: CourseOptionData[]
}) => {
    const router = useRouter()
    const [gradeReportModalOpened, setGradeReportModalOpened] = useState(false)
    const [selectedCourseOption, setSelectedCourseOption] = useState<string | null>(courseOptionsData?.[0]?.courseOption?.id || null)
    const [activeTab, setActiveTab] = useState<string | null>(yearsOrdered[0])

    const selected = useMemo(
        () => courseOptionsData.find((d) => d.courseOption.id === selectedCourseOption),
        [courseOptionsData, selectedCourseOption]
    )
    const hasMEngData = Boolean(selected?.mengClasses && Object.keys(selected.mengClasses).length > 0)
    const showMengTab = selected?.courseOption.departmentCode === '6' && hasMEngData

    const allCoursesOption = courseOptionsData.find((courseOptionData) => courseOptionData.courseOption.id === "All")
    const groupedCourseOptions = buildGroupedCourseOptionSelectData(
        courseOptionsData
            .filter((courseOptionData) => courseOptionData.courseOption.id !== "All")
            .map((courseOptionData) => ({
                _id: courseOptionData.courseOption.id,
                departmentCode: courseOptionData.courseOption.departmentCode,
                courseOption: courseOptionData.courseOption.courseOption,
                courseName: courseOptionData.courseOption.courseName,
            }))
    )
    const courseOptions = allCoursesOption
        ? [{ value: allCoursesOption.courseOption.id, label: allCoursesOption.courseOption.courseName }, ...groupedCourseOptions]
        : groupedCourseOptions

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
            router.replace(router.asPath)
        }
    }

    if (!access || !courseOptionsData || courseOptionsData.length === 0) {
        return (
            <Container className={ui.page} size="lg" px="md">
                <Head>
                    <title>Who&apos;s Taken What - MIT OpenGrades</title>
                </Head>
                <Title order={1} className={ui.heroTitle}>Who&apos;s Taken What?</Title>
                <Text mt="sm" c="dimmed">
                    You do not have access to this page. Please{' '}
                    <UnstyledButton
                        style={{ textDecoration: 'underline', color: 'var(--app-accent)' }}
                        onClick={() => setGradeReportModalOpened(true)}
                    >
                        upload
                    </UnstyledButton>
                    {' '}a grade report with partial reviews to view who&apos;s taken what.
                </Text>
                <GradeReportModal opened={gradeReportModalOpened} onClose={() => setGradeReportModalOpened(false)} onAddClasses={handleAddClassesFromModal} />
            </Container>
        )
    }

    return (
        <Container className={ui.page} size="lg" px="md">
            <Head>
                <title>Who&apos;s Taken What - MIT OpenGrades</title>
                <meta name="description" content={"Listing of classes taken per semester by department."} />
                <link rel="icon" href="/static/images/favicon.ico" />
            </Head>

            <Title order={1} className={ui.heroTitle}>Who&apos;s Taken What?</Title>
            <Text c="dimmed" mt="xs" mb="lg">Classes taken by year and term for each course option.</Text>

            <Select
                data={courseOptions}
                placeholder="Select a course"
                searchable
                value={selectedCourseOption}
                onChange={(value) => {
                    setSelectedCourseOption(value)
                    const next = courseOptionsData.find((d) => d.courseOption.id === value)
                    const nextShowMeng = next?.courseOption.departmentCode === '6'
                        && Boolean(next?.mengClasses && Object.keys(next.mengClasses).length > 0)
                    if (activeTab === mengTab && !nextShowMeng) {
                        setActiveTab(yearsOrdered[0])
                    }
                }}
                mb="lg"
            />

            <Tabs
                value={activeTab}
                onChange={setActiveTab}
                keepMounted={false}
            >
                <Tabs.List>
                    {yearsOrdered.map((year) => (
                        <Tabs.Tab key={year} value={year}>
                            {year}
                        </Tabs.Tab>
                    ))}
                    <Tabs.Tab
                        key={mengTab}
                        value={mengTab}
                        disabled={!showMengTab}
                        style={{ display: showMengTab ? undefined : 'none' }}
                    >
                        {mengTab}
                    </Tabs.Tab>
                </Tabs.List>

                {yearsOrdered.map((year) => (
                    <Tabs.Panel key={year} value={year} pt="sm">
                        <YearPanel year={year} classes={selected?.classes} />
                    </Tabs.Panel>
                ))}
                <Tabs.Panel key={mengTab} value={mengTab} pt="sm">
                    <MengPanel mengClasses={selected?.mengClasses} />
                </Tabs.Panel>
            </Tabs>
        </Container>
    )
}

interface ServerSideProps {
    access: boolean
    courseOptionsData: { courseOption: CourseOptionLite; classes: Record<string, ClassEntry[]>; mengClasses: Record<string, any[]> }[]
}

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (context) => {
    await mongoConnection()

    const session = await auth(context.req, context.res)

    if (session) {
        if (session.user && session.user?.email) {
            const user = await User.findOne({ email: session.user.email })
            if (user.trustLevel < 1) {
                return {
                    redirect: {
                        destination: '/',
                        permanent: false
                    }
                }
            }


            if (!hasRecentGradeReport(user.lastGradeReportUpload, 4)) {
                return {
                    props: {
                        access: false,
                        courseOptionsData: []
                    }
                }
            }
        }

        const courseOptionsData = await buildOfCourseData()

        return {
            props: {
                access: true,
                courseOptionsData
            }
        }
    }

    return {
        redirect: {
            destination: '/api/auth/signin',
            permanent: false
        }
    }
}

export default WhosTakenWhatPage
