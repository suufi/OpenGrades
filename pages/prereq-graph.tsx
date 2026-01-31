import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next'
import { getServerSession } from 'next-auth'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import {
    Container,
    Title,
    TextInput,
    Button,
    Group,
    Paper,
    Text,
    Slider,
    Stack,
    Badge,
    Loader,
    Center,
    Tooltip,
    ActionIcon,
    Card,
    Grid,
    ThemeIcon
} from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import { IconSearch, IconRefresh, IconArrowRight, IconCircle, IconHome, IconZoomIn } from '@tabler/icons'
import authOptions from '@/pages/api/auth/[...nextauth]'
import { useRouter } from 'next/router'
import User from '@/models/User'
import mongoConnection from '@/utils/mongoConnection'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'

// Dynamic import for react-force-graph-2d (SSR not supported)
const ForceGraph2D = dynamic(
    () => import('react-force-graph-2d'),
    { ssr: false, loading: () => <Center h={500}><Loader size="xl" /></Center> }
)

interface GraphNode {
    id: string
    label: string
    data?: {
        subjectNumber: string
        subjectTitle: string
        department: string
        type: 'root' | 'prerequisite' | 'corequisite' | 'requiredBy'
    }
}

interface GraphEdge {
    id: string
    source: string
    target: string
    label?: string
    data?: {
        type: 'prerequisite' | 'corequisite'
    }
}

// Color scheme for node types
const nodeColors = {
    root: '#228BE6',        // Blue - the selected class
    prerequisite: '#40C057', // Green - prereqs for this class
    corequisite: '#BE4BDB', // Purple - coreqs
    requiredBy: '#FD7E14'   // Orange - classes that need this
}

interface PrereqGraphPageProps {
    initialSubject?: string
}

