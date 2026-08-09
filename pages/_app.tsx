import { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useContext, useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from '@/lib/query'

import { AppShell, Badge, Box, Burger, Button, Center, ColorSchemeScript, Container, Divider, Group, Loader, MantineProvider, Menu, Modal, MultiSelect, NumberInput, Stack, Switch, Text, TextInput, createTheme, useMantineColorScheme, useMantineTheme } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useDebouncedState, useDisclosure, useHotkeys } from '@mantine/hooks'
import { ModalsProvider } from '@mantine/modals'
import { Notifications, notifications } from '@mantine/notifications'

import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'

import ErrorBoundary from '@/components/ErrorBoundary'
import LockdownModule from '@/components/LockdownModule'
import NotLoggedIn from '@/components/NotLoggedIn'
import { UserContext, UserContextProvider } from '@/components/UserContextProvider'
import { NavigationLinks, UserSection } from '@/components/Navbar'
import Logo from '@/components/Logo'
import { formatCourseOptionCode } from '@/utils/courseOptions'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'

import PlausibleProvider from 'next-plausible'

import '@mantine/charts/styles.css'
import '@mantine/dates/styles.css';
import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/spotlight/styles.css'

import '@/styles/globals.css'
import mainClasses from '@/styles/Main.module.css'
import { ICourseOption, IUser } from '@/types'

const getAvailableAcademicYears = () => {
  const startYear = 2021
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const years = []

  let endYear
  if (currentMonth < 8) {
    endYear = currentYear
  } else {
    endYear = currentYear + 1
  }

  for (let year = startYear; year < endYear; year++) {
    years.push(`${year}-${year + 1}`)
  }

  return years
}

const availableAcademicYears = getAvailableAcademicYears()





const inter = Inter({ subsets: ['latin'] })

const theme = createTheme({
  fontFamily: 'var(--app-body-font)',
  headings: {
    fontFamily: 'var(--app-display-font)',
    fontWeight: '600'
  },
  primaryColor: 'brick',
  defaultRadius: 'lg',
  colors: {
    brick: [
      '#fff5f0',
      '#ffe8db',
      '#ffd0b8',
      '#ffb38e',
      '#f08a5a',
      '#e95b2b',
      '#d14f24',
      '#b8431f',
      '#9a3819',
      '#7c2d14',
    ],
    sand: [
      '#fafafa',
      '#f0f0f0',
      '#e5e5e5',
      '#d4d4d4',
      '#c7c7c7',
      '#b8b8b8',
      '#a3a3a3',
      '#8f8f8f',
      '#7a7a7a',
      '#666666',
    ]
  },
  shadows: {
    xs: '0 2px 6px rgba(51, 51, 51, 0.04)',
    sm: '0 2px 8px rgba(51, 51, 51, 0.05)',
    md: '0 4px 14px rgba(51, 51, 51, 0.06)'
  },
  components: {
    Container: {
      defaultProps: {
        sizes: {
          md: 1200,
          lg: 1500
        }
      }
    },
    Card: {
      defaultProps: {
        radius: 'md',
        shadow: 'xs',
        padding: 'lg',
        withBorder: true
      }
    },
    Paper: {
      defaultProps: {
        radius: 'md',
        shadow: 'xs',
        withBorder: true
      }
    },
    Button: {
      defaultProps: {
        radius: 'xl'
      }
    },
    Badge: {
      defaultProps: {
        radius: 'sm'
      }
    }
  }
})

