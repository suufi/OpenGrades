// @ts-nocheck
import GradeReportModal from "@/components/GradeReportModal"
import Class from "@/models/Class"
import ClassReview from "@/models/ClassReview"
import CourseOption from "@/models/CourseOption"
import User from "@/models/User"
import mongoConnection from "@/utils/mongoConnection"
import { Center, Container, Select, Space, Table, Tabs, Text, Title } from "@mantine/core"
import { Chart as ChartJS, registerables } from "chart.js"
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from "next"
import { getServerSession, Session } from "next-auth"
import Head from "next/head"
import { useRouter } from "next/router"
import authOptions from "pages/api/auth/[...nextauth]"
import { useState } from "react"

ChartJS.register(...registerables)

const departmentsSorted = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "14",
    "15",
    "16",
    "17",
    "18",
    "20",
    "21A",
    "21E",
    "21G",
    "21H",
    "21L",
    "21M",
    "21S",
    "21T",
    "21W",
    "22",
    "24",
    "CSB",
    "STS",
    "WGS",
    "EC",
    "ES",
    "CC",
    "SP",
    "CMS",
    "CSE",
    "EM",
    "HST",
    "IDS",
    "MAS",
    "OR",
    "RED",
    "SCM",
    "UND",
]

const yearsOrdered = [
    "First Year",
    "Sophomore Year",
    "Junior Year",
    "Senior Year",
]

const termsOrdered = [
    "FA",
    "JA",
    "SP"
]

const WhosTakenWhatPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ access, courseOptionsData }) => {
    const router = useRouter()

    const [selectedCourseOption, setSelectedCourseOption] = useState<string | null>(courseOptionsData[0].courseOption.id)

    const courseOptions = courseOptionsData
        .sort((a: any, b: any) => {
            const aDept = a.courseOption.departmentCode
            const bDept = b.courseOption.departmentCode

            const aDeptIndex = departmentsSorted.indexOf(aDept)
            const bDeptIndex = departmentsSorted.indexOf(bDept)

            return aDeptIndex - bDeptIndex
        }).map((courseOption: any) => {
            return {
                value: courseOption.courseOption.id,
                label: `${courseOption.courseOption.departmentCode}${courseOption.courseOption.courseOption ? `-${courseOption.courseOption.courseOption}` : ''}: ${courseOption.courseOption.courseName}`
            }
        })
    if (!access) {
        const [gradeReportModalOpened, setGradeReportModalOpened] = useState(false)
        const handleAddClassesFromModal = async (classes: { [key: string]: IClass[] }, partialReviews: { class: string; letterGrade: string; dropped: boolean, firstYear: boolean }[]) => {
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
            <Container style={{
                padding: 'var(--mantine-spacing-lg)',
            }} >
                <Title>Who's Taken What?</Title>
                <Text>You do not have access to this page. Please <UnstyledButton style={{ textDecoration: "underline", color: "blue" }} onClick={() => setGradeReportModalOpened(true)}>upload</UnstyledButton> a grade report with partial reviews to view who's taken what. Please review the About page to learn more about why this is required.</Text>
                <GradeReportModal opened={gradeReportModalOpened} onClose={() => setGradeReportModalOpened(false)} onAddClasses={handleAddClassesFromModal} />

            </Container>
        )
    }


    return (
        <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
            <Head>
                <title>Who's Taken What - MIT OpenGrades</title>
                <meta name="description" content={"Listing of classes taken per semester by department."} />
                <link rel="icon" href="/static/images/favicon.ico" />
            </Head>

            <Title order={1}>Who's Taken What?</Title>

            <Space h="lg" />

            <Select data={courseOptions} placeholder="Select a course" searchable defaultValue={courseOptions[0].value} onChange={(value) => {
                setSelectedCourseOption(value)
            }} />

            <Space h="lg" />

            <Tabs defaultValue={yearsOrdered[0]}>
                <Tabs.List>
                    {
                        yearsOrdered.map((year) => (
                            <Tabs.Tab key={year} value={year}>
                                {year}
                            </Tabs.Tab>
                        ))
                    }
                </Tabs.List>
                {
                    yearsOrdered.map((year) => {
                        return (
                            <Tabs.Panel key={year} value={year}>
                                {(() => {
                                    const selected = courseOptionsData.find(
                                        (d: any) => d.courseOption.id === selectedCourseOption
                                    )
                                    if (!selected || !selected.classes) return null

                                    if (Object.entries(selected.classes)
                                        .filter(([yearTerm, _]) => yearTerm.startsWith(year)).length === 0) return <>
                                            <Space h="sm" />
                                            <Text>
                                                No data available for this year.
                                            </Text>
                                        </>

                                    return Object.entries(selected.classes)
                                        .filter(([yearTerm, _]) => yearTerm.startsWith(year))
                                        .sort(([a], [b]) => {
                                            const termA = termsOrdered.indexOf(a.split(' ')[2])
                                            const termB = termsOrdered.indexOf(b.split(' ')[2])
                                            return termA - termB
                                        })
                                        .map(([yearTerm, classList]: any) => (
                                            <div key={yearTerm}>
                                                <Space h="md" />
                                                <Title order={4}>{yearTerm}</Title>
                                                <Center>
                                                    <Table striped>
                                                        <Table.Thead>
                                                            <Table.Tr>
                                                                <Table.Th>Subject Number</Table.Th>
                                                                <Table.Th>Subject Title</Table.Th>
                                                                <Table.Th>Count</Table.Th>
                                                            </Table.Tr>
                                                        </Table.Thead>
                                                        <Table.Tbody>
                                                            {classList.map((c: any) => (
                                                                <Table.Tr key={c.subjectNumber}>
                                                                    <Table.Td>{c.subjectNumber}</Table.Td>
                                                                    <Table.Td>{c.subjectTitle}</Table.Td>
                                                                    <Table.Td>{c.count}</Table.Td>
                                                                </Table.Tr>
                                                            ))}
                                                        </Table.Tbody>
                                                        {
                                                            yearTerm.slice(-2) == "SP" && (
                                                                <Table.Caption>
                                                                    Reflected counts are based on the number of reviews (partial and full) submitted for each class. Students who are listed across two majors have class counts counted for both degrees. Classes are attributed to the last recorded degree affiliation for user and may have discrepancies due to changes in degree. Due to formatting of first year fall grades,
                                                                    the counts may not be accurate for first year fall classes. Classes with less than 3 reviews will not show counts.
                                                                </Table.Caption>
                                                            )
                                                        }
                                                    </Table>
                                                </Center>
                                            </div>
                                        ))
                                })()}
                            </Tabs.Panel>
                        )
                    })
                }
            </Tabs>


        </Container>
    )

}

