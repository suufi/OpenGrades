import { AppProps } from 'next/app'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useContext, useEffect, useState } from 'react'

import { ActionIcon, AppShell, Badge, Box, Burger, Button, Center, ColorSchemeScript, Container, Divider, Group, Loader, MantineProvider, Menu, Modal, NumberInput, Stack, Switch, Text, TextInput, Tooltip, createTheme, useMantineColorScheme, useMantineTheme } from '@mantine/core'
import { useDisclosure, useHotkeys, useMounted } from '@mantine/hooks'
import { ModalsProvider } from '@mantine/modals'
import { Notifications, notifications } from '@mantine/notifications'
import { Moon, Sun } from 'tabler-icons-react'

import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'

import ErrorBoundary from '@/components/ErrorBoundary'
import LockdownModule from '@/components/LockdownModule'
import NotLoggedIn from '@/components/NotLoggedIn'
import { UserContext, UserContextProvider } from '@/components/UserContextProvider'
import { NavigationLinks, UserSection } from '@/components/Navbar'

import PlausibleProvider from 'next-plausible'

import '@mantine/charts/styles.css'
import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/spotlight/styles.css'


import 'primeicons/primeicons.css'
import 'primereact/resources/primereact.min.css' // core css

import mainClasses from '@/styles/Main.module.css'

const availableAcademicYears = [
  '2021-2022',
  '2022-2023',
  '2023-2024',
  '2024-2025'
]



const theme = createTheme({
  /** Put your mantine theme override here */
  components: {
    Container: {
      defaultProps: {
        sizes: {
          md: 1200,
          lg: 1500
        }
      }
    }
  },

  // shade text colors lighter on dark theme

})