function useEditProfileModal() {
  const [opened, { open, close }] = useDisclosure(false)
  const { userProfile, setUserProfile } = useContext(UserContext)
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const [classOf, setClassOf] = useState<number | string>('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [referredBy, setReferredBy] = useDebouncedState<string>('', 500)
  const [referredByState, setReferredByState] = useState<{ data: string, status: 'initial' | 'loading' | 'success' | 'error' }>({ data: '', status: 'initial' })

  useEffect(() => {
    if (referredBy.length === 0) return
    fetch(`/api/me/referral-kerb?kerb=${referredBy}`).then(async (res) => {
      const body = await res.json()
      if (res.ok && body.data) {
        setReferredByState({ data: body.data, status: 'success' })
      } else {
        setReferredByState({ data: body.message || 'That kerb is not registered on OpenGrades. Maybe you can refer them?', status: 'error' })
      }
    })
  }, [referredBy])

  const updateFlags = async (flags: string[]) => {
    const previousFlags = userProfile?.flags
    setUserProfile({ ...userProfile, flags } as IUser)

    const res = await fetch('/api/me/flags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags })
    })

    if (!res.ok) {
      const body = await res.json()
      setUserProfile({ ...userProfile, flags: previousFlags } as IUser)
      notifications.show({
        title: 'Error',
        message: body.message || 'Failed to update identity tags',
        color: 'red'
      })
    }
  }

  const saveReferral = async () => {
    const res = await fetch('/api/me/referral', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referredBy })
    })
    const body = await res.json()

    if (res.ok) {
      setUserProfile({ ...userProfile, referredBy } as unknown as IUser)
      notifications.show({
        title: 'Referral saved',
        message: 'Thanks for letting us know who referred you.',
        color: 'green'
      })
    } else {
      notifications.show({
        title: 'Error',
        message: body.message || 'Failed to save referral',
        color: 'red'
      })
    }
  }

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

        {Array.isArray(userProfile?.courseAffiliation) && userProfile.courseAffiliation.length > 0 && (
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
              {userProfile.courseAffiliation
                .filter((course: ICourseOption | null | undefined): course is ICourseOption => course !== null && course !== undefined)
                .map((course: ICourseOption, idx: number) => (
                  <Badge key={idx} color="blue" variant="light" size="md">
                    {formatCourseOptionCode(course)} ({course.courseLevel})
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
          onChange={(val) => setClassOf(val)}
          min={2000}
          max={2040}
          required
        />

        {userProfile?.lastGradeReportUpload && (
          <Text size="xs" c="dimmed">
            Last grade report upload: {new Date(userProfile.lastGradeReportUpload).toLocaleDateString()}
          </Text>
        )}

        <MultiSelect
          label="Identity tags (optional)"
          description="Used only in aggregate to study class experience trends across backgrounds."
          value={userProfile?.flags ?? []}
          onChange={updateFlags}
          data={[
            { value: 'First Gen', label: 'First Generation' },
            { value: 'Low Income', label: 'Low Income' },
            { value: 'International', label: 'International' },
            { value: 'BIL', label: 'Black, Native American/Indigenous, or Latino' },
          ]}
        />

        {!userProfile?.referredBy && (
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              defaultValue=""
              onChange={(e) => setReferredBy(e.target.value)}
              error={referredByState.status === 'error' && referredByState.data}
              rightSectionPointerEvents="none"
              rightSection={referredByState.status === 'success' && <IconCheck color="green" size={18} />}
              label="Who referred you? (optional)"
              placeholder="kerb"
            />
            <Button variant="default" onClick={saveReferral} disabled={referredByState.status !== 'success'}>
              Save
            </Button>
          </Group>
        )}

        <Divider my="md" label="Appearance" labelPosition="center" />

        <Switch
          label="Dark mode"
          description="Use a dark color scheme across OpenGrades (⌘/Ctrl+J)"
          checked={colorScheme === 'dark'}
          onChange={() => toggleColorScheme()}
        />

        <Divider my="md" label="Privacy Settings" labelPosition="center" />

        <Stack gap="sm">
          <div>
            <Switch
              label="Allow my reviews in AI recommendations"
              description="Your reviews help train our recommendation system running on MIT SIPB servers. All AI processing is local—no external services. Only class comments and review metadata (first year, retaking, dropped status) are used. No identifiable information is shared."
              checked={!userProfile?.aiEmbeddingOptOut}
              onChange={(event) => {
                setUserProfile({ ...userProfile, aiEmbeddingOptOut: !event.currentTarget.checked } as IUser)

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

                    setUserProfile({ ...userProfile, aiEmbeddingOptOut: !(!event.currentTarget.checked) } as IUser)
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
              label="Include Harvard courses in AI recommendations"
              description={
                hasRecentGradeReport(userProfile?.lastGradeReportUpload)
                  ? 'Show Harvard catalog matches in similar courses, AI search, and personalized recommendations.'
                  : 'Upload a grade report within the last 4 months to enable Harvard course recommendations.'
              }
              checked={userProfile?.includeHarvardCourses === true}
              disabled={!hasRecentGradeReport(userProfile?.lastGradeReportUpload)}
              onChange={(event) => {
                const next = event.currentTarget.checked
                setUserProfile({ ...userProfile, includeHarvardCourses: next } as IUser)

                fetch('/api/me/privacy', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ includeHarvardCourses: next })
                }).then(res => res.json()).then(data => {
                  if (data.success) {
                    notifications.show({
                      title: 'Success',
                      message: data.message || 'Harvard preference updated',
                      color: 'green'
                    })
                  } else {
                    notifications.show({
                      title: 'Error',
                      message: data.message || 'Failed to update Harvard preference',
                      color: 'red'
                    })
                    setUserProfile({ ...userProfile, includeHarvardCourses: !next } as IUser)
                  }
                })
              }}
            />
          </div>

          <div>
            <Switch
              label="Receive Q&A emails about my courses"
              description="Get notified when someone has questions about classes you've taken. (Feature coming soon)"
              checked={!userProfile?.qaEmailOptOut}
              onChange={(event) => {
                setUserProfile({ ...userProfile, qaEmailOptOut: !event.currentTarget.checked } as IUser)

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

                    setUserProfile({ ...userProfile, qaEmailOptOut: !(!event.currentTarget.checked) } as IUser)
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
                setUserProfile({ ...userProfile, emailOptIn: event.currentTarget.checked } as IUser)

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

                    setUserProfile({ ...userProfile, emailOptIn: !event.currentTarget.checked } as IUser)
                  }
                })
              }}
            />
          </div>

          <div>
            <Switch
              label="Show my kerb on karma leaderboard"
              description={`If off, you will appear as Student (${userProfile?.classOf}) on the karma leaderboard`}
              checked={userProfile?.karmaDisplayKerb === true}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setUserProfile({ ...userProfile, karmaDisplayKerb: checked } as IUser)
                fetch('/api/me', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ karmaDisplayKerb: checked })
                }).then(res => res.json()).then(data => {
                  if (data.success) {
                    notifications.show({
                      title: 'Success',
                      message: 'Karma leaderboard display updated',
                      color: 'green'
                    })
                  } else {
                    setUserProfile({ ...userProfile, karmaDisplayKerb: !checked } as IUser)
                    notifications.show({
                      title: 'Error',
                      message: data.message || 'Failed to update',
                      color: 'red'
                    })
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
    if (router.pathname.startsWith('/about') || router.pathname.startsWith('/privacy')) {
      return <Component {...pageProps} />
    }
    return <NotLoggedIn />
  }

  if (!userProfile || (status === 'authenticated' && Object.keys(userProfile).length === 0)) {
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
    const hasProgramTerms = Array.isArray(userProfile?.programTerms) && (userProfile?.programTerms?.length > 0)
    const hasMultipleAffiliations = Array.isArray(userProfile?.courseAffiliation) && (userProfile?.courseAffiliation?.length > 1)

    return isGrad && hasMultipleAffiliations && !hasProgramTerms
  })()

  const needsEmailOptIn = userProfile?.emailOptIn === null || userProfile?.emailOptIn === undefined

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

  const theme = useMantineTheme()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.location.pathname.startsWith('/api/auth')) return
    void router.replace('/')
  }, [router])

  return (
    <>
      <AppShell
        navbar={{
          width: { sm: 200, lg: 300 },
          breakpoint: 'sm',
          collapsed: { mobile: !opened }
        }}
        header={{
          height: { base: 60, sm: 70 },
        }}
      >
        <AppShell.Navbar
          p="md"
          hidden={!opened}
          className={mainClasses.shellNavbar}
        >
          <AppShell.Section grow>
            <NavigationLinks />
          </AppShell.Section>
          <UserNavBarSectionWrapper />
        </AppShell.Navbar>
        {/* <AppShell.Footer>
          <p> Footer </p>
        </AppShell.Footer> */}
        <AppShell.Header
          px="md"
          py="xs"
          className={mainClasses.shellHeader}
        >
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', width: '100%', justifyContent: 'space-between' }}>
            {/* <MediaQuery largerThan="sm" styles={{ display: 'none' }}> */}
            <Burger
              opened={opened}
              onClick={toggle}
              size="sm"
              hiddenFrom="sm"
              color={theme.colors.sand[7]}
              mr="xl"
            />
            {/* </MediaQuery> */}
            <Group justify='space-between' style={{ width: '100%' }}>
              <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                <Logo variant="full" height={32} />
              </Link>
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
  const [queryClient] = useState(() => createAppQueryClient())

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

      <meta property="og:title" content="MIT OpenGrades" />
      <meta property="og:description" content="MIT OpenGrades is a platform for students to share their experiences with classes at MIT." />
      <meta property="og:url" content="https://opengrades.mit.edu" />
      <meta property="og:image" content="https://opengrades.mit.edu/icons/icon-512x512.png" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />

      <ColorSchemeScript defaultColorScheme='auto' />
    </Head>

    <style jsx global>{`
      :root {
        --font-inter: ${inter.style.fontFamily};
      }
    `}</style>

    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <PlausibleProvider domain="opengrades.mit.edu" customDomain="https://analytics.mit.edu" trackOutboundLinks selfHosted taggedEvents>
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
      </QueryClientProvider>
    </ErrorBoundary>
  </>
}
