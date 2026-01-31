// @ts-nocheck
import { Container, Divider, Space, Text, Title, List, Anchor, Paper, ThemeIcon, Group, Stack } from "@mantine/core"
import { IconShield, IconLock, IconEye, IconTrash, IconMail, IconDatabase, IconUserCheck } from "@tabler/icons"
import { NextPage } from "next"
import Head from "next/head"

const PrivacyPolicyPage: NextPage = () => {
    const lastUpdated = "January 5, 2026"
    const contactEmail = "opengrades@mit.edu"

    return (
        <Container size="md" py="xl">
            <Head>
                <title>Privacy Policy - MIT OpenGrades</title>
                <meta name="description" content="Privacy policy for MIT OpenGrades platform" />
            </Head>

            <Group gap="sm" mb="md">
                <ThemeIcon size="xl" variant="light" color="blue">
                    <IconShield size={28} />
                </ThemeIcon>
                <Title>Privacy Policy</Title>
            </Group>

            <Text c="dimmed" mb="xl">Last updated: {lastUpdated}</Text>

            <Paper shadow="xs" p="lg" mb="xl" withBorder>
                <Text>
                    MIT OpenGrades is a student-run platform. Your information remains secure with the administrators
                    and will not be sold to any entity. This policy explains what we collect and how we use it.
                </Text>
            </Paper>

            {/* Information We Collect */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="teal">
                    <IconDatabase size={18} />
                </ThemeIcon>
                <Title order={2}>Information We Collect</Title>
            </Group>
            <Divider mb="md" />

            <Title order={3} mb="xs">From MIT Authentication</Title>
            <Text mb="xs">When you sign in via MIT Touchstone, we receive:</Text>
            <List mb="lg">
                <List.Item>Kerb (MIT username)</List.Item>
                <List.Item>Email address</List.Item>
                <List.Item>Full name</List.Item>
                <List.Item>Affiliation (student, staff, affiliate)</List.Item>
                <List.Item>Year designation (class year or "G" for graduate)</List.Item>
            </List>

            <Title order={3} mb="xs">Information You Provide</Title>
            <List mb="lg">
                <List.Item><strong>Class of year:</strong> Your expected or known graduation year</List.Item>
                <List.Item><strong>Classes taken:</strong> The courses you've taken at MIT, input manually or extracted from your grade report</List.Item>
                <List.Item><strong>Course affiliation:</strong> Your degree program(s)</List.Item>
                <List.Item><strong>Identity flags (optional):</strong> First Generation, Low Income, International, or Black/Indigenous/Latino status — used only in aggregate to identify class experience disparities</List.Item>
                <List.Item><strong>Referral information:</strong> Who referred you to the platform</List.Item>
                <List.Item><strong>Email preferences:</strong> Whether you want to receive occasional platform emails</List.Item>
            </List>

            <Title order={3} mb="xs">Grade Reports</Title>
            <Text mb="lg">
                When you paste your grade report, we extract <strong>which classes you took</strong> and <strong>your letter grades</strong>.
                This data populates your class history and can create partial reviews. <strong>Numeric grades are not permanently stored</strong> —
                only letter grade categories (A, B, C, D, F, P, DR) are saved with reviews.
            </Text>

            <Title order={3} mb="xs">Reviews and Content</Title>
            <List mb="xl">
                <List.Item><strong>Class reviews:</strong> Your ratings (1-7), hours/week, comments, letter grade, and whether you were a first-year, dropped, or retaking</List.Item>
                <List.Item><strong>Content submissions:</strong> Files you upload (syllabi, etc.) along with titles and types</List.Item>
                <List.Item><strong>Votes:</strong> Your upvotes/downvotes on reviews</List.Item>
            </List>

            {/* How We Use Your Information */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="violet">
                    <IconEye size={18} />
                </ThemeIcon>
                <Title order={2}>How We Use Your Information</Title>
            </Group>
            <Divider mb="md" />

            <List mb="xl">
                <List.Item>To authenticate you as an MIT community member</List.Item>
                <List.Item>To display your reviews to other authenticated users</List.Item>
                <List.Item>To personalize course recommendations based on your history</List.Item>
                <List.Item>To show "Who's Taken What" data (which students took which classes)</List.Item>
                <List.Item>To identify aggregate trends (e.g., do first-gen students rate a class differently?)</List.Item>
                <List.Item>To power AI-assisted search (see below)</List.Item>
                <List.Item>To occasionally email you about platform updates (if opted in)</List.Item>
            </List>

            {/* AI and Embeddings */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="orange">
                    <IconUserCheck size={18} />
                </ThemeIcon>
                <Title order={2}>AI Features</Title>
            </Group>
            <Divider mb="md" />

            <Text mb="md">
                MIT OpenGrades uses AI-powered semantic search to help find relevant courses:
            </Text>

            <List mb="lg">
                <List.Item>
                    <strong>Embeddings:</strong> Your review text may be converted to numerical vectors for semantic search.
                    Embeddings are generated using self-hosted models — we do not send your data to OpenAI, Google, or other external AI providers.
                </List.Item>
                <List.Item>
                    <strong>Opt-out:</strong> You can enable <code>aiEmbeddingOptOut</code> in your settings. If enabled,
                    your reviews won't be used in AI-powered search results.
                </List.Item>
                <List.Item>
                    <strong>Q&A emails:</strong> You may receive emails when someone has a question about a class you've taken.
                    You can opt out via <code>qaEmailOptOut</code> in settings.
                </List.Item>
            </List>

            {/* Visibility */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="cyan">
                    <IconEye size={18} />
                </ThemeIcon>
                <Title order={2}>Who Sees Your Data</Title>
            </Group>
            <Divider mb="md" />

            <List mb="xl">
                <List.Item><strong>Reviews are anonymous:</strong> Your reviews are displayed without your kerb or name attached. Other users cannot see who authored a review.</List.Item>
                <List.Item><strong>Classes taken:</strong> Other users can see which classes you've taken on the "Who's Taken What" page (your kerb is visible there)</List.Item>
                <List.Item><strong>Uploaded content:</strong> Files you upload are visible to other authenticated users</List.Item>
                <List.Item><strong>Platform maintainers:</strong> Have access to all data (including review authorship) for moderation purposes</List.Item>
            </List>

            <Paper shadow="xs" p="md" mb="xl" withBorder bg="yellow.0">
                <Text fw={500}>Important: Do not share this platform's content with professors or MIT administration.</Text>
                <Text size="sm" c="dimmed">Content is posted in confidence. Sharing may jeopardize the platform and users.</Text>
            </Paper>

            {/* Data We Do NOT Sell */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="red">
                    <IconLock size={18} />
                </ThemeIcon>
                <Title order={2}>Data Sharing</Title>
            </Group>
            <Divider mb="md" />

            <Text mb="md" fw={500}>We do NOT sell your personal information.</Text>

            <List mb="xl">
                <List.Item><strong>No external training:</strong> Your data is not shared with AI companies for model training</List.Item>
                <List.Item><strong>No advertisers:</strong> We have no ads and share nothing with marketers</List.Item>
                <List.Item><strong>Legal:</strong> We may disclose data if required by law or MIT policy. Please do not commit crimes on this platform. </List.Item>
            </List>

            {/* Audit Logs */}
            <Title order={2} mb="sm">Activity Logging</Title>
            <Divider mb="md" />

            <Text mb="xl">
                We log certain actions for accountability and abuse prevention: joining the platform, submitting/editing/hiding reviews,
                content submissions, and privacy setting changes. These logs help us investigate reports and maintain platform integrity.
            </Text>

            {/* Retention and Deletion */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="gray">
                    <IconTrash size={18} />
                </ThemeIcon>
                <Title order={2}>Data Retention & Deletion</Title>
            </Group>
            <Divider mb="md" />

            <List mb="xl">
                <List.Item><strong>Account:</strong> Retained while active. Contact us to delete your account.</List.Item>
                <List.Item><strong>Reviews:</strong> You can delete individual reviews anytime.</List.Item>
                <List.Item><strong>Alumni:</strong> Accounts of departed students may be preserved to retain valuable reviews — you can request full deletion.</List.Item>
            </List>

            {/* Your Rights */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="green">
                    <IconUserCheck size={18} />
                </ThemeIcon>
                <Title order={2}>Your Rights</Title>
            </Group>
            <Divider mb="md" />

            <List mb="xl">
                <List.Item>Access your data via your profile or by contacting us</List.Item>
                <List.Item>Correct inaccurate information</List.Item>
                <List.Item>Delete reviews and content you've submitted</List.Item>
                <List.Item>Opt out of AI embeddings for your reviews</List.Item>
                <List.Item>Opt out of Q&A emails</List.Item>
                <List.Item>Opt out of platform update emails</List.Item>
                <List.Item>Request full account deletion</List.Item>
            </List>

            {/* Contact */}
            <Group gap="sm" mb="sm">
                <ThemeIcon size="md" variant="light" color="blue">
                    <IconMail size={18} />
                </ThemeIcon>
                <Title order={2}>Contact</Title>
            </Group>
            <Divider mb="md" />

            <Text mb="lg">
                Questions or requests? Contact us at{' '}
                <Anchor href={`mailto:${contactEmail}`}>{contactEmail}</Anchor>.
            </Text>

            <Space h="xl" />
        </Container>
    )
}

export default PrivacyPolicyPage
