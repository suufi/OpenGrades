import { useSession, signIn, signOut } from 'next-auth/react'
import { Avatar, Box, Button, Group, Menu, Text, UnstyledButton } from '@mantine/core'
import { ChevronRight, Logout, User as UserIcon } from 'tabler-icons-react'
import classes from './Navbar.module.css'

interface UserSectionProps {
    onEditProfile: () => void
    modal: React.ReactNode
}

export function UserSection({ onEditProfile, modal }: UserSectionProps) {
    const { data: session, status } = useSession()

    if (status !== 'authenticated') {
        return (
            <Button onClick={() => signIn('mit-oidc')} loading={status === 'loading'}>
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
                                <ChevronRight size={16} />
                            </Group>
                        </UnstyledButton>
                    </Box>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item leftSection={<UserIcon />} onClick={onEditProfile}>
                        Edit Profile
                    </Menu.Item>
                    <Menu.Item leftSection={<Logout />} onClick={() => signOut()}>
                        Sign Out
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </>
    )
}
