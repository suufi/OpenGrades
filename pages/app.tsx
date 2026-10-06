import { Button, Container, Group, Text, Title } from '@mantine/core'
import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'

import ui from '@/styles/Interface.module.css'
import { APP_STORE_URL, PLAY_STORE_URL, storeUrlForUserAgent } from '@/utils/appStoreLinks'

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
    const destination = storeUrlForUserAgent(req.headers['user-agent'])
    if (destination) {
        return { redirect: { destination, permanent: false } }
    }
    return { props: {} }
}

const GetTheAppPage: NextPage = () => (
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
            <Button component="a" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                App Store
            </Button>
            <Button component="a" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" variant="default">
                Google Play
            </Button>
        </Group>
    </Container>
)

export default GetTheAppPage
