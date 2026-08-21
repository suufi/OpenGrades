import type { NotificationCategory } from '@/types'

export interface NotificationTemplate {
    id: string
    /** Menu label in the composer */
    label: string
    category: NotificationCategory
    /** May contain {date}, {event}, {feature}, {term} tokens */
    title: string
    body: string
    /** Auto-select this template when a registrar calendar event matches */
    match?: RegExp
    targetPath?: string
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
    {
        id: 'registration-open',
        label: 'Registration opens',
        category: 'academic_calendar',
        match: /registration open for all students/i,
        title: 'Registration is open',
        body: 'Registration for all students is open as of {date}. Submit yours before the deadline to avoid the $50 late fee.',
    },
    {
        id: 'registration-deadline',
        label: 'Registration deadline',
        category: 'academic_calendar',
        match: /(?<!pre-)registration deadline/i,
        title: 'Registration deadline {date}',
        body: 'Registration for all students must be submitted by {date}. A $50 late fee applies after this date.',
    },
    {
        id: 'hass-proposal',
        label: 'HASS Concentration Proposal deadline',
        category: 'academic_calendar',
        match: /second-term juniors/i,
        title: 'HASS Concentration Proposal due {date}',
        body: 'Second-term juniors: the HASS Concentration Proposal Form is due {date}. A $50 late fee applies after this date.',
    },
    {
        id: 'hass-completion',
        label: 'HASS Concentration Completion deadline',
        category: 'academic_calendar',
        match: /final-term seniors/i,
        title: 'HASS Concentration Completion due {date}',
        body: 'Final-term seniors: the HASS Concentration Completion Form is due {date}. A $50 late fee applies after this date.',
    },
    {
        id: 'pe-registration',
        label: 'PE registration opens',
        category: 'pe_updates',
        match: /physical education/i,
        title: 'PE registration opens {date}',
        body: 'Physical Education & Wellness registration opens {date} at 8:00 AM. Popular sections fill fast — register early.',
    },
    {
        id: 'add-date',
        label: 'Add Date',
        category: 'academic_calendar',
        match: /^add date/i,
        title: 'Add Date is {date}',
        body: 'Last day to add full-term subjects is {date}. Double-check your registration in WebSIS before the deadline.',
    },
    {
        id: 'drop-date',
        label: 'Drop Date',
        category: 'academic_calendar',
        match: /^drop date/i,
        title: 'Drop Date is {date}',
        body: 'Last day to drop full-term subjects is {date}. Review your schedule while there is still time.',
    },
    {
        id: 'calendar-event',
        label: 'Calendar reminder (generic)',
        category: 'academic_calendar',
        title: '{event}',
        body: '{event} ({date}).',
    },
    {
        id: 'feature-update',
        label: 'New feature announcement',
        category: 'feature_updates',
        title: 'New on OpenGrades: {feature}',
        body: '{feature} is now live in the app. Tap to check it out.',
        targetPath: '/',
    },
    {
        id: 'catalog-live',
        label: 'New term catalog live',
        category: 'catalog_updates',
        title: '{term} classes are live',
        body: 'The {term} catalog is now on OpenGrades — browse subjects, grade histories, and reviews to plan your term.',
        targetPath: '/classes',
    },
]

export function templateForEventSummary(summary: string): NotificationTemplate {
    return (
        NOTIFICATION_TEMPLATES.find(t => t.match?.test(summary)) ??
        NOTIFICATION_TEMPLATES.find(t => t.id === 'calendar-event')!
    )
}

export function fillTemplate(
    text: string,
    vars: Partial<Record<'date' | 'event' | 'feature' | 'term', string>>
): string {
    return text.replace(/\{(date|event|feature|term)\}/g, (match, token: string) => {
        const value = vars[token as keyof typeof vars]
        return value !== undefined && value !== '' ? value : match
    })
}

export function missingTokens(text: string): string[] {
    return [...new Set([...text.matchAll(/\{(date|event|feature|term)\}/g)].map(m => m[1]))]
}
