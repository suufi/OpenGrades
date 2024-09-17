// @ts-nocheck
import { AppProps } from 'next/app'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { ReactNode, useContext } from 'react'

import { AppShell, Avatar, Box, Burger, Button, Center, ColorSchemeScript, Container, Group, Loader, MantineProvider, Menu, Text, ThemeIcon, UnstyledButton, createTheme, useMantineColorScheme, useMantineTheme } from '@mantine/core'
import { useDisclosure, useHotkeys } from '@mantine/hooks'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { Books, ChevronRight, History, Home, Logout, Settings, Shield } from 'tabler-icons-react'

// import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'
import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'

import LockdownModule from '../components/LockdownModule'
import { UserContext, UserContextProvider } from '../components/UserContextProvider'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

import 'primeicons/primeicons.css'
import 'primereact/resources/primereact.min.css' // core css

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
  active: boolean
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

function MainLink ({ icon, color, label, href, active }: MainLinkProps) {
  return (
    <Link href={href} passHref style={{ textDecoration: 'none' }}>
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
      </>
    )
    : (
      <React.Fragment />
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

  if (status === 'unauthenticated') {
    return <NotLoggedIn />
  }

  return (
    typeof (userProfile.trustLevel) == 'number'
      ? <>
        {(userProfile.trustLevel > 0)
          ? <Component {...pageProps} />
          : <LockdownModule academicYears={availableAcademicYears} />
        }
      </>
      : <Container style={{ height: '100%', padding: '5rem' }}>
        <Center style={{ height: '90%' }}>
          <Loader variant='dots' size={'xl'} />
        </Center>
      </Container>
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

  const { colorScheme } = useMantineColorScheme()
  const theme = useMantineTheme()

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
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
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

            <Text fw={'bold'} size={'xl'} variant="gradient" gradient={{ from: 'orange', to: 'yellow', deg: 45 }}>
              MIT OpenGrades
            </Text>
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
  console.log('component is', Component)
  console.log('pageProps is', pageProps)
  return <>
    <Head>
      <title>Page title</title>
      <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      <meta name="theme-color" content="#008CFF" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#008CFF" media="(prefers-color-scheme: dark)" />
      <link id="theme-link" rel="stylesheet" href="/themes/lara-dark-blue/theme.css" />
      <link id="theme-link" rel="stylesheet" href="/themes/lara-light-blue/theme.css" />


      <ColorSchemeScript defaultColorScheme='auto' />
    </Head>

    <SessionProvider session={pageProps.session}>
      <UserContextProvider>
        <MantineProvider
          theme={theme}
        >
          <Notifications />
          <ModalsProvider>
            {/* <App {...pageProps} /> */}
            <App pageProps={pageProps} Component={Component} />
          </ModalsProvider>
        </MantineProvider>
      </UserContextProvider>
    </SessionProvider>
  </>
}