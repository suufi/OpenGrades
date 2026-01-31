import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconArrowRight, IconArrowLeft, IconLink } from '@tabler/icons'
import Link from 'next/link'
import { useRouter } from 'next/router'

interface RelatedClass {
    subjectNumber: string
    subjectTitle: string
    department?: string
}

interface RelatedClassesProps {
    subjectNumber: string
    prerequisites: RelatedClass[]
    corequisites: RelatedClass[]
    requiredBy: RelatedClass[]
}

function ClassCard({ cls, type }: { cls: RelatedClass; type: 'prereq' | 'coreq' | 'requiredBy' }) {
    const router = useRouter()

    const colors = {
        prereq: 'green',
        coreq: 'violet',
        requiredBy: 'orange'
    }

    return (
        <Card
            shadow="xs"
            padding="sm"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() => router.push(`/classes/aggregate/${cls.subjectNumber}`)}
        >
            <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                    <Text fw={600} size="sm" truncate>{cls.subjectNumber}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{cls.subjectTitle}</Text>
                </div>
                <IconArrowRight size={16} color="gray" />
            </Group>
        </Card>
    )
}

export default function RelatedClasses({
    subjectNumber,
    prerequisites,
    corequisites,
    requiredBy
}: RelatedClassesProps) {
    const router = useRouter()
    const hasRelated = prerequisites.length > 0 || corequisites.length > 0 || requiredBy.length > 0

    if (!hasRelated) {
        return null
    }

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={3}>Related Classes</Title>
                <Tooltip label="View full prerequisite graph">
                    <Button
                        variant="light"
                        size="xs"
                        onClick={() => router.push(`/prereq-graph?subject=${subjectNumber}`)}
                    >
                        View Graph
                    </Button>
                </Tooltip>
            </Group>

            {prerequisites.length > 0 && (
                <div>
                    <Group gap="xs" mb="xs">
                        <IconArrowLeft size={16} color="green" />
                        <Text size="sm" fw={600} c="green">Prerequisites</Text>
                        <Badge size="sm" color="green" variant="light">{prerequisites.length}</Badge>
                    </Group>
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="xs">
                        {prerequisites.slice(0, 8).map(cls => (
                            <ClassCard key={cls.subjectNumber} cls={cls} type="prereq" />
                        ))}
                    </SimpleGrid>
                    {prerequisites.length > 8 && (
                        <Text size="xs" c="dimmed" mt="xs">
                            +{prerequisites.length - 8} more prerequisites
                        </Text>
                    )}
                </div>
            )}

            {corequisites.length > 0 && (
                <div>
                    <Group gap="xs" mb="xs">
                        <IconLink size={16} color="violet" />
                        <Text size="sm" fw={600} c="violet">Corequisites</Text>
                        <Badge size="sm" color="violet" variant="light">{corequisites.length}</Badge>
                    </Group>
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="xs">
                        {corequisites.slice(0, 8).map(cls => (
                            <ClassCard key={cls.subjectNumber} cls={cls} type="coreq" />
                        ))}
                    </SimpleGrid>
                </div>
            )}

            {requiredBy.length > 0 && (
                <div>
                    <Group gap="xs" mb="xs">
                        <IconArrowRight size={16} color="orange" />
                        <Text size="sm" fw={600} c="orange">Classes That Require This</Text>
                        <Badge size="sm" color="orange" variant="light">{requiredBy.length}</Badge>
                    </Group>
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="xs">
                        {requiredBy.slice(0, 8).map(cls => (
                            <ClassCard key={cls.subjectNumber} cls={cls} type="requiredBy" />
                        ))}
                    </SimpleGrid>
                    {requiredBy.length > 8 && (
                        <Text size="xs" c="dimmed" mt="xs">
                            +{requiredBy.length - 8} more classes require this
                        </Text>
                    )}
                </div>
            )}
        </Stack>
    )
}
