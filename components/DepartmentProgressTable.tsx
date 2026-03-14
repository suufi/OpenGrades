import { Badge, Group, Progress, Table, Text, Title, Select, Stack, Tooltip } from '@mantine/core'
import { useEffect, useState } from 'react'
import { compareDepartmentCodes, getDepartmentName } from '@/utils/departments'

interface DepartmentData {
    department: string
    classCount: number
    displayCount: number
}

interface TermData {
    term: string
    departments: DepartmentData[]
}

export function DepartmentProgressTable() {
    const [groupedData, setGroupedData] = useState<TermData[]>([])
    const [activeTerm, setActiveTerm] = useState<string | null>(null)
    const [sortBy, setSortBy] = useState<'department' | 'classCount' | 'displayPercentage'>('department')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

    useEffect(() => {
        fetchGroupedData()
    }, [])

    const fetchGroupedData = async () => {
        try {
            const response = await fetch('/api/classes/count')
            const result = await response.json()

            if (result.success) {
                setGroupedData(result.data)
                if (result.data.length > 0) {
                    setActiveTerm(result.data[0].term)
                }
            }
        } catch (error) {
            console.error('Error fetching grouped data:', error)
        }
    }

    const activeTermData = groupedData.find(data => data.term === activeTerm)

    const getDisplayPercentage = (displayCount: number, classCount: number) => {
        if (classCount === 0) return 0
        return Math.round((displayCount / classCount) * 100)
    }

    const getProgressColor = (percentage: number) => {
        if (percentage >= 90) return 'green'
        if (percentage >= 50) return 'yellow'
        return 'red'
    }

    const handleSort = (column: typeof sortBy) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortBy(column)
            setSortOrder('asc')
        }
    }

    const sortedDepartments = activeTermData?.departments
        .map(dept => ({
            ...dept,
            name: getDepartmentName(dept.department) || dept.department,
            displayPercentage: getDisplayPercentage(dept.displayCount, dept.classCount)
        }))
        .sort((a, b) => {
            let compareValue = 0

            if (sortBy === 'department') {
                compareValue = compareDepartmentCodes(a.department, b.department)
            } else if (sortBy === 'classCount') {
                compareValue = a.classCount - b.classCount
            } else {
                compareValue = a.displayPercentage - b.displayPercentage
            }

            return sortOrder === 'asc' ? compareValue : -compareValue
        }) || []

    const totalClasses = sortedDepartments.reduce((sum, dept) => sum + dept.classCount, 0)
    const totalDisplayed = sortedDepartments.reduce((sum, dept) => sum + dept.displayCount, 0)
    const overallPercentage = getDisplayPercentage(totalDisplayed, totalClasses)

    const SortableHeader = ({ column, label }: { column: typeof sortBy; label: string }) => (
        <Table.Th
            onClick={() => handleSort(column)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
        >
            <Group gap="xs">
                <Text>{label}</Text>
                {sortBy === column && <Text size="xs">{sortOrder === 'asc' ? '↑' : '↓'}</Text>}
            </Group>
        </Table.Th>
    )

    return (
        <Stack>
            <Title order={3}>Department Listings (Grouped)</Title>

            <Select
                allowDeselect={false}
                data={groupedData.map(data => ({ value: data.term, label: data.term }))}
                value={activeTerm}
                onChange={setActiveTerm}
                placeholder="Select a term"
                label="Term"
            />

            <Table striped withTableBorder withColumnBorders highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <SortableHeader column="department" label="Department" />
                        <SortableHeader column="classCount" label="Total Classes" />
                        <SortableHeader column="displayPercentage" label="Displayed" />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {sortedDepartments.map(({ department, classCount, displayCount, name, displayPercentage }) => (
                        <Table.Tr key={`${activeTerm}-${department}`}>
                            <Table.Td>
                                <Tooltip label={name} position="right">
                                    <Group gap="xs">
                                        <Badge variant="light">{department}</Badge>
                                        <Text size="sm" c="dimmed" truncate maw={300}>
                                            {name}
                                        </Text>
                                    </Group>
                                </Tooltip>
                            </Table.Td>
                            <Table.Td>
                                <Text fw={500}>{classCount}</Text>
                            </Table.Td>
                            <Table.Td>
                                <Group gap="sm">
                                    <Progress.Root size="xl" w={200}>
                                        <Progress.Section
                                            value={displayPercentage}
                                            color={getProgressColor(displayPercentage)}
                                        >
                                            <Progress.Label>{displayCount}</Progress.Label>
                                        </Progress.Section>
                                    </Progress.Root>
                                    <Text size="sm" c="dimmed" fw={500} miw={45}>
                                        {displayPercentage}%
                                    </Text>
                                    {classCount > displayCount && (
                                        <Badge size="sm" color="red" variant="light">
                                            {classCount - displayCount} hidden
                                        </Badge>
                                    )}
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
                <Table.Tfoot>
                    <Table.Tr style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
                        <Table.Td>
                            <Text fw={700}>Total</Text>
                        </Table.Td>
                        <Table.Td>
                            <Text fw={700}>{totalClasses}</Text>
                        </Table.Td>
                        <Table.Td>
                            <Group gap="sm">
                                <Progress.Root size="xl" w={200}>
                                    <Progress.Section
                                        value={overallPercentage}
                                        color={getProgressColor(overallPercentage)}
                                    >
                                        <Progress.Label>{totalDisplayed}</Progress.Label>
                                    </Progress.Section>
                                </Progress.Root>
                                <Text size="sm" fw={700} miw={45}>
                                    {overallPercentage}%
                                </Text>
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                </Table.Tfoot>
            </Table>
        </Stack>
    )
}
