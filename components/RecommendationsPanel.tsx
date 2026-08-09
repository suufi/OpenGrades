import { IClass } from '@/types'
import {
    Text,
    Title,
    Stack,
    Group,
    Badge,
    UnstyledButton,
    Loader,
    Center,
    Accordion,
    Tooltip,
    Anchor,
} from '@mantine/core'
import { IconBook, IconSparkles, IconStars, IconUsers } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import { usePlausibleTracker } from '@/utils/plausible'
import { useRecommendations } from '@/lib/query'
import ui from '@/styles/Interface.module.css'
import classes from '@/styles/RecommendationsPanel.module.css'

interface Recommendation {
    class: IClass
    score: number
    reason: string
}

interface RecommendationGroup {
    type: string
    title: string
    description: string
    items: Recommendation[]
}

interface RecommendationsPanelProps {
    className?: string
    embedded?: boolean
}

const GROUP_LABELS: Record<string, string> = {
    collaborative: 'Similar students',
    department: 'In your major',
    content: 'Related courses',
    embeddings: 'By course content',
}

const GENERIC_REASON_PATTERNS = [
    /^highly rated in your major\b/i,
    /^classes taken by students with similar\b/i,
    /^classes with similar topics\b/i,
    /^popular in your major\b/i,
]

function getGroupLabel(type: string, fallback: string) {
    return GROUP_LABELS[type] ?? fallback
}

function normalizeText(value: string) {
    return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function summarizeReason(reason: string, groupLabel: string) {
    const collapsed = reason.replace(/\s+/g, ' ').trim()
    const fragments = collapsed.split(/[✓✔|•]/).map((fragment) => fragment.trim()).filter(Boolean)
    let summary = fragments[0] || collapsed

    if (summary.toLowerCase().startsWith(groupLabel.toLowerCase())) {
        summary = summary.slice(groupLabel.length).trim()
    }

    summary = summary
        .replace(/\byou have the prerequisites and corequisites\b/gi, '')
        .replace(/\byou have the prerequisites\b/gi, '')
        .replace(/\byou have the corequisites\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()

    summary = summary.replace(/^[,:;.\-]\s*/, '')
    return summary || fragments[0] || collapsed
}

function getUniqueItemDetail(reason: string, groupLabel: string, groupDescription: string) {
    const summary = summarizeReason(reason, groupLabel)
    if (!summary) return null

    const normalizedSummary = normalizeText(summary)
    const normalizedDescription = normalizeText(groupDescription)

    if (normalizedSummary === normalizedDescription) return null
    if (GENERIC_REASON_PATTERNS.some((pattern) => pattern.test(summary))) return null

    return summary
}

function getColor(type: string) {
    switch (type) {
        case 'collaborative':
            return 'blue'
        case 'department':
            return 'grape'
        case 'content':
            return 'teal'
        case 'embeddings':
            return 'violet'
        default:
            return 'gray'
    }
}

function getIcon(type: string) {
    switch (type) {
        case 'collaborative':
            return <IconUsers size={18} />
        case 'department':
            return <IconBook size={18} />
        case 'content':
            return <IconStars size={18} />
        case 'embeddings':
            return <IconSparkles size={18} />
        default:
            return <IconStars size={18} />
    }
}

function RecommendationRow({
    rec,
    groupType,
    groupLabel,
    groupDescription,
    onNavigate,
}: {
    rec: Recommendation
    groupType: string
    groupLabel: string
    groupDescription: string
    onNavigate: (rec: Recommendation, groupType: string) => void
}) {
    const uniqueDetail = getUniqueItemDetail(rec.reason, groupLabel, groupDescription)
    const showDepartmentBadge = groupType !== 'department' && rec.class.department

    const row = (
        <UnstyledButton
            onClick={() => onNavigate(rec, groupType)}
            className={classes.recommendationButton}
        >
            <div className={classes.recommendationRow}>
                <Text span className={classes.recommendationNumber}>
                    {rec.class.subjectNumber}
                </Text>
                <div className={classes.recommendationBody}>
                    <Text size="sm" lineClamp={1} className={classes.recommendationTitle}>
                        {rec.class.subjectTitle}
                    </Text>
                    {uniqueDetail && (
                        <Text size="xs" lineClamp={1} className={classes.recommendationDetail}>
                            {uniqueDetail}
                        </Text>
                    )}
                </div>
                {showDepartmentBadge && (
                    <Badge size="xs" variant="light" color={getColor(groupType)} className={classes.recommendationBadge}>
                        {rec.class.department}
                    </Badge>
                )}
            </div>
        </UnstyledButton>
    )

    if (!uniqueDetail || uniqueDetail === rec.reason) {
        return row
    }

    return (
        <Tooltip
            label={
                <div style={{ whiteSpace: 'pre-line', maxWidth: '280px' }}>
                    {rec.reason}
                </div>
            }
            position="top"
            withArrow
            multiline
        >
            {row}
        </Tooltip>
    )
}

const RecommendationsPanel = ({ className, embedded = false }: RecommendationsPanelProps) => {
    const router = useRouter()
    const plausible = usePlausibleTracker()
    const { data, isLoading: loading, error } = useRecommendations(5)
    const recommendations = (data ?? []) as RecommendationGroup[]
    const wrapperClassName = embedded
        ? className ?? ''
        : `${ui.sectionCard} ${classes.panel} ${className ?? ''}`
    const Wrapper = embedded ? 'div' : 'section'

    const handleNavigate = (rec: Recommendation, groupType: string) => {
        plausible('Recommendation Click', {
            props: {
                classNumber: rec.class.subjectNumber,
                source: groupType,
            },
        })
        router.push(`/classes/${rec.class._id}`)
    }

    if (loading) {
        return (
            <Wrapper className={wrapperClassName}>
                <Center py="xl">
                    <Loader size="md" />
                </Center>
            </Wrapper>
        )
    }

    if (error || recommendations.length === 0) {
        return null
    }

    return (
        <Wrapper className={wrapperClassName}>
            <Group justify="space-between" mb="sm" align="center" wrap="nowrap" gap="sm">
                <Title order={3} className={ui.sectionTitle}>Recommendations</Title>
                <Anchor component="button" type="button" size="sm" onClick={() => router.push('/discover')}>
                    Discover more
                </Anchor>
            </Group>

            <Accordion
                variant="default"
                className={classes.accordion}
                defaultValue={recommendations[0]?.type}
            >
                {recommendations.map((group) => {
                    const groupLabel = getGroupLabel(group.type, group.title)

                    return (
                        <Accordion.Item key={group.type} value={group.type}>
                            <Accordion.Control icon={getIcon(group.type)}>
                                <Group gap="xs" wrap="nowrap">
                                    <Text size="sm" fw={500}>{groupLabel}</Text>
                                    <Badge size="sm" color={getColor(group.type)} variant="light">
                                        {group.items.length}
                                    </Badge>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                {group.description && (
                                    <Text size="xs" c="dimmed" className={classes.groupDescription}>
                                        {group.description}
                                    </Text>
                                )}
                                <Stack gap={2}>
                                    {group.items.map((rec) => (
                                        <RecommendationRow
                                            key={rec.class._id}
                                            rec={rec}
                                            groupType={group.type}
                                            groupLabel={groupLabel}
                                            groupDescription={group.description}
                                            onNavigate={handleNavigate}
                                        />
                                    ))}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    )
                })}
            </Accordion>
        </Wrapper>
    )
}

export default RecommendationsPanel
