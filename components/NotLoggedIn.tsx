import { Button, Center, Container, Stack, Text } from '@mantine/core'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'

export default function NotLoggedIn () {
    const router = useRouter()
    const path = router.asPath.split('?')[0]
    const callbackUrl = path.startsWith('/api/auth') ? '/' : (router.asPath || '/')

    return (
        <Container style={{
            padding: 'var(--mantine-spacing-lg)',
        }}>
            <Center style={{ padding: 'var(--mantine-spacing-lg)' }}>
                <Stack align="center" gap="md">
                    <Text ta="center">
                        You are not logged in. To access MIT OpenGrades, please log in with your MIT credentials.
                    </Text>
                    <Button onClick={() => signIn('mit-oidc', { callbackUrl })}>
                        Sign In with MIT
                    </Button>
                </Stack>
            </Center>
        </Container>
    )
}