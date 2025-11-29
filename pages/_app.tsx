// @ts-nocheck
import { AppProps } from 'next/app'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode, useContext, useEffect, useState } from 'react'

import { ActionIcon, AppShell, Avatar, Badge, Box, Burger, Button, Center, ColorSchemeScript, Container, Divider, Group, Loader, MantineProvider, Menu, Modal, NumberInput, Stack, Text, TextInput, ThemeIcon, Tooltip, UnstyledButton, createTheme, useMantineColorScheme, useMantineTheme } from '@mantine/core'
import { useDisclosure, useHotkeys, useMounted } from '@mantine/hooks'
import { ModalsProvider } from '@mantine/modals'
import { Notifications, notifications } from '@mantine/notifications'
import { Books, ChevronRight, FireHydrant, Graph, History, Home, InfoCircle, Key, Logout, Mail, Moon, Road, Settings, Shield, Star, Sun, User as UserIcon } from 'tabler-icons-react'

// import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'
import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'

import ErrorBoundary from '@/components/ErrorBoundary'
import LockdownModule from '@/components/LockdownModule'
import NotLoggedIn from '@/components/NotLoggedIn'
import { UserContext, UserContextProvider } from '@/components/UserContextProvider'

import PlausibleProvider from 'next-plausible'

import '@mantine/charts/styles.css'
import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/spotlight/styles.css'


import 'primeicons/primeicons.css'
import 'primereact/resources/primereact.min.css' // core css

import mainClasses from '@/styles/Main.module.css'
import { IconQuestionCircle } from '@tabler/icons'

const availableAcademicYears = [
  '2021-2022',
  '2022-2023',
  '2023-2024',
  '2024-2025'
]

interface MainLinkProps {
  icon: ReactNode,
  color: string,
  label: string,
  href: string,
  active: boolean,
  target?: string
}

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

function MainLink ({ icon, color, label, href, active, target }: MainLinkProps) {
  return (
    <Link href={href} passHref style={{ textDecoration: 'none' }} target={target}>
      <UnstyledButton
        className={mainClasses.mainLink}
      >
        <Group>
          <ThemeIcon color={color} variant="light">
            {icon}
          </ThemeIcon>

          <Text className={mainClasses.mainLinkText} size="sm" fw={active ? 'bold' : undefined}>{label}</Text>
        </Group>
      </UnstyledButton>
    </Link>
  )
}

function NavigationLinks () {
  const { status } = useSession()
  const { pathname } = useRouter()

  const { userProfile } = useContext(UserContext)

  return status === 'authenticated'
    ? (
      <>
        <MainLink color='blue' label="Dashboard" icon={<Home />} href="/" active={pathname === '/'} />
        <MainLink label="Classes" icon={<Books />} color="orange" href="/classes" active={pathname === '/classes'} />
        {/* <MainLink label="Leaderboard" icon={<Medal />} color="indigo" href="/leaderboard" active={pathname === '/leaderboard'} /> */}
        {userProfile && userProfile.trustLevel > 1 && <MainLink label="Reports" icon={<Shield />} color="green" href="/reports" active={pathname === '/reports'} />}
        {userProfile && userProfile.trustLevel > 1 && <MainLink label="Settings" icon={<Settings />} color="yellow" href="/settings" active={pathname === '/settings'} />}
        {userProfile && userProfile.trustLevel > 1 && <MainLink label="Audit Logs" icon={<History />} color="red" href="/auditlogs" active={pathname === '/auditlogs'} />}
        <MainLink label="About" icon={<InfoCircle />} color="purple" href="/about" active={pathname === '/about'} />
        <MainLink label="Statistics" icon={<Graph />} color="cyan" href="/statistics" active={pathname === '/statistics'} />
        <MainLink label="Who's Taken What?" icon={<IconQuestionCircle />} color="cyan" href="/ofcourse" active={pathname === '/ofcourse'} />
        {<Divider style={{ margin: 'var(--mantine-spacing-xs) 0' }} label="Other Projects by SIPB" />}
        <MainLink label="Hydrant" icon={<FireHydrant />} color="orange" href="https://hydrant.mit.edu/" target="_blank" active={false} />
        <MainLink label="CourseRoad" icon={<Road />} color="blue" href="https://courseroad.mit.edu/" target="_blank" active={false} />
        <MainLink label="DormSoup" icon={<Mail />} color="green" href="https://dormsoup.mit.edu/" target="_blank" active={false} />
        {<Divider style={{ margin: 'var(--mantine-spacing-xs) 0' }} label="Other Links" />}
        <MainLink label="Feedback" icon={<Star />} color="cyan" href="https://forms.gle/pyj7zY45AVnjX2Nc8" target="_blank" active={false} />
        <MainLink label="Affiliate Access" icon={<Key />} color="cyan" href="https://forms.gle/8iandxQpc6abmQtZA" target="_blank" active={false} />

      </>
    )
    : (
      <>
        <MainLink label="About" icon={<InfoCircle />} color="purple" href="/about" active={pathname === '/about'} />
        <MainLink label="Feedback" icon={<Star />} color="cyan" href="https://forms.gle/pyj7zY45AVnjX2Nc8" target="_blank" active={false} />
        <MainLink label="Affiliate Access" icon={<Key />} color="cyan" href="https://forms.gle/8iandxQpc6abmQtZA" target="_blank" active={false} />
      </>
    )
}

