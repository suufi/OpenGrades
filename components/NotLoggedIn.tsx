import { Center, Container, Text } from '@mantine/core'

export default function NotLoggedIn () {
    return (
        <Container style={{
            padding: 'var(--mantine-spacing-lg)',
        }}>

            <Center style={{ padding: 'var(--mantine-spacing-lg)' }}>
                <Text>
                    You are not logged in. To access MIT OpenGrades, please log in with your MIT credentials.
                </Text>
            </Center>

        </Container>
    )
}