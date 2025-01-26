// @ts-nocheck
import { AppProps } from 'next/app'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode, useContext, useEffect } from 'react'

import { ActionIcon, AppShell, Avatar, Box, Burger, Button, Center, ColorSchemeScript, Container, Divider, Group, Loader, MantineProvider, Menu, Text, ThemeIcon, Tooltip, UnstyledButton, createTheme, useMantineColorScheme, useMantineTheme } from '@mantine/core'
import { useDisclosure, useHotkeys, useMounted } from '@mantine/hooks'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { Books, ChevronRight, FireHydrant, History, Home, InfoCircle, Key, Logout, Mail, Moon, Road, Settings, Shield, Star, Sun } from 'tabler-icons-react'

// import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'
import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'

import LockdownModule from '../components/LockdownModule'
import { UserContext, UserContextProvider } from '../components/UserContextProvider'

import '@mantine/charts/styles.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/spotlight/styles.css'


import 'primeicons/primeicons.css'
import 'primereact/resources/primereact.min.css' // core css

import ErrorBoundary from '@/components/ErrorBoundary'
import Script from 'next/script'
import NotLoggedIn from '../components/NotLoggedIn'
import mainClasses from '../styles/Main.module.css'

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

function UserNavBarSection () {
  const theme = useMantineTheme()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const { data: session, status } = useSession()

  useHotkeys([['mod+J', () => toggleColorScheme()]])


  return status === 'authenticated'
    ? (
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
          <Menu.Item leftSection={<Logout> </Logout>} onClick={() => signOut()}>
            Sign Out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
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

  return (
    !userProfile.banned || userProfile.verified === false
      ? <>
        {(userProfile?.trustLevel !== undefined && userProfile?.trustLevel > 0)
          ? <Component {...pageProps} />
          : <LockdownModule academicYears={availableAcademicYears} {...pageProps} />
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
              <Script src='https://www.googletagmanager.com/gtag/js?id=G-2EWKT6ED8T' strategy='afterInteractive' />
            </ModalsProvider>
          </MantineProvider>
        </UserContextProvider>
      </SessionProvider>
    </ErrorBoundary>
  </>
}