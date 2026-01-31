import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import { getServerSession } from 'next-auth'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import {
    Container,
    Title,
    Select,
    Button,
    Group,
    Paper,
    Text,
    Stack,
    Badge,
    Loader,
    Center,
    Card,
    Grid,
    ThemeIcon,
    Tooltip,
    ActionIcon,
    Switch
} from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import { IconCircle, IconArrowRight, IconHome, IconRefresh } from '@tabler/icons'
import authOptions from '@/pages/api/auth/[...nextauth]'
import { useRouter } from 'next/router'
import Class from '@/models/Class'
import User from '@/models/User'
import mongoConnection from '@/utils/mongoConnection'
import { getDepartmentColor, departmentColors } from '@/utils/departmentColors'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'


const ForceGraph2D = dynamic(
    () => import('react-force-graph-2d'),
    {
        ssr: false,
        loading: () => <Center h={600}><Loader size="xl" /></Center>
    }
)

interface GraphNode {
    id: string
    label: string
    data?: {
        subjectNumber: string
        subjectTitle: string
        department: string
        type: string
    }
}

interface GraphEdge {
    id: string
    source: string
    target: string
    data?: {
        type: 'prerequisite' | 'corequisite'
    }
}

interface ClassNetworkPageProps {
    availableYears: number[]
    departments: string[]
    initialYear: number
}

