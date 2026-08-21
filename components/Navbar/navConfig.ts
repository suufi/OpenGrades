import { ComponentType } from 'react'
import {
    IconBell,
    IconBook,
    IconChartBar,
    IconCirclesRelation,
    IconClipboardList,
    IconCompass,
    IconFireHydrant,
    IconFlag,
    IconGitBranch,
    IconHome,
    IconInfoCircle,
    IconKey,
    IconListDetails,
    IconLock,
    IconMessageCircle,
    IconRoute,
    IconSearch,
    IconSettings,
    IconSoup,
    IconTrophy,
    IconUsersGroup,
} from '@tabler/icons-react'

export type NavSection = 'main' | 'admin' | 'sipb' | 'other'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface NavItem {
    label: string
    icon: ComponentType<any>
    href: string
    color: string // icon color
    minTrust?: number // minimum trust level required (undefined = 0)
    external?: boolean // opens in new tab
    section: NavSection
    badge?: string // optional badge text (e.g., "NEW")
}

export const navConfig: NavItem[] = [
    // Main section
    { label: 'Dashboard', icon: IconHome, href: '/', color: 'blue', section: 'main' },
    { label: 'AI Search', icon: IconSearch, href: '/ai-search', color: 'violet', section: 'main' },
    { label: 'Discover', icon: IconCompass, href: '/discover', color: 'pink', section: 'main' },
    { label: 'Classes', icon: IconBook, href: '/classes', color: 'orange', section: 'main' },
    { label: 'Class Network', icon: IconCirclesRelation, href: '/class-network', color: 'indigo', section: 'main' },
    { label: 'Statistics', icon: IconChartBar, href: '/statistics', color: 'cyan', section: 'main' },
    { label: 'Leaderboard', icon: IconTrophy, href: '/leaderboard', color: 'grape', section: 'main' },
    { label: "Who's Taken What?", icon: IconUsersGroup, href: '/ofcourse', color: 'teal', section: 'main' },

    // Admin section (trust level > 1)
    { label: 'Reports', icon: IconFlag, href: '/reports', color: 'brick', minTrust: 2, section: 'admin' },
    { label: 'Settings', icon: IconSettings, href: '/settings', color: 'gray', minTrust: 2, section: 'admin' },
    { label: 'Audit Logs', icon: IconClipboardList, href: '/auditlogs', color: 'grape', minTrust: 2, section: 'admin' },

    { label: 'Hydrant', icon: IconFireHydrant, href: 'https://hydrant.mit.edu/', color: 'orange', external: true, section: 'sipb' },
    { label: 'CourseRoad', icon: IconRoute, href: 'https://courseroad.mit.edu/', color: 'blue', external: true, section: 'sipb' },
    { label: 'DormSoup', icon: IconSoup, href: 'https://dormsoup.mit.edu/', color: 'green', external: true, section: 'sipb' },

    // Other links
    { label: 'Notifications', icon: IconBell, href: '/notifications', color: 'yellow', section: 'other' },
    { label: 'About', icon: IconInfoCircle, href: '/about', color: 'grape', section: 'other' },
    { label: 'Changelog', icon: IconListDetails, href: '/changelog', color: 'blue', section: 'other' },
    { label: 'Privacy Policy', icon: IconLock, href: '/privacy', color: 'gray', section: 'other' },
    { label: 'Feedback', icon: IconMessageCircle, href: 'https://forms.gle/pyj7zY45AVnjX2Nc8', color: 'cyan', external: true, section: 'other' },
    { label: 'Affiliate Access', icon: IconKey, href: 'https://forms.gle/8iandxQpc6abmQtZA', color: 'pink', external: true, section: 'other' },
]

// Links shown to unauthenticated users
export const publicNavConfig: NavItem[] = [
    { label: 'About', icon: IconInfoCircle, href: '/about', color: 'grape', section: 'main' },
    { label: 'Changelog', icon: IconListDetails, href: '/changelog', color: 'blue', section: 'other' },
    { label: 'Privacy Policy', icon: IconLock, href: '/privacy', color: 'gray', section: 'other' },
    { label: 'Feedback', icon: IconMessageCircle, href: 'https://forms.gle/pyj7zY45AVnjX2Nc8', color: 'cyan', external: true, section: 'other' },
    { label: 'Affiliate Access', icon: IconKey, href: 'https://forms.gle/8iandxQpc6abmQtZA', color: 'pink', external: true, section: 'other' },
]
