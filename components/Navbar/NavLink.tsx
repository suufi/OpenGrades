import Link from 'next/link'
import { Badge, Group, Text, ThemeIcon, UnstyledButton } from '@mantine/core'
import { ComponentType } from 'react'
import classes from './Navbar.module.css'

interface NavLinkProps {
    icon: ComponentType<{ size?: number }>
    label: string
    href: string
    color: string
    active: boolean
    external?: boolean
    badge?: string
}

export function NavLink({ icon: Icon, label, href, color, active, external, badge }: NavLinkProps) {
    const linkClasses = [
        classes.navLink,
        active && classes.navLinkActive,
    ].filter(Boolean).join(' ')

    return (
        <Link
            href={href}
            passHref
            style={{ textDecoration: 'none' }}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
        >
            <UnstyledButton
                className={linkClasses}
                style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--mantine-radius-sm)',
                }}
            >
                <Group gap="sm">
                    <ThemeIcon
                        variant="light"
                        color={color}
                        className={classes.navLinkIcon}
                    >
                        <Icon size={18} />
                    </ThemeIcon>
                    <Text className={classes.navLinkText} size="sm">
                        {label}
                    </Text>
                    {badge && (
                        <Badge size="xs" variant="filled" color={color}>
                            {badge}
                        </Badge>
                    )}
                </Group>
            </UnstyledButton>
        </Link>
    )
}