const ClassNetworkPage: NextPage<ClassNetworkPageProps> = ({
    availableYears,
    departments,
    initialYear
}) => {
    const router = useRouter()
    const fgRef = useRef<any>(null)
    const [academicYear, setAcademicYear] = useState<string>(initialYear.toString())
    const [department, setDepartment] = useState<string | null>(null)
    const [includeIsolated, setIncludeIsolated] = useState(false)
    const [loading, setLoading] = useState(false)
    const [nodes, setNodes] = useState<GraphNode[]>([])
    const [edges, setEdges] = useState<GraphEdge[]>([])
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
    const [explodedNode, setExplodedNode] = useState<string | null>(null)

    useEffect(() => {
        // Reset fixed positions
        if (fgRef.current && nodes.length > 0) {
        }
    }, [nodes])

    const fetchNetwork = useCallback(async () => {
        setLoading(true)
        try {
            let url = `/api/class-network?academicYear=${academicYear}&includeIsolated=${includeIsolated}`
            if (department) {
                url += `&department=${encodeURIComponent(department)}`
            }

            const res = await fetch(url)
            const data = await res.json()

            if (data.success) {
                setNodes(data.data.nodes)
                setEdges(data.data.edges)
                setSelectedNode(null)
                showNotification({
                    title: 'Network Loaded',
                    message: `${data.meta.nodeCount} classes, ${data.meta.edgeCount} connections`,
                    color: 'green'
                })
            } else {
                showNotification({
                    title: 'Error',
                    message: data.message || 'Failed to load network',
                    color: 'red'
                })
            }
        } catch (error) {
            showNotification({
                title: 'Error',
                message: 'Failed to fetch network data',
                color: 'red'
            })
        } finally {
            setLoading(false)
        }
    }, [academicYear, department, includeIsolated])

    const handleNodeClick = (node: any) => {
        setSelectedNode(node)
        if (fgRef.current) {
            node.fx = node.x
            node.fy = node.y
        }
    }

    const handleNodeDoubleClick = (node: any) => {
        router.push(`/classes/aggregate/${node.id}`)
    }

    const handleNodeRightClick = (node: any) => {
        if (explodedNode === node.id) {
            setExplodedNode(null)
            if (fgRef.current && typeof fgRef.current.d3ReheatSimulation === 'function') {
                fgRef.current.d3ReheatSimulation()
            }
        } else {
            setExplodedNode(node.id)
            if (fgRef.current && typeof fgRef.current.d3ReheatSimulation === 'function') {
                fgRef.current.d3ReheatSimulation()
            }
        }
    }

    const handleResetView = () => {
        // Reset view
        setExplodedNode(null)

        // Clear fixed positions
        if (fgRef.current && graphData.nodes.length > 0) {
            graphData.nodes.forEach((node: any) => {
                node.fx = undefined
                node.fy = undefined
            })

            // Reheat simulation
            if (typeof fgRef.current.d3ReheatSimulation === 'function') {
                fgRef.current.d3ReheatSimulation()
            }

            // Wait for simulation to settle, then zoom
            setTimeout(() => {
                if (fgRef.current && graphData.nodes.length > 0) {
                    let minX = Infinity, maxX = -Infinity
                    let minY = Infinity, maxY = -Infinity

                    graphData.nodes.forEach((node: any) => {
                        if (node.x !== undefined && node.y !== undefined) {
                            minX = Math.min(minX, node.x)
                            maxX = Math.max(maxX, node.x)
                            minY = Math.min(minY, node.y)
                            maxY = Math.max(maxY, node.y)
                        }
                    })

                    if (minX !== Infinity && fgRef.current) {
                        // Calculate center
                        const centerX = (minX + maxX) / 2
                        const centerY = (minY + maxY) / 2
                        const width = maxX - minX
                        const height = maxY - minY
                        const maxDim = Math.max(width, height)

                        // Get canvas dimensions (defaults since ref doesn't expose width/height)
                        const canvasWidth = 800
                        const canvasHeight = 600

                        // Calculate zoom level
                        const padding = 50
                        const zoomLevel = Math.min(
                            (canvasWidth - padding * 2) / maxDim,
                            (canvasHeight - padding * 2) / maxDim
                        )

                        // Center and zoom
                        if (typeof fgRef.current.centerAt === 'function') {
                            fgRef.current.centerAt(centerX, centerY, 1000)
                        }
                        if (typeof fgRef.current.zoom === 'function') {
                            fgRef.current.zoom(zoomLevel, 1000)
                        } else if (typeof fgRef.current.zoomToFit === 'function') {
                            // Fallback to zoomToFit
                            fgRef.current.zoomToFit(400, 50)
                        }
                    }
                }
            }, 500) // Wait for simulation to settle
        }
    }

    const handleHome = () => {
        // Reload the current network and reset the view
        setExplodedNode(null)
        fetchNetwork()
        handleResetView()
    }

    // Memoize graph data with GIR positioning and edge curvature
    const graphData = useMemo(() => {
        const isGIR = (node: GraphNode) => node.data?.isGIR || false
        const girNodes = nodes.filter(isGIR)
        const nonGirNodes = nodes.filter(n => !isGIR(n))

        // Position GIR nodes in a circle
        const girAngleStep = girNodes.length > 0 ? (2 * Math.PI) / girNodes.length : 0
        const girRadius = 200 // Increased radius for better spacing

        const mappedNodes = [
            ...girNodes.map((n, i) => ({
                id: n.id,
                name: n.label || n.id,
                ...n,
                // Initial position for GIR nodes
                fx: undefined,
                fy: undefined,
                x: girRadius * Math.cos(i * girAngleStep),
                y: girRadius * Math.sin(i * girAngleStep),
                isGIR: true
            })),
            ...nonGirNodes.map(n => ({
                id: n.id,
                name: n.label || n.id,
                ...n,
                isGIR: false
            }))
        ]

        // Count incoming edges per target node
        const targetEdgeCounts = new Map<string, number>()
        const targetEdgeIndices = new Map<string, Map<string, number>>()

        edges.forEach((e, idx) => {
            const target = e.target
            if (!targetEdgeCounts.has(target)) {
                targetEdgeCounts.set(target, 0)
                targetEdgeIndices.set(target, new Map())
            }
            const count = targetEdgeCounts.get(target) || 0
            targetEdgeCounts.set(target, count + 1)
            targetEdgeIndices.get(target)!.set(e.source, count)
        })

        return {
            nodes: mappedNodes,
            links: edges.map(e => {
                const target = e.target
                const edgeCount = targetEdgeCounts.get(target) || 1
                const edgeIndex = targetEdgeIndices.get(target)?.get(e.source) || 0

                // Calculate curvature based on edge index to stack arrows
                const baseCurvature = 0.15
                const maxCurvature = 0.4
                const curvatureStep = edgeCount > 1 ? (maxCurvature - baseCurvature) / (edgeCount - 1) : 0
                const curvature = baseCurvature + (edgeIndex * curvatureStep)

                return {
                    source: e.source,
                    target: e.target,
                    color: e.data?.type === 'corequisite' ? '#BE4BDB' : '#999',
                    curvature: curvature
                }
            })
        }
    }, [nodes, edges])

    return (
        <Container size="xl" py="xl">
            <Head>
                <title>Class Network - MIT OpenGrades</title>
                <meta name="description" content="Explore the full network of MIT classes and their relationships" />
            </Head>

            <Title order={1} mb="lg">
                Class Network Explorer
            </Title>
            <Text c="dimmed" mb="xl">
                Visualize all class relationships for an academic year. Click a class to see details, double-click to view it, right-click to explode it.
            </Text>

            {/* Controls */}
            <Paper shadow="sm" p="md" mb="xl" withBorder>
                <Grid align="flex-end">
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label="Academic Year"
                            placeholder="Select year"
                            value={academicYear}
                            onChange={(v) => v && setAcademicYear(v)}
                            data={availableYears.map(y => ({ value: y.toString(), label: `${y}-${y + 1}` }))}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label="Department Filter"
                            placeholder="All departments"
                            value={department}
                            onChange={setDepartment}
                            clearable
                            data={departments.map(d => ({ value: d, label: `Course ${d}` }))}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Group justify="space-between">
                            <Button onClick={fetchNetwork} loading={loading}>
                                Load Network
                            </Button>
                            <Group gap="xs">
                                <Tooltip label="Reset to home view">
                                    <ActionIcon
                                        variant="light"
                                        onClick={handleHome}
                                        disabled={nodes.length === 0}
                                    >
                                        <IconHome size={18} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Reset view (zoom to fit)">
                                    <ActionIcon
                                        variant="light"
                                        onClick={handleResetView}
                                        disabled={nodes.length === 0}
                                    >
                                        <IconRefresh size={18} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    </Grid.Col>
                    <Grid.Col span={12}>
                        <Group justify="flex-end">
                            <Switch
                                label="Show isolated classes (may be slow)"
                                checked={includeIsolated}
                                onChange={(event) => setIncludeIsolated(event.currentTarget.checked)}
                            />
                        </Group>
                    </Grid.Col>
                </Grid>
            </Paper>

            {/* Legend */}
            <Group mb="md" gap="lg" wrap="wrap">
                <Group gap="xs">
                    <ThemeIcon size="sm" color="#FFD700" radius="xl">
                        <IconCircle size={10} />
                    </ThemeIcon>
                    <Text size="xs" fw={500}>GIR Classes (yellow nodes)</Text>
                </Group>
                <Group gap="xs">
                    <ThemeIcon size="sm" color="#999999" radius="xl">
                        <IconCircle size={10} />
                    </ThemeIcon>
                    <Text size="xs">Prerequisite edges</Text>
                </Group>
                <Group gap="xs">
                    <ThemeIcon size="sm" color="#BE4BDB" radius="xl">
                        <IconCircle size={10} />
                    </ThemeIcon>
                    <Text size="xs">Corequisite edges</Text>
                </Group>
                <Text size="xs" c="dimmed">
                    Arrow direction shows dependency direction.
                </Text>
            </Group>

            {/* Graph Visualization */}
            <Paper shadow="sm" withBorder style={{ height: 650, position: 'relative', overflow: 'hidden' }}>
                {loading && (
                    <Center
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(255,255,255,0.8)',
                            zIndex: 10
                        }}
                    >
                        <Stack align="center">
                            <Loader size="xl" />
                            <Text>Loading network... This may take a moment for large datasets.</Text>
                        </Stack>
                    </Center>
                )}

                {nodes.length > 0 ? (
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                        {explodedNode && (
                            <Badge
                                color="blue"
                                variant="filled"
                                style={{
                                    position: 'absolute',
                                    top: 10,
                                    right: 10,
                                    zIndex: 10
                                }}
                            >
                                Exploring: {explodedNode}
                            </Badge>
                        )}
                        <ForceGraph2D
                            ref={fgRef}
                            graphData={graphData}
                            width={undefined}
                            height={650}
                            nodeLabel={(node: any) => {
                                const title = node.data?.subjectTitle || ''
                                const girInfo = node.data?.isGIR ? ' (GIR)' : ''
                                return `${node.name || node.id}${girInfo}${title ? `: ${title}` : ''}`
                            }}
                            nodeColor={(node: any) => {
                                // Highlight GIR nodes with a special color
                                if (node.data?.isGIR) {
                                    return '#FFD700' // Gold for GIRs
                                }
                                return getDepartmentColor(node.id)
                            }}
                            nodeVal={(node: any) => {
                                // Smaller nodes for better visibility
                                return node.data?.isGIR ? 10 : 8
                            }}
                            nodeRelSize={4}
                            linkColor={(link: any) => link.color || '#999'}
                            linkWidth={2}
                            linkDirectionalArrowLength={6}
                            linkDirectionalArrowRelPos={1}
                            linkDirectionalParticles={2}
                            linkDirectionalParticleSpeed={0.01}
                            linkCurvature={(link: any) => link.curvature || 0}
                            onNodeClick={handleNodeClick}
                            onNodeRightClick={handleNodeRightClick}
                            onNodeDrag={(node: any) => {
                                // Fix node position while dragging
                                node.fx = node.x
                                node.fy = node.y
                            }}
                            onNodeDragEnd={(node: any) => {
                                // Keep node fixed after dragging
                                node.fx = node.x
                                node.fy = node.y
                            }}
                            // Force simulation parameters
                            d3Force="charge"
                            d3ForceStrength={(node: any) => {
                                // Repulsion strength
                                return node.data?.isGIR ? -2000 : -600
                            }}
                            d3ForceLinkDistance={(link: any) => {
                                // Link distance
                                const sourceId = typeof link.source === 'string' ? link.source : link.source.id
                                const targetId = typeof link.target === 'string' ? link.target : link.target.id
                                const sourceNode = graphData.nodes.find((n: any) => n.id === sourceId)
                                const targetNode = graphData.nodes.find((n: any) => n.id === targetId)
                                const sourceIsGIR = sourceNode?.data?.isGIR
                                const targetIsGIR = targetNode?.data?.isGIR

                                // Increase distance for exploded nodes
                                if (explodedNode && (sourceId === explodedNode || targetId === explodedNode)) {
                                    return 1000
                                }

                                // Longer distance for GIR connections
                                if (sourceIsGIR && targetIsGIR) {
                                    return 600
                                }
                                // Base link distance
                                return (sourceIsGIR || targetIsGIR) ? 450 : 350
                            }}
                            cooldownTicks={200}
                            onEngineStop={() => {
                                // Graph has settled
                            }}
                        />
                    </div>
                ) : (
                    <Center h="100%">
                        <Stack align="center" gap="md">
                            <Text c="dimmed" size="lg">
                                Select an academic year and click "Load Network" to visualize class relationships
                            </Text>
                        </Stack>
                    </Center>
                )}
            </Paper>

            {/* Selected Node Info */}
            {selectedNode && (
                <Card shadow="sm" p="md" mt="md" withBorder>
                    <Group justify="space-between">
                        <div>
                            <Group gap="xs" mb="xs">
                                <Badge
                                    color={getDepartmentColor(selectedNode.id)}
                                    variant="filled"
                                >
                                    {selectedNode.data?.department || 'Unknown'}
                                </Badge>
                                <Title order={4}>{selectedNode.id}</Title>
                            </Group>
                            <Text>{selectedNode.data?.subjectTitle}</Text>
                        </div>
                        <Group>
                            <Tooltip label="View in graph explorer">
                                <Button
                                    variant="light"
                                    size="sm"
                                    onClick={() => router.push(`/prereq-graph?subject=${selectedNode.id}`)}
                                >
                                    Explore Graph
                                </Button>
                            </Tooltip>
                            <Tooltip label="View class page">
                                <Button
                                    variant="filled"
                                    size="sm"
                                    onClick={() => router.push(`/classes/aggregate/${selectedNode.id}`)}
                                >
                                    View Class <IconArrowRight size={14} style={{ marginLeft: 4 }} />
                                </Button>
                            </Tooltip>
                        </Group>
                    </Group>
                </Card>
            )}

            {/* Stats */}
            {nodes.length > 0 && (
                <Group mt="md" gap="xl">
                    <Text size="sm" c="dimmed">
                        {nodes.length} classes • {edges.length} prerequisite/corequisite connections
                    </Text>
                </Group>
            )}
        </Container>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    const session = await getServerSession(context.req, context.res, authOptions)

    if (!session) {
        return {
            redirect: {
                destination: '/auth/signin',
                permanent: false
            }
        }
    }

    await mongoConnection()

    // Check if user has submitted a grade report
    const user = await User.findOne({ email: session.user?.email?.toLowerCase() }).lean()
    if (!user) {
        return {
            redirect: {
                destination: '/auth/signin',
                permanent: false
            }
        }
    }

    if (!hasRecentGradeReport(user.lastGradeReportUpload)) {
        return {
            redirect: {
                destination: '/?error=grade_report_required',
                permanent: false
            }
        }
    }

    // Get available academic years
    const years = await Class.distinct('academicYear', { offered: true })
    const availableYears = years.sort((a, b) => b - a)

    // Get unique departments
    const depts = await Class.distinct('department', { offered: true })
    const departments = depts.filter(Boolean).sort()

    return {
        props: {
            availableYears,
            departments,
            initialYear: availableYears[0] || 2024
        }
    }
}

export default ClassNetworkPage