function useEditProfileModal () {
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

function UserNavBarSection () {
  const theme = useMantineTheme()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const { data: session, status } = useSession()
  const { modal, open } = useEditProfileModal()

  useHotkeys([['mod+J', () => toggleColorScheme()]])


  return status === 'authenticated'
    ? (
      <>
        {modal}
        <Menu
          withArrow
          position='right'
        >
          <Menu.Target>
            <Box
              style={{
                paddingTop: 'var(--mantine-spacing-sm)',
                borderTop: "1px solid light-dark(--mantine-color-dark-4, --mantine-color-gray-2)"
              }}
            >
              <UnstyledButton
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 'var(--mantine-spacing-xs)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  color: 'light-dark(--mantine-color-dark-0, --mantine-black)',

                  '&:hover': {
                    backgroundColor: 'light-dark(--mantine-color-dark-6, --mantine-gray-0)'
                  }
                }}
              >
                <Group>
                  <Avatar radius="xl" color="cyan"> {session?.user?.name?.substring(0, 1)} </Avatar>
                  <Box style={{ flex: 1 }}>
                    <Text className={mainClasses.mainLinkText} size="sm" fw={500}>
                      {session?.user?.name}
                    </Text>
                    <Text className={mainClasses.mainLinkText} c="dimmed" size="xs">
                      {session?.user?.email}
                    </Text>
                  </Box>
                  <ChevronRight size={16} />

                </Group>
              </UnstyledButton>
            </Box>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<UserIcon />}
              onClick={open}
            >
              Edit Profile
            </Menu.Item>
            <Menu.Item leftSection={<Logout> </Logout>} onClick={() => signOut()}>
              Sign Out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </>
    )
    : (
      <Button onClick={() => signIn('mit-oidc')} loading={status === 'loading'}>
        Sign In
      </Button>
    )
}

function ContentFetcher (props: AppProps) {
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
            <Text size="xl" weight={700}>
              Your account is not authorized to use this platform. Please contact <a href="mailto:sipb-opengrades@mit.edu">sipb-opengrades@mit.edu</a> if you believe this is a mistake.
            </Text>
          </Center>
        </Container>
      </>
  )
}

function App ({ pageProps, Component }: AppProps) {
  const [opened, { toggle }] = useDisclosure()
  console.log("App.props", pageProps)
  // const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
  //   key: 'mantine-color-scheme',
  //   defaultValue: 'light',
  //   getInitialValueInEffect: true
  // })


  // const toggleColorScheme = (value?: ColorScheme) =>
  //   setColorScheme(value || (colorScheme === 'dark' ? 'light' : 'dark'))

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
          <UserNavBarSection />
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

              {/* <Button onClick={toggleColorScheme} variant='transparent' color='gray' size='sm'> */}
              {/* {colorScheme === 'dark' ? <Sun /> : <Moon />} */}
              {/* </Button> */}

              <Tooltip label="Alt J" position="left" withArrow>
                <ActionIcon onClick={toggleColorScheme} variant='transparent' color='gray' size='sm'>
                  {isMounted ? colorScheme === 'dark' ? <Sun /> : <Moon /> : <Loader />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </div>
        </AppShell.Header>
        <AppShell.Main className={mainClasses.mainContainer}>
          <ContentFetcher {...{ Component, pageProps }} />
        </AppShell.Main>
      </AppShell >
    </>
  )
}

export default function AppWrapper ({ Component, pageProps }: AppProps) {
  useEffect(() => {
    window.dataLayer = window.dataLayer || []
    function gtag () { dataLayer.push(arguments) }
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
        <SessionProvider session={pageProps.session}>
          <UserContextProvider>
            <MantineProvider
              theme={theme}
            >
              <Notifications />
              <ModalsProvider>
                {/* <App {...pageProps} /> */}
                <link rel="canonical" href="https://opengrades.mit.edu" />
                <App pageProps={pageProps} Component={Component} />
                {/* <Script src='https://www.googletagmanager.com/gtag/js?id=G-2EWKT6ED8T' strategy='afterInteractive' /> */}
              </ModalsProvider>
            </MantineProvider>
          </UserContextProvider>
        </SessionProvider>
      </PlausibleProvider>
    </ErrorBoundary>
  </>
}