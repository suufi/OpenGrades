import { Badge, Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useEffect, useState } from 'react'

interface CourseOption {
    _id: string
    departmentCode: string
    courseName: string
    courseLevel: 'U' | 'G'
    courseOption: string
}

interface DegreeTermsModalProps {
    opened?: boolean
    onClose?: () => void
    onSave: (undergradTerms: string[]) => void
    embedded?: boolean
    initialTerms?: string[]
    autoAssignClassOf?: number
    eligibleOverride?: boolean | null
    selectedUndergradProgramIds?: string[]
}

interface TermAssignment {
    term: string
    level: 'U' | 'G' | null
}

const formatTermDisplay = (term: string): string => {
    const year = term.substring(0, 4)
    const semester = term.substring(4)

    const semesterMap: { [key: string]: string } = {
        'FA': '🍁 Fall',
        'SP': '🌸 Spring',
        'JA': '❄️ IAP'
    }

    return `${semesterMap[semester] || semester} ${year}`
}

export default function DegreeTermsModal ({ opened, onClose, onSave, embedded, initialTerms, autoAssignClassOf, eligibleOverride, selectedUndergradProgramIds }: DegreeTermsModalProps) {
    const [loading, setLoading] = useState(false)
    const [termAssignments, setTermAssignments] = useState<TermAssignment[]>([])
    const [programs, setPrograms] = useState<CourseOption[]>([])
    const [eligible, setEligible] = useState<boolean | null>(null)

    useEffect(() => {
        if (embedded) return
        if (opened) {
            fetchDegreeTerms()
        }
    }, [opened, embedded])

    useEffect(() => {
        if (!embedded) return

        const terms = (initialTerms || []).slice().sort()

        if (autoAssignClassOf) {
            const assignments = terms.map(term => {
                const year = parseInt(term.substring(0, 4))
                const isUndergradTerm = year <= autoAssignClassOf
                return {
                    term,
                    level: isUndergradTerm ? 'U' as const : 'G' as const
                }
            })
            setTermAssignments(assignments)
        } else {
            const initialAssignments = terms.map(term => ({
                term,
                level: null
            }))
            setTermAssignments(initialAssignments)
        }

        setEligible(typeof eligibleOverride === 'boolean' ? eligibleOverride : true)

        fetch('/api/me/degree-terms')
            .then(res => res.json())
            .then(result => {
                if (result.success && result.data?.programs) {
                    setPrograms(result.data.programs)
                }
            })
            .catch(() => { })
    }, [embedded, initialTerms, autoAssignClassOf, eligibleOverride, selectedUndergradProgramIds])

    const fetchDegreeTerms = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/me/degree-terms')
            const result = await response.json()

            if (result.success && result.data.eligible) {
                setEligible(true)
                const { undergradTerms, allTerms } = result.data

                setTermAssignments(
                    (allTerms || []).map((term: string) => ({
                        term,
                        level: undergradTerms?.includes(term) ? 'U' as const : 'G' as const
                    }))
                )
            } else {
                setEligible(false)
            }
        } catch (error) {
            console.error('Error fetching degree terms:', error)
            notifications.show({
                title: 'Error',
                message: 'Failed to load degree term assignments',
                color: 'red'
            })
            setEligible(false)
        } finally {
            setLoading(false)
        }
    }

    const handleLevelChange = (term: string, level: 'U' | 'G' | null) => {
        setTermAssignments(prev =>
            prev.map(ta =>
                ta.term === term ? { ...ta, level } : ta
            )
        )
    }

    const handleSave = async () => {
        setLoading(true)
        try {
            const undergradTerms = termAssignments.filter(ta => ta.level === 'U').map(ta => ta.term)
            const gradTerms = termAssignments.filter(ta => ta.level === 'G').map(ta => ta.term)

            const undergradProgramId = (selectedUndergradProgramIds && selectedUndergradProgramIds.length > 0)
                ? selectedUndergradProgramIds[0]
                : (programs.find(p => p.courseLevel === 'U')?._id || null)
            const gradProgramId = programs.find(p => p.courseLevel === 'G')?._id || null

            const programTerms: Array<{ program: string, terms: string[] }> = []
            if (undergradProgramId && undergradTerms.length > 0) {
                programTerms.push({ program: undergradProgramId, terms: undergradTerms })
            }
            if (gradProgramId && gradTerms.length > 0) {
                programTerms.push({ program: gradProgramId, terms: gradTerms })
            }

            const response = await fetch('/api/me/degree-terms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ programTerms })
            })

            const result = await response.json()

            if (result.success) {
                notifications.show({
                    title: 'Success',
                    message: 'Degree term assignments saved',
                    color: 'green'
                })
                onSave(undergradTerms)
                if (!embedded && onClose) onClose()
            } else {
                throw new Error(result.message)
            }
        } catch (error) {
            console.error('Error saving degree terms:', error)
            notifications.show({
                title: 'Error',
                message: 'Failed to save degree term assignments',
                color: 'red'
            })
        } finally {
            setLoading(false)
        }
    }

    if (!embedded && eligible === false) {
        return (
            <Modal
                opened={!!opened}
                onClose={onClose}
                title="Not Eligible"
                size="lg"
            >
                <Stack gap="md">
                    <Text size="sm">
                        This feature is only available for graduate students who were previously MIT undergrads.
                    </Text>
                    <Group justify="flex-end">
                        <Button onClick={onClose}>Close</Button>
                    </Group>
                </Stack>
            </Modal>
        )
    }

    const Inner = (
        <Stack gap="md">{loading && eligible === null ? (
            <Text>Loading...</Text>
        ) : (
            <>
                <Text size="sm" c="dimmed">
                    Assign each semester to either your undergraduate or graduate studies. This helps categorize your classes correctly on the "Who's Taken What" page.
                </Text>

                {autoAssignClassOf && (
                    <Text size="sm" c="blue">
                        ℹ️ Terms have been auto-assigned based on your graduation year. You can adjust these assignments below.
                    </Text>
                )}

                <Stack gap="xs">
                    {termAssignments.map(({ term, level }) => {
                        return (
                            <Group key={term} justify="space-between" p="xs" style={{ borderRadius: 4, border: '1px solid #e0e0e0' }}>
                                <Text fw={500}>{formatTermDisplay(term)}</Text>
                                <Group gap="xs" style={{ flex: 1, justifyContent: 'flex-end' }}>
                                    {level && (
                                        <Badge color={level === 'U' ? 'blue' : 'grape'} variant="light">
                                            {level === 'U' ? 'Undergraduate' : 'Graduate'}
                                        </Badge>
                                    )}
                                    <Select
                                        placeholder="Select level"
                                        value={level}
                                        onChange={(value) => handleLevelChange(term, value as 'U' | 'G' | null)}
                                        data={[
                                            { value: 'U', label: 'Undergraduate' },
                                            { value: 'G', label: 'Graduate' }
                                        ]}
                                        clearable
                                        style={{ minWidth: 200 }}
                                    />
                                </Group>
                            </Group>
                        )
                    })}
                </Stack>

                <Group justify="flex-end" mt="md">
                    {!embedded && (
                        <Button variant="default" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                    )}
                    <Button onClick={handleSave} loading={loading}>
                        Save Assignments
                    </Button>
                </Group>
            </>
        )}
        </Stack>
    )

    if (embedded) return Inner

    return (
        <Modal
            opened={!!opened}
            onClose={onClose}
            title="Assign Terms to Degree Program"
            size="lg"
        >
            {Inner}
        </Modal>
    )
}
