import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { Avatar, Box, Button, Group, Menu, Text, UnstyledButton } from '@mantine/core'
import { IconChevronRight, IconLogout, IconUser } from '@tabler/icons-react'
import classes from './Navbar.module.css'

interface UserSectionProps {
    onEditProfile: () => void
    modal: React.ReactNode
}

function getSafeSignInCallbackUrl(asPath: string): string {
    const path = asPath.split('?')[0]
    if (path.startsWith('/api/auth')) return '/'
    return asPath || '/'
}

export function UserSection({ onEditProfile, modal }: UserSectionProps) {
    const { data: session, status } = useSession()
    const router = useRouter()

    if (status !== 'authenticated') {
        return (
            <Button
                onClick={() => signIn('mit-oidc', { callbackUrl: getSafeSignInCallbackUrl(router.asPath) })}
                loading={status === 'loading'}
            >
                Sign In
            </Button>
        )
    }

    return (
        <>
            {modal}
            <Menu withArrow position="right">
                <Menu.Target>
                    <Box className={classes.userSection}>
                        <UnstyledButton className={classes.userButton}>
                            <Group>
                                <Avatar radius="xl" color="cyan">
                                    {session?.user?.name?.substring(0, 1)}
                                </Avatar>
                                <Box style={{ flex: 1 }}>
                                    <Text className={classes.userText} size="sm" fw={500}>
                                        {session?.user?.name}
                                    </Text>
                                    <Text className={classes.userTextDimmed} size="xs">
                                        {session?.user?.email}
                                    </Text>
                                </Box>
                                <IconChevronRight size={16} />
                            </Group>
                        </UnstyledButton>
                    </Box>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item leftSection={<IconUser />} onClick={onEditProfile}>
                        Edit Profile
                    </Menu.Item>
                    <Menu.Item leftSection={<IconLogout />} onClick={() => signOut()}>
                        Sign Out
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </>
    )
}