const PrereqGraphPage: NextPage<PrereqGraphPageProps> = ({ initialSubject }) => {
    const router = useRouter()
    const fgRef = useRef<any>(null)
    const [searchValue, setSearchValue] = useState(initialSubject || '')
    const [rootSubject, setRootSubject] = useState(initialSubject || '')
    const [currentSubject, setCurrentSubject] = useState(initialSubject || '')
    const [depth, setDepth] = useState(2)
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

    // Base fetch that replaces the current graph (used for new searches / home)
    const fetchGraph = useCallback(async (subject: string, maxDepth: number) => {
        if (!subject) return

        setLoading(true)
        try {
            const res = await fetch(`/api/prereq-graph?subjectNumber=${encodeURIComponent(subject)}&depth=${maxDepth}`)
            const data = await res.json()

            if (data.success) {
                setNodes(data.data.nodes)
                setEdges(data.data.edges)
                setRootSubject(subject)
                setCurrentSubject(subject)
                setSelectedNode(null)

                // Update URL without reload
                router.replace(`/prereq-graph?subject=${encodeURIComponent(subject)}`, undefined, { shallow: true })
            } else {
                showNotification({
                    title: 'Error',
                    message: data.message || 'Failed to load graph',
                    color: 'red'
                })
            }
        } catch (error) {
            showNotification({
                title: 'Error',
                message: 'Failed to fetch graph data',
                color: 'red'
            })
        } finally {
            setLoading(false)
        }
    }, [router])

    // Load initial graph if subject provided
    useEffect(() => {
        if (initialSubject) {
            fetchGraph(initialSubject, depth)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSearch = () => {
        if (searchValue.trim()) {
            fetchGraph(searchValue.trim().toUpperCase(), depth)
        }
    }

    const handleNodeClick = (node: any) => {
        setSelectedNode(node)
        // Fix node position
        if (node) {
            node.fx = node.x
            node.fy = node.y
        }
    }

    // Expand graph around a node, keeping original root as visual center
    const expandGraphFromNode = async (subject: string, maxDepth: number) => {
        if (!subject) return

        setLoading(true)
        try {
            const res = await fetch(`/api/prereq-graph?subjectNumber=${encodeURIComponent(subject)}&depth=${maxDepth}`)
            const data = await res.json()

            if (data.success) {
                const newNodes: GraphNode[] = data.data.nodes || []
                const newEdges: GraphEdge[] = data.data.edges || []

                // Merge nodes
                setNodes(prevNodes => {
                    const byId = new Map<string, GraphNode>()
                    prevNodes.forEach(n => byId.set(n.id, n))
                    newNodes.forEach(n => {
                        if (!byId.has(n.id)) {
                            byId.set(n.id, n)
                        }
                    })

                    // Keep original root as the only root node
                    return Array.from(byId.values()).map(n => {
                        if (n.id === rootSubject) {
                            return {
                                ...n,
                                data: { ...n.data, type: 'root' as const }
                            }
                        }
                        if (n.data?.type === 'root' && n.id !== rootSubject) {
                            return {
                                ...n,
                                data: { ...n.data, type: 'prerequisite' as const }
                            }
                        }
                        return n
                    })
                })

                // Merge edges
                setEdges(prevEdges => {
                    const seen = new Set(prevEdges.map(e => e.id))
                    const merged = [...prevEdges]
                    newEdges.forEach(e => {
                        if (!seen.has(e.id)) {
                            seen.add(e.id)
                            merged.push(e)
                        }
                    })
                    return merged
                })
            } else {
                showNotification({
                    title: 'Error',
                    message: data.message || 'Failed to expand graph',
                    color: 'red'
                })
            }
        } catch (error) {
            showNotification({
                title: 'Error',
                message: 'Failed to expand graph data',
                color: 'red'
            })
        } finally {
            setLoading(false)
        }
    }

    const handleNodeDoubleClick = (node: GraphNode) => {
        // Recenter graph on this node
        setSearchValue(node.id)
        fetchGraph(node.id, depth)
    }

    const handleNodeRightClick = (node: any) => {
        // Explode node - dynamically expand around it
        if (explodedNode === node.id) {
            // Collapse if already exploded
            setExplodedNode(null)
        } else {
            setExplodedNode(node.id)
        }
        expandGraphFromNode(node.id, depth)
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
            if (fgRef.current.d3ReheatSimulation) {
                fgRef.current.d3ReheatSimulation()
            }

            // Wait for simulation to settle, then zoom
            setTimeout(() => {
                if (fgRef.current && graphData.nodes.length > 0) {
                    // Calculate node bounds
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
        // Reset to original subject
        setExplodedNode(null)
        if (currentSubject) {
            setSearchValue(currentSubject)
            fetchGraph(currentSubject, depth)
        } else if (initialSubject) {
            setSearchValue(initialSubject)
            fetchGraph(initialSubject, depth)
        }
        handleResetView()
    }

    // Update slider value continuously, but only refetch on commit
    const handleDepthChange = (newDepth: number) => {
        setDepth(newDepth)
    }

    const handleDepthCommit = (newDepth: number) => {
        setDepth(newDepth)
        if (currentSubject) {
            fetchGraph(currentSubject, newDepth)
        } else if (rootSubject) {
            fetchGraph(rootSubject, newDepth)
        }
    }

    // Memoize graph data with edge curvature
    const graphData = useMemo(() => {
        // Count incoming edges
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
            nodes: nodes.map(n => ({
                id: n.id,
                name: n.label || n.id,
                ...n
            })),
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
                    color: e.data?.type === 'corequisite' ? nodeColors.corequisite : '#888',
                    curvature: curvature
                }
            })
        }
    }, [nodes, edges])

    return (
        <Container size="xl" py="xl">
            <Head>
                <title>Prerequisite Graph - MIT OpenGrades</title>
                <meta name="description" content="Explore class prerequisites and dependencies" />
            </Head>

            <Title order={1} mb="lg">
                Prerequisite Graph Explorer
            </Title>
            <Text c="dimmed" mb="xl">
                Visualize how classes connect through prerequisites and corequisites. Double-click any node to recenter. Right-click to explode a node. Drag nodes to rearrange.
            </Text>

            {/* Search and Controls */}
            <Paper shadow="sm" p="md" mb="xl" withBorder>
                <Grid>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Group>
                            <TextInput
                                placeholder="Enter class number (e.g., 6.3900, 18.06)"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                style={{ flex: 1 }}
                                leftSection={<IconSearch size={16} />}
                            />
                            <Button onClick={handleSearch} loading={loading}>
                                Explore
                            </Button>
                        </Group>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Stack gap="xs" pb="md">
                            <Group justify="space-between">
                            <Text size="sm" fw={500}>Depth: {depth} levels</Text>
                                <Group gap="xs">
                                    <Tooltip label="Reset to home view">
                                        <ActionIcon
                                            variant="light"
                                            onClick={handleHome}
                                            disabled={!currentSubject && !initialSubject}
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
                            <Slider
                                value={depth}
                                onChange={handleDepthChange}
                                onChangeEnd={handleDepthCommit}
                                min={1}
                                max={4}
                                step={1}
                                marks={[
                                    { value: 1, label: '1' },
                                    { value: 2, label: '2' },
                                    { value: 3, label: '3' },
                                    { value: 4, label: '4' }
                                ]}
                            />
                        </Stack>
                    </Grid.Col>
                </Grid>
            </Paper>

            {/* Legend */}
            <Group mb="md" gap="lg">
                <Group gap="xs">
                    <ThemeIcon size="sm" color={nodeColors.root} radius="xl"><IconCircle size={10} /></ThemeIcon>
                    <Text size="sm">Selected Class</Text>
                </Group>
                <Group gap="xs">
                    <ThemeIcon size="sm" color={nodeColors.prerequisite} radius="xl"><IconCircle size={10} /></ThemeIcon>
                    <Text size="sm">Prerequisites</Text>
                </Group>
                <Group gap="xs">
                    <ThemeIcon size="sm" color={nodeColors.corequisite} radius="xl"><IconCircle size={10} /></ThemeIcon>
                    <Text size="sm">Corequisites</Text>
                </Group>
                <Group gap="xs">
                    <ThemeIcon size="sm" color={nodeColors.requiredBy} radius="xl"><IconCircle size={10} /></ThemeIcon>
                    <Text size="sm">Classes That Need This</Text>
                </Group>
            </Group>

            {/* Graph Visualization */}
            <Paper shadow="sm" withBorder style={{ height: 600, position: 'relative', overflow: 'hidden' }}>
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
                            height={600}
                            nodeLabel={(node: any) => `${node.name || node.id}${node.data?.subjectTitle ? `: ${node.data.subjectTitle}` : ''}`}
                            nodeColor={(node: any) => nodeColors[node.data?.type || 'root']}
                            nodeVal={(node: any) => node.data?.type === 'root' ? 10 : 8}
                            nodeRelSize={4}
                            linkColor={(link: any) => link.color || '#888'}
                            linkWidth={2}
                            linkDirectionalArrowLength={6}
                            linkDirectionalArrowRelPos={1}
                            linkDirectionalParticles={2}
                            linkDirectionalParticleSpeed={0.01}
                            linkCurvature={(link: any) => link.curvature || 0}
                            onNodeClick={handleNodeClick}
                            onNodeRightClick={handleNodeRightClick}
                            onNodeDoubleClick={(node: any) => handleNodeDoubleClick(node)}
                            onNodeDrag={(node: any) => {
                                // Fix position while dragging
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
                                return node.data?.type === 'root' ? -1800 : -800
                            }}
                            d3ForceLinkDistance={(link: any) => {
                                // Link distance
                                const sourceId = typeof link.source === 'string' ? link.source : link.source.id
                                const targetId = typeof link.target === 'string' ? link.target : link.target.id
                                const sourceNode = graphData.nodes.find((n: any) => n.id === sourceId)
                                const targetNode = graphData.nodes.find((n: any) => n.id === targetId)
                                const sourceIsRoot = sourceNode?.data?.type === 'root'
                                const targetIsRoot = targetNode?.data?.type === 'root'

                                // Increase distance for exploded nodes
                                if (explodedNode && (sourceId === explodedNode || targetId === explodedNode)) {
                                    return 900
                                }

                                // Longer distance for root connections
                                if (sourceIsRoot || targetIsRoot) {
                                    return 500
                                }
                                // Base link distance
                                return 400
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
                                {loading ? 'Loading graph...' : 'Search for a class to explore its prerequisites'}
                            </Text>
                            {loading && <Loader />}
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
                                <Badge color={nodeColors[selectedNode.data?.type || 'root']}>
                                    {selectedNode.data?.type?.replace('requiredBy', 'Requires This') || 'Selected'}
                                </Badge>
                                <Title order={4}>{selectedNode.id}</Title>
                            </Group>
                            <Text>{selectedNode.data?.subjectTitle}</Text>
                            <Text size="sm" c="dimmed">Department: {selectedNode.data?.department}</Text>
                        </div>
                        <Group>
                            <Tooltip label="View class page">
                                <Button
                                    variant="light"
                                    size="sm"
                                    onClick={() => router.push(`/classes/aggregate/${selectedNode.id}`)}
                                >
                                    View Class <IconArrowRight size={14} style={{ marginLeft: 4 }} />
                                </Button>
                            </Tooltip>
                            <Tooltip label="Center graph on this class">
                                <ActionIcon
                                    variant="light"
                                    size="lg"
                                    onClick={() => handleNodeDoubleClick(selectedNode)}
                                >
                                    <IconRefresh size={18} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>
                </Card>
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
    const user = await User.findOne({ email: session.user?.email?.toLowerCase() }).lean() as any
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

    const { subject } = context.query

    return {
        props: {
            initialSubject: typeof subject === 'string' ? subject : null
        }
    }
}

export default PrereqGraphPage
