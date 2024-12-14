import { Accordion, Button, Flex, Group, List, LoadingOverlay, Modal, Stack, Text, Textarea } from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import { useState } from 'react'

import { IClass } from '@/types'
import Link from 'next/link'

const GradeReportModal = ({ opened, onClose, onAddClasses }: {
    opened: boolean
    onClose: () => void
    onAddClasses: (classes: { [key: string]: IClass[] }) => void
}) => {
    const [gradeReport, setGradeReport] = useState('')
    const [loading, setLoading] = useState(false)
    const [parsedClasses, setParsedClasses] = useState<{ [key: string]: IClass[] }>({})

    // Fetch and parse the grade report
    const handleParseGradeReport = async () => {
        setLoading(true)

        try {
            const response = await fetch('/api/me/grade-report-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gradeReport }),
            })

            const body = await response.json()
            if (response.ok) {
                const classes = body.data.reduce((acc: { [key: string]: IClass[] }, c: IClass) => {
                    const key = `${c.academicYear}`
                    if (acc[key]) {
                        acc[key].push(c)
                    } else {
                        acc[key] = [c]
                    }
                    return acc
                }, {})
                setParsedClasses(classes)
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
        onAddClasses(parsedClasses)
        setGradeReport('')
        setParsedClasses({})
        onClose()
    }

    function getEmojiForTerm (term: string) {
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
        <Modal opened={opened} onClose={onClose} title="Upload Grade Report">
            <LoadingOverlay visible={loading} />
            <Stack>
                <Text variant='muted'>Please paste your <Link href='https://student.mit.edu/cgi-bin/shrwsgrd.sh'>grade report</Link> (entire page) below to add classes to your profile.</Text>

                <Textarea
                    placeholder="Paste your grade report here..."
                    label="Grade Report"
                    value={gradeReport}
                    onChange={(e) => setGradeReport(e.target.value)}
                />
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
                                                    .map((classTaken: IClass) => (
                                                        <List.Item
                                                            key={classTaken._id}
                                                        >
                                                            <Flex align="center">
                                                                <Text>
                                                                    {getEmojiForTerm(classTaken.term)} {classTaken.subjectNumber}: {classTaken.subjectTitle}
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
