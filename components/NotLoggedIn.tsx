import { Container, Divider, Text, Title } from '@mantine/core'

export default function NotLoggedIn () {
    return (
        <Container style={{
            padding: 'var(--mantine-spacing-lg)',
        }}>
            <Title> Welcome to MIT OpenGrades! </Title>
            <Text>
                You are not logged in. To access MIT OpenGrades, please log in with your MIT credentials.
            </Text>

            <Divider m={'lg'} />

            <Text>
                MIT OpenGrades is a platform for students to share their experiences with classes at MIT. We hope
                that this will help students make more informed decisions about what classes to take.
            </Text>
        </Container>
    )
}