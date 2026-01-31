import { Accordion, Badge, Button, Flex, Group, List, LoadingOverlay, Modal, Stack, Switch, Text, Textarea } from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import { useState } from 'react'

import { IClass } from '@/types'
import Link from 'next/link'
import { usePlausibleTracker } from '@/utils/plausible'

const GradeReportModal = ({ opened, onClose, onAddClasses }: {
    opened: boolean
    onClose: () => void
    onAddClasses: (classes: { [key: string]: IClass[] }, partialReviews: { class: string; letterGrade: string; droppedClass: boolean, firstYear: boolean }[]) => void
}) => {
    const plausible = usePlausibleTracker()
    const [gradeReport, setGradeReport] = useState('')
    const [loading, setLoading] = useState(false)
    const [withPartialReviews, setWithPartialReviews] = useState(true)
    const [partialReviews, setPartialReviews] = useState<{ class: string; letterGrade: string; droppedClass: boolean, firstYear: boolean }[]>([])
    const [parsedClasses, setParsedClasses] = useState<{ [key: string]: IClass[] }>({})

    // Fetch and parse the grade report
    const handleParseGradeReport = async () => {
        setLoading(true)

        try {
            const response = await fetch('/api/me/grade-report-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gradeReport, withPartialReviews }),
            })

            const body = await response.json()
            if (response.ok && body.data) {
                const { matchedClasses = [], partialReviews = [] } = body.data

                const classesWithReviews = matchedClasses.reduce((acc: Record<string, IClass[]>, cls: IClass & { partialReviewGrade?: string; isDroppedClass?: boolean }) => {
                    const key = `${cls.academicYear}`

                    const matchingPR = partialReviews.find((pr: any) => pr.class === cls._id)

                    if (matchingPR) {
                        cls.partialReviewGrade = matchingPR.letterGrade
                        cls.isDroppedClass = matchingPR.droppedClass
                    }

                    if (!acc[key]) {
                        acc[key] = []
                    }
                    acc[key].push(cls)

                    return acc
                }, {})

                setParsedClasses(classesWithReviews)
                setPartialReviews(partialReviews)
                showNotification({ title: 'Success!', message: 'Grade report parsed successfully.', color: 'green' })
            } else {
                showNotification({ title: 'Error!', message: body.message, color: 'red' })
            }
        } catch (error) {
            showNotification({ title: 'Error!', message: 'Failed to parse grade report.', color: 'red' })
        }

        setLoading(false)
    }

    // Submit the parsed classes
    const handleSubmit = () => {
        // Track grade report upload
        const totalClasses = Object.values(parsedClasses).flat().length
        const terms = Object.keys(parsedClasses)
        plausible('Grade Report Upload', {
            props: {
                classCount: totalClasses.toString(),
                term: terms.length > 0 ? terms[0] : 'Unknown'
            }
        })
        onAddClasses(parsedClasses, partialReviews)
        setGradeReport('')
        setParsedClasses({})
        onClose()
    }

    function getEmojiForTerm(term: string) {
        term = term.substring(4)
        switch (term) {
            case 'FA':
                return '🍁'
            case 'SP':
                return '🌸'
            case 'JA':
                return '❄️'
            default:
                return ''
        }
    }

    return (
        <Modal opened={opened} onClose={onClose} title="Upload Grade Report" size="lg">
            <LoadingOverlay visible={loading} />
            <Stack>
                <Text variant='muted'>Please paste your <Link target="_blank" href='https://student.mit.edu/cgi-bin/shrwsgrd.sh'>grade report</Link> (entire page) below to add classes to your profile.</Text>

                <Textarea
                    placeholder="Paste your grade report here..."
                    label="Grade Report"
                    value={gradeReport}
                    onChange={(e) => setGradeReport(e.target.value)}
                />
                <Switch label="Generate partial reviews w/ grades" checked={withPartialReviews} onChange={() => setWithPartialReviews((v) => !v)} />
                <Button onClick={handleParseGradeReport} disabled={!gradeReport.trim() || loading}>
                    Parse Grade Report
                </Button>
                {Object.keys(parsedClasses).length > 0 && (
                    <>
                        <Text>Preview Classes:</Text>
                        <Accordion variant='contained'>
                            {Object.entries(parsedClasses)
                                .sort(([a], [b]) => Number(b) - Number(a)) // Sort by academic year (descending)
                                .map(([academicYear, classes]) => (
                                    <Accordion.Item value={academicYear} key={academicYear}>
                                        <Accordion.Control>
                                            {Number(academicYear) - 1} - {academicYear}
                                        </Accordion.Control>
                                        <Accordion.Panel>
                                            <List spacing="xs">
                                                {classes
                                                    .sort((a, b) => a.term.localeCompare(b.term)) // Sort classes by term
                                                    .map((classTaken: IClass & { partialReviewGrade?: string; isDroppedClass?: boolean }) => (
                                                        <List.Item
                                                            key={classTaken._id}
                                                        >
                                                            <Flex align="center">
                                                                <Text>
                                                                    {getEmojiForTerm(classTaken.term)} {classTaken.subjectNumber}: {classTaken.subjectTitle} {classTaken && classTaken.partialReviewGrade && <Badge color='violet'>{classTaken.partialReviewGrade} </Badge>}
                                                                </Text>
                                                            </Flex>
                                                        </List.Item>
                                                    ))}
                                            </List>
                                        </Accordion.Panel>
                                    </Accordion.Item>
                                ))}
                        </Accordion>
                        <Group align="right" mt="md">
                            <Button onClick={handleSubmit} disabled={loading}>
                                Add Classes
                            </Button>
                        </Group>
                    </>
                )}
            </Stack>
        </Modal>
    )
}

export default GradeReportModal
