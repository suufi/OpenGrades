import { ComponentType } from 'react'
import {
    Books,
    FireHydrant,
    Graph,
    History,
    Home,
    InfoCircle,
    Key,
    Mail,
    Road,
    Robot,
    Settings,
    Shield,
    Star,
    Network,
    GitBranch,
    Diamonds
} from 'tabler-icons-react'
import { IconQuestionCircle } from '@tabler/icons'

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
    { label: 'Dashboard', icon: Home, href: '/', color: 'blue', section: 'main' },
    { label: 'AI Search', icon: Robot, href: '/ai-search', color: 'violet', section: 'main', badge: 'NEW' },
    { label: 'Discover', icon: Diamonds, href: '/discover', color: 'pink', section: 'main' },
    { label: 'Classes', icon: Books, href: '/classes', color: 'orange', section: 'main' },
    { label: 'Class Network', icon: Network, href: '/class-network', color: 'indigo', section: 'main' },
    { label: 'Prereq Graph', icon: GitBranch, href: '/prereq-graph', color: 'lime', section: 'main' },
    { label: 'Statistics', icon: Graph, href: '/statistics', color: 'cyan', section: 'main' },
    { label: "Who's Taken What?", icon: IconQuestionCircle, href: '/ofcourse', color: 'teal', section: 'main' },
    { label: 'About', icon: InfoCircle, href: '/about', color: 'grape', section: 'main' },

    // Admin section (trust level > 1)
    { label: 'Reports', icon: Shield, href: '/reports', color: 'green', minTrust: 2, section: 'admin' },
    { label: 'Settings', icon: Settings, href: '/settings', color: 'yellow', minTrust: 2, section: 'admin' },
    { label: 'Audit Logs', icon: History, href: '/auditlogs', color: 'red', minTrust: 2, section: 'admin' },

    { label: 'Hydrant', icon: FireHydrant, href: 'https://hydrant.mit.edu/', color: 'orange', external: true, section: 'sipb' },
    { label: 'CourseRoad', icon: Road, href: 'https://courseroad.mit.edu/', color: 'blue', external: true, section: 'sipb' },
    { label: 'DormSoup', icon: Mail, href: 'https://dormsoup.mit.edu/', color: 'green', external: true, section: 'sipb' },

    // Other links
    { label: 'Feedback', icon: Star, href: 'https://forms.gle/pyj7zY45AVnjX2Nc8', color: 'yellow', external: true, section: 'other' },
    { label: 'Affiliate Access', icon: Key, href: 'https://forms.gle/8iandxQpc6abmQtZA', color: 'pink', external: true, section: 'other' },
]

// Links shown to unauthenticated users
export const publicNavConfig: NavItem[] = [
    { label: 'About', icon: InfoCircle, href: '/about', color: 'grape', section: 'main' },
    { label: 'Feedback', icon: Star, href: 'https://forms.gle/pyj7zY45AVnjX2Nc8', color: 'yellow', external: true, section: 'other' },
    { label: 'Affiliate Access', icon: Key, href: 'https://forms.gle/8iandxQpc6abmQtZA', color: 'pink', external: true, section: 'other' },
]
