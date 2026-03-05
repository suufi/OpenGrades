// @ts-nocheck
import { Badge, Button, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import type { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { getServerSession, Session } from 'next-auth'
import authOptions from 'pages/api/auth/[...nextauth]'

import mongoConnection from '@/utils/mongoConnection'
import User from '@/models/User'
import Class from '@/models/Class'

type FavoriteClass = {
    subjectNumber: string
    subjectTitle: string
    description?: string
    offered?: boolean
}

const FavoritesPage: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ favoriteClasses }) => {
    const [classes, setClasses] = useState<FavoriteClass[]>(favoriteClasses || [])

    const removeFavorite = async (subjectNumber: string) => {
        const res = await fetch('/api/me/favorites', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subjectNumber })
        })
        const data = await res.json()
        if (res.ok && data?.success) {
            setClasses((prev) => prev.filter((c) => c.subjectNumber !== subjectNumber))
            showNotification({
                title: 'Removed from favorites',
                message: `${subjectNumber} was removed from your favorites.`
            })
        } else {
            showNotification({
                title: 'Error',
                message: data?.message || 'Failed to update favorites.',
                color: 'red'
            })
        }
    }

    return (
        <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
            <Title>Favorites</Title>
            <Text c="dimmed" mt="xs">
                Your saved classes appear here for quick access.
            </Text>

            <Stack mt="lg">
                {classes.length === 0 && (
                    <Card withBorder>
                        <Text>No favorites yet. Add favorites from any class page.</Text>
                    </Card>
                )}

                {classes.length > 0 && (
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {classes.map((cls) => (
                            <Card key={cls.subjectNumber} withBorder shadow="sm">
                                <Group justify="space-between" align="flex-start">
                                    <Stack gap={4}>
                                        <Group gap="xs">
                                            <Text fw={600}>
                                                {cls.subjectNumber}: {cls.subjectTitle}
                                            </Text>
                                            {cls.offered === false && (
                                                <Badge color="red" variant="light">Not Offered</Badge>
                                            )}
                                        </Group>
                                        {cls.description && (
                                            <Text size="sm" lineClamp={3}>
                                                {cls.description}
                                            </Text>
                                        )}
                                    </Stack>
                                </Group>

                                <Group justify="space-between" mt="md">
                                    <Group gap="xs">
                                        <Button
                                            component={Link}
                                            variant="light"
                                            href={`/classes/aggregate/${cls.subjectNumber}`}
                                        >
                                            Aggregated Data
                                        </Button>
                                    </Group>
                                    <Button
                                        variant="outline"
                                        color="red"
                                        onClick={() => removeFavorite(cls.subjectNumber)}
                                    >
                                        Remove
                                    </Button>
                                </Group>
                            </Card>
                        ))}
                    </SimpleGrid>
                )}
            </Stack>
        </Container>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    await mongoConnection()

    const session: Session | null = await getServerSession(context.req, context.res, authOptions)
    if (!session) {
        return {
            redirect: {
                destination: '/api/auth/signin',
                permanent: false
            }
        }
    }

    const user = await User.findOne({ email: session.user?.email?.toLowerCase() }).lean()
    if (!user) {
        return {
            redirect: {
                destination: '/api/auth/signin',
                permanent: false
            }
        }
    }

    const favoriteNumbers: string[] = user.favoriteClasses || []
    const favoriteClassesRaw = await Class.find({
        subjectNumber: { $in: favoriteNumbers }
    }).select('subjectNumber subjectTitle description offered academicYear').lean()

    const favoriteByNumber = new Map<string, any>()
    for (const cls of favoriteClassesRaw) {
        const existing = favoriteByNumber.get(cls.subjectNumber)
        if (!existing) {
            favoriteByNumber.set(cls.subjectNumber, cls)
            continue
        }
        if (cls.academicYear !== existing.academicYear) {
            if (cls.academicYear > existing.academicYear) favoriteByNumber.set(cls.subjectNumber, cls)
            continue
        }
    }

    const favoriteClasses = favoriteNumbers
        .map((num) => favoriteByNumber.get(num))
        .filter(Boolean)

    return {
        props: {
            favoriteClasses: JSON.parse(JSON.stringify(favoriteClasses))
        }
    }
}

export default FavoritesPage
