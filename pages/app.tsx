import { Button, Container, Group, Text, Title } from '@mantine/core'
import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'

import ui from '@/styles/Interface.module.css'
import { storeUrl, storeUrlForUserAgent } from '@/utils/appStoreLinks'

interface Props {
    appStoreUrl: string
    playStoreUrl: string
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, query }) => {
    const providerToken = process.env.APP_STORE_PROVIDER_TOKEN
    const destination = storeUrlForUserAgent(req.headers['user-agent'], query, providerToken)
    if (destination) {
        return { redirect: { destination, permanent: false } }
    }
    return { props: { appStoreUrl: storeUrl('ios', query, providerToken), playStoreUrl: storeUrl('android', query) } }
}

const GetTheAppPage: NextPage<Props> = ({ appStoreUrl, playStoreUrl }) => (
    <Container size="sm" px="md" className={ui.page}>
        <Head>
            <title>Get the app - MIT OpenGrades</title>
            <meta name="description" content="MIT OpenGrades for iPhone and Android." />
        </Head>

        <header className={ui.hero}>
            <Title order={1} className={ui.heroTitle}>OpenGrades on your phone</Title>
            <Text className={ui.heroSubtitle}>
                Open opengrades.mit.edu/app on your phone to go straight to the right store, or pick one here.
            </Text>
        </header>

        <Group className={ui.actionRow}>
            <Button component="a" href={appStoreUrl} target="_blank" rel="noopener noreferrer">
                App Store
            </Button>
            <Button component="a" href={playStoreUrl} target="_blank" rel="noopener noreferrer" variant="default">
                Google Play
            </Button>
        </Group>
    </Container>
)

export default GetTheAppPage
