import { GetServerSidePropsContext } from 'next'
import Head from 'next/head'

import { Container, Title } from '@mantine/core'
import { useSession } from 'next-auth/react'

import { AdminConsole, UserAggregates } from '@/components/admin/AdminConsole'
import User from '@/models/User'
import { auth } from '@/utils/auth'
import mongoConnection from '@/utils/mongoConnection'

const Settings = (props: UserAggregates) => {
    const { data: session } = useSession()

    if (!session?.user || session.user.trustLevel < 2) {
        return (
            <Container>
                <Title>You're not supposed to be here!</Title>
            </Container>
        )
    }

    return (
        <>
            <Head>
                <title>Settings | MIT OpenGrades</title>
                <meta name="description" content="MIT OpenGrades admin console" />
                <link rel="icon" href="/static/images/favicon.ico" />
            </Head>
            <AdminConsole {...props} />
        </>
    )
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
    const session = await auth(context.req, context.res)
    if (!session?.user || (session.user.trustLevel ?? 0) < 2) {
        return { notFound: true }
    }

    await mongoConnection()

    const [totalUsers, activeUsers, summaryByClassYear, summaryByLevel] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ trustLevel: { $gt: 0 } }),
        User.aggregate([
            { $match: { trustLevel: { $gt: 0 }, verified: true } },
            { $group: { _id: '$classOf', count: { $sum: 1 } } }
        ]),
        User.aggregate([
            { $match: { trustLevel: { $gt: 0 }, verified: true } },
            { $group: { _id: '$year', count: { $sum: 1 } } }
        ])
    ])

    return {
        props: {
            session: JSON.parse(JSON.stringify(session)),
            totalUsers,
            activeUsers,
            summaryByClassYear,
            summaryByLevel
        }
    }
}

export default Settings
