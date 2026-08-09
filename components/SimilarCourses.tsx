import { Badge, Card, Group, SimpleGrid, Text, Title } from '@mantine/core'
import { IconStars } from '@tabler/icons-react'
import { useRouter } from 'next/router'

export type SimilarCourseEntry = {
    _id: string
    subjectNumber: string
    subjectTitle: string
    department?: string
    term?: string
    institution?: 'mit' | 'harvard'
    score?: number
}

export default function SimilarCourses({ courses }: { courses: SimilarCourseEntry[] }) {
    const router = useRouter()

    if (!courses || courses.length === 0) return null

    return (
        <Card withBorder radius="md" padding="lg" mt="md">
            <Group gap="xs" mb="md">
                <IconStars size={18} />
                <Title order={3}>Similar Courses</Title>
                <Badge size="sm" variant="light" color="cyan">{courses.length}</Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
                {courses.map((cls) => (
                    <Card
                        key={cls._id}
                        shadow="none"
                        padding="sm"
                        radius="md"
                        withBorder
                        style={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/classes/${cls._id}`)}
                    >
                        <Text fw={600} size="sm" lineClamp={1}>{cls.subjectNumber}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2} mt={4}>{cls.subjectTitle}</Text>
                        {cls.institution === 'harvard' && (
                            <Badge size="xs" variant="light" color="blue" mt="xs">Harvard</Badge>
                        )}
                    </Card>
                ))}
            </SimpleGrid>
        </Card>
    )
}