function useEditProfileModal() {
  const [opened, { open, close }] = useDisclosure(false)
  const { userProfile, setUserProfile } = useContext(UserContext)
  const [classOf, setClassOf] = useState<number | string>('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (opened && userProfile?.classOf) {
      setClassOf(userProfile.classOf)
    }
  }, [opened, userProfile?.classOf])

  const handleRefreshAffiliation = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/me/refresh-affiliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok) {
        setUserProfile(data.data)
        notifications.show({
          title: 'Success',
          message: 'Course affiliations refreshed successfully',
          color: 'green'
        })
      } else {
        notifications.show({
          title: 'Error',
          message: data.message || 'Failed to refresh course affiliations',
          color: 'red'
        })
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'An error occurred while refreshing course affiliations',
        color: 'red'
      })
    } finally {
      setRefreshing(false)
    }
  }

  const handleSubmit = async () => {
    if (!classOf || typeof classOf !== 'number') {
      notifications.show({
        title: 'Error',
        message: 'Please enter a valid graduation year',
        color: 'red'
      })
      return
    }

    setLoading(true)
    try {
      const updatePayload = {
        classOf: classOf,
      }
      const response = await fetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          classOf: classOf
        })
      })

      const data = await response.json()

      if (response.ok) {
        setUserProfile(data.data)
        notifications.show({
          title: 'Success',
          message: 'Profile updated successfully',
          color: 'green'
        })
        close()
      } else {
        notifications.show({
          title: 'Error',
          message: data.message || 'Failed to update profile',
          color: 'red'
        })
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'An error occurred while updating your profile',
        color: 'red'
      })
    } finally {
      setLoading(false)
    }
  }

  const modal = (
    <Modal
      opened={opened}
      onClose={close}
      title="Edit Profile"
      centered
      size="md"
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          value={userProfile?.name || ''}
          readOnly
          disabled
          description="Your name from MIT"
        />

        <TextInput
          label="Email"
          value={userProfile?.email || ''}
          readOnly
          disabled
          description="Your MIT email address"
        />

        <TextInput
          label="Kerberos"
          value={userProfile?.kerb || ''}
          readOnly
          disabled
          description="Your MIT Kerberos ID"
        />

        <TextInput
          label="Affiliation"
          value={userProfile?.affiliation || ''}
          readOnly
          disabled
          description="Your MIT affiliation status"
        />

        {userProfile?.supportStatus && (
          <Box>
            <Text size="sm" fw={500} mb={4}>Support Status</Text>
            <Badge color={userProfile.supportStatus === 'Maintainer' ? 'blue' : 'green'} size="lg">
              {userProfile.supportStatus}
            </Badge>
          </Box>
        )}

        {userProfile?.courseAffiliation && userProfile.courseAffiliation.length > 0 && (
          <Box>
            <Group justify="space-between" align="center" mb={4}>
              <Text size="sm" fw={500}>Course Affiliations</Text>
              <Button
                size="xs"
                variant="subtle"
                onClick={handleRefreshAffiliation}
                loading={refreshing}
              >
                Refresh
              </Button>
            </Group>
            <Group gap="xs">
              {userProfile.courseAffiliation.map((course: any, idx: number) => (
                <Badge key={idx} color="blue" variant="light" size="md">
                  {course.departmentCode}-{course.courseOption} ({course.courseLevel})
                </Badge>
              ))}
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Your current course affiliations from MIT
            </Text>
          </Box>
        )}

        <Divider my="xs" />

        <NumberInput
          label="Graduation Year"
          placeholder="e.g., 2025"
          description="Your expected or actual graduation year"
          value={classOf}
          onChange={setClassOf}
          min={2000}
          max={2040}
          required
        />

        {userProfile?.lastGradeReportUpload && (
          <Text size="xs" c="dimmed">
            Last grade report upload: {new Date(userProfile.lastGradeReportUpload).toLocaleDateString()}
          </Text>
        )}

        <Divider my="md" label="Privacy Settings" labelPosition="center" />

        <Stack gap="sm">
          <div>
            <Switch
              label="Allow my reviews in AI recommendations"
              description="Your reviews help train our recommendation system running on MIT SIPB servers. All AI processing is local—no external services. Only class comments and review metadata (first year, retaking, dropped status) are used. No identifiable information is shared."
              checked={!userProfile?.aiEmbeddingOptOut}
              onChange={(event) => {
                setUserProfile({ ...userProfile, aiEmbeddingOptOut: !event.currentTarget.checked } as any)

                fetch('/api/me/privacy', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ aiEmbeddingOptOut: !event.currentTarget.checked })
                }).then(res => res.json()).then(data => {
                  if (data.success) {
                    notifications.show({
                      title: 'Success',
                      message: data.message,
                      color: 'green'
                    })
                  } else {
                    notifications.show({
                      title: 'Error',
                      message: data.message || 'Failed to update privacy settings',
                      color: 'red'
                    })

                    setUserProfile({ ...userProfile, aiEmbeddingOptOut: !(!event.currentTarget.checked) } as any)
                  }
                })
              }}
            />
            <Text size="xs" c="dimmed" mt={4}>
              Learn more about our <a href="/about" style={{ color: 'inherit' }}>AI and privacy practices</a>. You must enable this to use AI features.
            </Text>
          </div>

          <div>
            <Switch
              label="Receive Q&A emails about my courses"
              description="Get notified when someone has questions about classes you've taken. (Feature coming soon)"
              checked={!userProfile?.qaEmailOptOut}
              onChange={(event) => {
                setUserProfile({ ...userProfile, qaEmailOptOut: !event.currentTarget.checked } as any)

                fetch('/api/me/privacy', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ qaEmailOptOut: !event.currentTarget.checked })
                }).then(res => res.json()).then(data => {
                  if (data.success) {
                    notifications.show({
                      title: 'Success',
                      message: 'Q&A email preferences updated',
                      color: 'green'
                    })
                  } else {
                    notifications.show({
                      title: 'Error',
                      message: data.message || 'Failed to update privacy settings',
                      color: 'red'
                    })

                    setUserProfile({ ...userProfile, qaEmailOptOut: !(!event.currentTarget.checked) } as any)
                  }
                })
              }}
            />
          </div>

          <div>
            <Switch
              label="Receive general platform emails"
              description="Get updates, announcements, and general communications from MIT OpenGrades"
              checked={userProfile?.emailOptIn === true}
              onChange={(event) => {
                setUserProfile({ ...userProfile, emailOptIn: event.currentTarget.checked } as any)

                fetch('/api/me', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ emailOptIn: event.currentTarget.checked })
                }).then(res => res.json()).then(data => {
                  if (data.success) {
                    notifications.show({
                      title: 'Success',
                      message: 'Email preferences updated',
                      color: 'green'
                    })
                  } else {
                    notifications.show({
                      title: 'Error',
                      message: data.message || 'Failed to update email preferences',
                      color: 'red'
                    })

                    setUserProfile({ ...userProfile, emailOptIn: !event.currentTarget.checked } as any)
                  }
                })
              }}
            />
          </div>
        </Stack>
      </Stack>

      <Group justify="flex-end" mt="xl">
        <Button variant="subtle" onClick={close}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          Save Changes
        </Button>
      </Group>
    </Modal>
  )

  return { modal, open }
}