interface ServerSideProps {
    access: boolean
    courseOptionsData: any
}

// Utility function to infer academic year group
const getYearLabel = (classOf: number, academicYear: number): string | null => {
    const yearDiff = classOf - academicYear
    if (yearDiff === 3) return 'First Year'
    if (yearDiff === 2) return 'Sophomore Year'
    if (yearDiff === 1) return 'Junior Year'
    if (yearDiff === 0) return 'Senior Year'
    return null // Outside 4-year range
}

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (context) => {
    await mongoConnection()

    const session: Session | null = await getServerSession(context.req, context.res, authOptions)

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

            // if the user.lastGradeReportUpload is null or the lastGradeReportUpload is more than 4 months ago then redirect to /
            // mandates that the user uploads a grade report every 4 months to access statistics
            if (!user.lastGradeReportUpload || (new Date().getTime() - new Date(user.lastGradeReportUpload).getTime()) > 1000 * 60 * 60 * 24 * 30 * 4) {
                return {
                    props: {
                        access: false,
                        courseOptionsData: []
                    }
                }
            }
        }

        const reviewedClassIds = await ClassReview.distinct('class')
        const allClasses = await Class.find({ _id: { $in: reviewedClassIds } })
            .select('subjectNumber aliases subjectTitle')
        const subjectToCanonical = new Map<string, string>()
        const subjectTitleMap = new Map<string, string>()

        for (const cls of allClasses) {
            const canonical = cls.subjectNumber
            subjectToCanonical.set(canonical, canonical)
            subjectTitleMap.set(canonical, cls.subjectTitle)

            for (const alias of cls.aliases || []) {
                subjectToCanonical.set(alias, canonical)
            }
        }

        const allCourseOptions = await CourseOption.find({
            courseLevel: "U"
        })

        const courseOptionsData = []

        for (const courseOption of allCourseOptions) {

            const affiliatedUsers = await User.find({
                courseAffiliation: courseOption._id,
                classOf: { $ne: null }
            }).select('_id classOf')

            const userMap = new Map<string, number>()
            affiliatedUsers.forEach(u => userMap.set(u._id.toString(), u.classOf))

            const reviews = await ClassReview.find({
                author: { $in: Array.from(userMap.keys()) }
            }).populate('class')

            const yearTermMap: Record<string, Map<string, { subjectTitle: string, count: number }>> = {}

            for (const review of reviews) {
                const classDoc = review.class as any
                const authorId = review.author.toString()
                const userClassOf = userMap.get(authorId)

                if (!classDoc || !userClassOf) continue

                const yearLabel = getYearLabel(userClassOf, classDoc.academicYear)
                if (!yearLabel) continue

                const term = classDoc.term.slice(-2) // FA, JA, SP
                const yearTermKey = `${yearLabel} ${term}`

                if (!yearTermMap[yearTermKey]) {
                    yearTermMap[yearTermKey] = new Map()
                }

                const rawSubjectNumber = classDoc.subjectNumber
                const canonicalSubjectNumber = subjectToCanonical.get(rawSubjectNumber) || rawSubjectNumber
                const canonicalSubjectTitle = subjectTitleMap.get(canonicalSubjectNumber) || classDoc.subjectTitle

                const existing = yearTermMap[yearTermKey].get(canonicalSubjectNumber)
                if (existing) {
                    existing.realCount += 1
                } else {
                    yearTermMap[yearTermKey].set(canonicalSubjectNumber, { subjectTitle: canonicalSubjectTitle, realCount: 1 })
                }
            }

            // Sort + take top 10 for each year, term
            const classesByTerm: Record<string, { subjectNumber: string, subjectTitle: string, count: number }[]> = {}

            Object.entries(yearTermMap).forEach(([yearTerm, classMap]) => {
                const sorted = Array.from(classMap.entries())
                    .sort((a, b) => b[1].realCount - a[1].realCount)
                    .slice(0, 10)
                    .map(([subjectNumber, { subjectTitle, realCount }]) => ({
                        subjectNumber,
                        subjectTitle,
                        count: realCount >= 3 ? realCount : '<3',
                        realCount
                    }))

                classesByTerm[yearTerm] = sorted
            })

            // If no classes are in all terms, skip this courseOption
            if (Object.values(classesByTerm).every(c => c.length === 0)) continue

            courseOptionsData.push({
                courseOption: {
                    id: courseOption._id,
                    courseName: courseOption.courseName || courseOption.departmentName,
                    courseOption: courseOption.courseOption,
                    departmentCode: courseOption.departmentCode
                },
                classes: classesByTerm
            })
        }

        const allData = {
            courseOption: {
                id: "All",
                courseName: "All Courses",
                courseOption: null,
                departmentCode: "All"
            },
            classes: []
        }

        courseOptionsData.forEach((courseOptionData) => {
            Object.entries(courseOptionData.classes).forEach(([yearTerm, classList]) => {
                if (!allData.classes[yearTerm]) {
                    allData.classes[yearTerm] = []
                }

                allData.classes[yearTerm].push(...classList)
            })
        })

        const finalAllClasses: typeof allData.classes = {}

        Object.entries(allData.classes).forEach(([yearTerm, classList]) => {
            const accMap = new Map<string, { subjectNumber: string, subjectTitle: string, count: number }>()

            classList.forEach(({ subjectNumber, subjectTitle, count, realCount }) => {
                const canonical = subjectToCanonical.get(subjectNumber) || subjectNumber
                const canonicalTitle = subjectTitleMap.get(canonical) || subjectTitle

                if (accMap.has(canonical)) {
                    accMap.get(canonical)!.realCount += realCount
                } else {
                    accMap.set(canonical, {
                        subjectNumber: canonical,
                        subjectTitle: canonicalTitle,
                        count,
                        realCount,
                    })
                }
            })

            finalAllClasses[yearTerm] = Array.from(accMap.values())
                .sort((a, b) => b.realCount - a.realCount)
                .slice(0, 10)
                .map(({ subjectNumber, subjectTitle, count, realCount }) => ({
                    subjectNumber,
                    subjectTitle,
                    count: realCount >= 3 ? realCount : '<3'
                }))
        })

        allData.classes = finalAllClasses

        courseOptionsData.push(allData)

        // strip realCount from courseOptionsData
        courseOptionsData.forEach((courseOptionData) => {
            Object.entries(courseOptionData.classes).forEach(([yearTerm, classList]) => {
                classList.forEach((classItem) => {
                    delete classItem.realCount
                })
            })
        })

        return {
            props: {
                access: true,
                courseOptionsData: JSON.parse(JSON.stringify(courseOptionsData))
            }
        }

    }
}

export default WhosTakenWhatPage