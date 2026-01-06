import { useContext, useState } from 'react'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { Divider, Collapse, UnstyledButton, Group, Text } from '@mantine/core'
import { ChevronDown, ChevronRight } from 'tabler-icons-react'

import { NavLink } from './NavLink'
import { navConfig, publicNavConfig, NavSection } from './navConfig'
import { UserContext } from '@/components/UserContextProvider'
import classes from './Navbar.module.css'

const sectionLabels: Record<NavSection, string | null> = {
    main: null,
    admin: null,
    sipb: 'Other Projects by SIPB',
    other: 'Other Links',
}

export function NavigationLinks() {
    const { status } = useSession()
    const { pathname } = useRouter()
    const { userProfile } = useContext(UserContext)
    const [sipbOpened, setSipbOpened] = useState(false)
    const [otherOpened, setOtherOpened] = useState(false)

    const trustLevel = userProfile?.trustLevel ?? 0

    const items = status === 'authenticated' ? navConfig : publicNavConfig

    const filteredItems = items.filter(item => {
        const minTrust = item.minTrust ?? 0
        return trustLevel >= minTrust
    })

    const sections = filteredItems.reduce((acc, item) => {
        if (!acc[item.section]) {
            acc[item.section] = []
        }
        acc[item.section].push(item)
        return acc
    }, {} as Record<NavSection, typeof filteredItems>)

    const sectionOrder: NavSection[] = ['main', 'admin', 'other', 'sipb']

    return (
        <>
            {sectionOrder.map(section => {
                const sectionItems = sections[section]
                if (!sectionItems || sectionItems.length === 0) return null

                const label = sectionLabels[section]
                const isCollapsible = section === 'sipb' || section === 'other'
                const isOpened = section === 'sipb' ? sipbOpened : otherOpened
                const setIsOpened = section === 'sipb' ? setSipbOpened : setOtherOpened

                return (
                    <div key={section}>
                        {label && isCollapsible ? (
                            <>
                                <UnstyledButton
                                    onClick={() => setIsOpened(!isOpened)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: 'var(--mantine-radius-sm)',
                                    }}
                                    className={classes.collapsibleHeader}
                                >
                                    <Group gap="sm" justify="space-between">
                                        <Group gap="sm">
                                            <Text size="sm" fw={500} c="dimmed">
                                                {label}
                                            </Text>
                                        </Group>
                                        {isOpened ? (
                                            <ChevronDown size={16} />
                                        ) : (
                                            <ChevronRight size={16} />
                                        )}
                                    </Group>
                                </UnstyledButton>
                                <Collapse in={isOpened}>
                                    <div style={{ paddingLeft: '0.5rem' }}>
                                        {sectionItems.map(item => (
                                            <NavLink
                                                key={item.href}
                                                icon={item.icon}
                                                label={item.label}
                                                href={item.href}
                                                color={item.color}
                                                active={pathname === item.href}
                                                external={item.external}
                                                badge={item.badge}
                                            />
                                        ))}
                                    </div>
                                </Collapse>
                            </>
                        ) : (
                            <>
                                {label && (
                                    <Divider
                                        className={classes.sectionDivider}
                                        label={label}
                                    />
                                )}
                                {sectionItems.map(item => (
                                    <NavLink
                                        key={item.href}
                                        icon={item.icon}
                                        label={item.label}
                                        href={item.href}
                                        color={item.color}
                                        active={pathname === item.href}
                                        external={item.external}
                                        badge={item.badge}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                )
            })}
        </>
    )
}