function UserNavBarSectionWrapper() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const { modal, open } = useEditProfileModal()

  useHotkeys([['mod+J', () => toggleColorScheme()]])

  return <UserSection onEditProfile={open} modal={modal} />
}

function ContentFetcher(props: AppProps) {
  console.log("cOntent fetcher", props)
  const { Component, pageProps } = props

  const { userProfile } = useContext(UserContext)
  const { status } = useSession()
  const router = useRouter()

  if (status === 'unauthenticated') {
    if (router.pathname.startsWith('/about')) {
      return <Component {...pageProps} />
    }
    return <NotLoggedIn />
  }

  if (!userProfile) {
    return (
      <Container style={{ height: '100%', padding: '5rem' }}>
        <Center style={{ height: '90%' }}>
          <Loader variant='dots' size={'xl'} />
        </Center>
      </Container>
    )
  }

  const needsDegreeTermAssignment = (() => {
    const isGrad = userProfile?.year === 'G'
    const hasProgramTerms = Array.isArray((userProfile as any)?.programTerms) && ((userProfile as any).programTerms.length > 0)
    const hasMultipleAffiliations = Array.isArray((userProfile as any)?.courseAffiliation) && ((userProfile as any).courseAffiliation.length > 1)

    return isGrad && hasMultipleAffiliations && !hasProgramTerms
  })()

  const needsEmailOptIn = (userProfile as any)?.emailOptIn === null || (userProfile as any)?.emailOptIn === undefined

  return (
    !userProfile.banned || userProfile.verified === false
      ? <>
        {needsEmailOptIn || needsDegreeTermAssignment || !(userProfile?.trustLevel !== undefined && userProfile?.trustLevel > 0)
          ? <LockdownModule academicYears={availableAcademicYears} {...pageProps} />
          : <Component {...pageProps} />
        }
      </>
      : <>
        <Container style={{ height: '100%', padding: '5rem' }}>
          <Center style={{ height: '90%' }}>
            <Text size="xl" fw={700}>
              Your account is not authorized to use this platform. Please contact <a href="mailto:sipb-opengrades@mit.edu">sipb-opengrades@mit.edu</a> if you believe this is a mistake.
            </Text>
          </Center>
        </Container>
      </>
  )
}

