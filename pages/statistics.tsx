import GradeReportModal from "@/components/GradeReportModal"
import ClassReview from "@/models/ClassReview"
import User from "@/models/User"
import { IUser } from "@/types"
import mongoConnection from "@/utils/mongoConnection"
import { hasRecentGradeReport } from "@/utils/hasRecentGradeReport"
import { Container, Group, SegmentedControl, Space, Text, Title, UnstyledButton } from "@mantine/core"
import { showNotification } from "@mantine/notifications"
import { Chart as ChartJS, registerables } from "chart.js"
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from "next"
import { getServerSession, Session } from "next-auth"
import { useRouter } from "next/router"
import authOptions from "pages/api/auth/[...nextauth]"
import { useState } from "react"
import { Bar, Line } from "react-chartjs-2"

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
    "21",
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

const sortedGrades = [
    "A",
    "B",
    "C",
    "P",
    "D",
    "F",
    "DR"
]

const brewerRdYlGn5 = [
    "rgba(215, 48, 39, 0.7)",
    "rgba(252, 141, 89, 0.7)",
    "rgba(254, 224, 139, 0.7)",
    "rgba(217, 239, 139, 0.7)",
    "rgba(145, 207, 96, 0.7)"
].reverse()

const brewerRdYlGn7 = [
    "rgba(215, 48, 39, 0.7)",
    "rgba(252, 141, 89, 0.7)",
    "rgba(254, 224, 139, 0.7)",
    "rgba(255, 255, 191, 0.7)",
    "rgba(217, 239, 139, 0.7)",
    "rgba(145, 207, 96, 0.7)",
    "rgba(26, 152, 80, 0.7)"
].reverse()

const StatisticsPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ people, classReviews, access }) => {
    const router = useRouter()

    if (!access) {
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
            <Container style={{
                padding: 'var(--mantine-spacing-lg)',
            }} >
                <Title>Statistics</Title>
                <Text>You do not have access to this page. Please <UnstyledButton style={{ textDecoration: "underline", color: "blue" }} onClick={() => setGradeReportModalOpened(true)}>upload</UnstyledButton> a grade report with partial reviews to view statistics.</Text>
                <GradeReportModal opened={gradeReportModalOpened} onClose={() => setGradeReportModalOpened(false)} onAddClasses={handleAddClassesFromModal} />

            </Container>
        )
    }

    const [displayLevel, setDisplayLevel] = useState('all')

    const labels = Array.from(
        new Set(
            people.flatMap((person: IUser) =>
                person.courseAffiliation.map(aff => aff.departmentCode)
            )
        )
    ).sort((a, b) => departmentsSorted.indexOf(a) - departmentsSorted.indexOf(b))

    const filteredPeople = people.filter((person: IUser) => displayLevel === 'all' || (displayLevel === "G" ? person.year === "G" : ['1', '2', '3', '4'].includes(person.year)))

    // create a chart.js dataset for the number of people in each department under each courseOption
    // for each courseOption make a distinct dataset with the number of people in that courseOption, ultimately we are grouping by the departmentCode

    const departmentData = {
        labels,
        datasets: [
            ...Array.from(
                new Set(
                    filteredPeople.flatMap((person: IUser) =>
                        person.courseAffiliation.map(aff => aff.courseOption)
                    )
                )
            ).map(courseOption => ({
                label: courseOption,
                data: labels.map(dep =>
                    filteredPeople.reduce(
                        (total, person: IUser) =>
                            total + person.courseAffiliation.filter(a => a.departmentCode === dep && a.courseOption === courseOption).length,
                        0
                    )
                ),
            }))
        ]
    }

    const departmentOptions = {
        responsive: true,
        scales: {
            x: { stacked: true, ticks: { display: true, autoSkip: false }, title: { display: true, text: "Department" } },
            y: { stacked: true, title: { display: true, text: 'Number of People' } },
        },
        plugins: {
            colors: { enabled: true, forceOverride: true },
            title: {
                display: true,
                text: 'Number of People in Each Department by Course Option'
            }
        },

    }

    const aggregateByDate = (items: { createdAt: string }[]) => {
        const map = new Map<string, number>()
        for (const item of items) {
            const date = new Date(item.createdAt).toLocaleDateString()
            map.set(date, (map.get(date) || 0) + 1)
        }
        return map
    }

    const createdAtPeopleMap = aggregateByDate(filteredPeople)
    const createdAtReviewMap = aggregateByDate(classReviews)

    const combinedLineLabels = Array.from(
        new Set([...createdAtPeopleMap.keys(), ...createdAtReviewMap.keys()])
    ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

    const getCumulativeData = (map: Map<string, number>, labels: string[]) => {
        let cumulative = 0
        return labels.map(date => {
            cumulative += map.get(date) || 0
            return cumulative
        })
    }

    const cumulativePeopleData = getCumulativeData(createdAtPeopleMap, combinedLineLabels)
    const cumulativeReviewData = getCumulativeData(createdAtReviewMap, combinedLineLabels)




    const lineData = {
        labels: combinedLineLabels,
        datasets: [
            {
                label: "# of Users",
                data: cumulativePeopleData,
                yAxisID: "y",
            },
            {
                label: "# of Reviews",
                data: cumulativeReviewData,
                yAxisID: "y1",
            },
        ],
    }

    const lineOptions = {
        responsive: true,
        scales: {
            x: { title: { display: true, text: "Date" } },
            y: {
                type: 'linear',
                title: { display: true, text: "Users" }
            },
            y1: {
                type: 'linear',
                title: { display: true, text: "Reviews" },
                position: "right",
                grid: { drawOnChartArea: false }
            }
        },
        plugins: {
            title: { display: true, text: "Cumulative Users & Reviews Over Time" },
        },
    }

    // const uniqueDepartments = Array.from(
    //     new Set(
    //         classReviews.flatMap(r => [
    //             r.class?.department,
    //             ...(r.class?.crossListedDepartments || [])
    //         ])
    //     )
    // ).filter(Boolean)

    // const allCourseNumbers = classReviews.flatMap(r => [r.class?.subjectNumber])
    const extractDepartments = (review) => [
        review.class?.department,
        ...(review.class?.crossListedDepartments || [])
    ]

    const extractSubjects = (review) => [
        review.class?.subjectNumber,
        ...(review.class?.aliases || [])
    ]

    // Get unique departments from reviews
    const uniqueDepartments = Array.from(
        new Set(classReviews.flatMap(extractDepartments))
    ).filter(Boolean).sort((a, b) => departmentsSorted.indexOf(a) - departmentsSorted.indexOf(b))

    const validReviews = classReviews.filter(r => r.overallRating && r.recommendationLevel)

    const allCourseNumbers = new Map()
    validReviews.forEach(review => {
        extractSubjects(review).forEach(subject => {
            allCourseNumbers.set(subject, extractDepartments(review))
        })
    })

    const generateBarData = (valueExtractor, colorScheme, sortFunction) => {
        if (!sortFunction) {
            sortFunction = (a, b) => Number(b) - Number(a)
        }
        const uniqueValues = Array.from(new Set(validReviews.map(valueExtractor).filter(Boolean))).sort(sortFunction)

        return {
            labels: uniqueDepartments, // Use the pre-sorted department list
            datasets: uniqueValues.map((value) => ({
                label: value.toString(),
                data: uniqueDepartments.map(dept => {
                    const relevantReviews = validReviews.filter(r => extractDepartments(r).includes(dept))
                    const total = relevantReviews.length
                    if (total === 0) return 0
                    const count = relevantReviews.filter(r => valueExtractor(r) === value).length
                    return (count / total) * 100
                }),
                backgroundColor: colorScheme[uniqueValues.indexOf(value)]
            })).sort((a, b) => Number(b.label) - Number(a.label))
        }
    }

    const recBarData = generateBarData(r => r.recommendationLevel, brewerRdYlGn5)
    const ratingBarData = generateBarData(r => r.overallRating, brewerRdYlGn7)


    const recBarOptions = {
        responsive: true,
        scales: {
            x: { stacked: true, ticks: { display: true, autoSkip: false }, title: { display: true, text: "Department" } },
            y: {
                stacked: true,
                max: 100,
                title: { display: true, text: "Percentage" }
            }
        },
        plugins: {
            title: { display: true, text: "Recommendation Levels by Department" },

        }
    }

    const ratingBarOptions = {
        responsive: true,
        scales: {
            x: { stacked: true, ticks: { display: true, autoSkip: false }, title: { display: true, text: "Department" } },
            y: {
                stacked: true,
                max: 100,
                title: { display: true, text: "Percentage" }
            }
        },
        plugins: {
            title: { display: true, text: "Overall Ratings by Department" },
        }
    }


    return (
        <Container style={{
            padding: 'var(--mantine-spacing-lg)',
        }} >
            <Title>MIT OpenGrades</Title>

            <Space h="lg" />

            <Group align='right'>
                <SegmentedControl onChange={setDisplayLevel} value={displayLevel} data={['all', 'U', 'G']} />
            </Group>

            <Bar data={departmentData} options={departmentOptions} />

            <Line data={lineData} options={lineOptions} />

            <Bar data={recBarData} options={recBarOptions} />
            <Bar data={ratingBarData} options={ratingBarOptions} />

        </Container >
    )
}

interface ServerSideProps {
    people: {
        courseAffiliation: { departmentCode: string, courseOption: string }[],
        year: string,
        createdAt: Date
    }[],
    classReviews: {
        class: { department: string, subjectNumber: string, crossListedDepartments: string[], aliases: string[] },
        overallRating: number,
        recommendationLevel: number,
        letterGrade: string,
        createdAt: Date,
    }[],
    access: boolean
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

            if (!hasRecentGradeReport(user.lastGradeReportUpload, 4)) {
                return {
                    props: {
                        access: false,
                        people: [],
                        classReviews: []
                    }
                }
            }
        }

        let people = await User.find(
            { courseAffiliation: { $ne: null } },
            { courseAffiliation: 1, year: 1, createdAt: 1, _id: 0 }
        ).populate('courseAffiliation', 'departmentCode courseOption').lean()


        let classReviews = await ClassReview.find(
            {},
            { class: 1, overallRating: 1, recommendationLevel: 1, letterGrade: 1, createdAt: 1, _id: 0 }
        ).populate('class', 'department crossListedDepartments subjectNumber aliases').lean()

        return {
            props: {
                access: true,
                people: JSON.parse(JSON.stringify(people)),
                classReviews: JSON.parse(JSON.stringify(classReviews))
            }
        }

    }
}

export default StatisticsPage