function App({ pageProps, Component, router }: AppProps) {
  const [opened, { toggle }] = useDisclosure()
  console.log("App.props", pageProps)


  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const theme = useMantineTheme()
  const isMounted = useMounted()

  return (
    <>
      <AppShell
        navbar={{
          width: { sm: 200, lg: 300 },
          breakpoint: 'sm',
          collapsed: { mobile: !opened }
        }}
        header={{
          height: 70,
        }}
      >
        <AppShell.Navbar p="md" hidden={!opened}>
          <AppShell.Section grow>
            <NavigationLinks />
          </AppShell.Section>
          <UserNavBarSectionWrapper />
        </AppShell.Navbar>
        {/* <AppShell.Footer>
          <p> Footer </p>
        </AppShell.Footer> */}
        <AppShell.Header p="md">
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', width: '100%', justifyContent: 'space-between' }}>
            {/* <MediaQuery largerThan="sm" styles={{ display: 'none' }}> */}
            <Burger
              opened={opened}
              onClick={toggle}
              size="sm"
              hiddenFrom="sm"
              color={theme.colors.gray[6]}
              mr="xl"
            />
            {/* </MediaQuery> */}
            <Group justify='space-between' style={{ width: '100%' }}>
              <Text fw={'bold'} size={'xl'} variant="gradient" gradient={{ from: 'orange', to: 'yellow', deg: 45 }}>
                MIT OpenGrades
              </Text>
              <Tooltip label="Alt J" position="left" withArrow>
                <ActionIcon onClick={toggleColorScheme} variant='transparent' color='gray' size='sm'>
                  {isMounted ? colorScheme === 'dark' ? <Sun /> : <Moon /> : <Loader />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </div>
        </AppShell.Header>
        <AppShell.Main className={mainClasses.mainContainer}>
          <ContentFetcher {...{ Component, pageProps, router }} />
        </AppShell.Main>
      </AppShell >
    </>
  )
}

export default function AppWrapper({ Component, pageProps, router }: AppProps) {
  useEffect(() => {
    (window as any).dataLayer = (window as any).dataLayer || []
    function gtag(...args: any[]) { (window as any).dataLayer.push(args) }
    gtag('js', new Date())
    gtag('config', 'G-2EWKT6ED8T')
  }, [])

  return <>
    <Head>
      <title>MIT OpenGrades</title>
      <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      <meta name="theme-color" content="#008CFF" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#008CFF" media="(prefers-color-scheme: dark)" />
      <meta name="google-site-verification" content="fXojmVQpuE4vWKn_PgHDimVPychoR4hwhUTnGM7TJuo" />
      <meta name="description" content="MIT OpenGrades is a platform for students to share their experiences with classes at MIT." />
      <meta name="keywords" content="MIT, OpenGrades, Course Reviews, Course Ratings, MIT Course Reviews, MIT Course Ratings" />

      <meta name="og:title" content="MIT OpenGrades" />
      <meta name="og:description" content="MIT OpenGrades is a platform for students to share their experiences with classes at MIT." />
      <meta name="og:url" content="https://opengrades.mit.edu" />

      <link id="theme-link" rel="stylesheet" href="css/themes/lara-dark-blue/theme.css" />
      <link id="theme-link" rel="stylesheet" href="css/themes/lara-light-blue/theme.css" />


      <ColorSchemeScript defaultColorScheme='auto' />
    </Head>

    <ErrorBoundary>
      <PlausibleProvider domain="opengrades.mit.edu" customDomain="https://analytics.mit.edu" trackOutboundLinks selfHosted taggedEvents>
        {/* @ts-expect-error - React 18/19 type compatibility issue with next-auth */}
        <SessionProvider session={pageProps.session}>
          <UserContextProvider>
            <MantineProvider
              theme={theme}
            >
              <Notifications />
              <ModalsProvider>
                {/* <App {...pageProps} /> */}
                <link rel="canonical" href="https://opengrades.mit.edu" />
                <App pageProps={pageProps} Component={Component} router={router} />
                {/* <Script src='https://www.googletagmanager.com/gtag/js?id=G-2EWKT6ED8T' strategy='afterInteractive' /> */}
              </ModalsProvider>
            </MantineProvider>
          </UserContextProvider>
        </SessionProvider>
      </PlausibleProvider>
    </ErrorBoundary>
  </>
}