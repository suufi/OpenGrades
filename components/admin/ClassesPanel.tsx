import React, { useEffect, useMemo, useState } from 'react'

import {
    ActionIcon, Badge, Button, Checkbox, Drawer, Group, Indicator, List, Menu, Modal,
    MultiSelect, Paper, Popover, Select, Stack, Switch, Text, TextInput, Tooltip
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { openConfirmModal } from '@mantine/modals'
import { notifications, showNotification } from '@mantine/notifications'
import { DataTable } from 'mantine-datatable'
import 'mantine-datatable/styles.css'
import { IconAdjustmentsHorizontal, IconColumns3, IconDownload, IconEyeOff, IconPencil, IconSearch, IconX } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'

import { IClass } from '@/types'
import { MIT_DEPARTMENT_OPTIONS as departments } from '@/utils/departments'
import { isMitTermCode } from '@/utils/formatTerm'

import { adminQueryKeys, useCatalogCounts } from './adminHealth'
import { EditClassForm } from './EditClassForm'

const COLUMN_OPTIONS = [
    { value: 'display', label: 'Hidden marker' },
    { value: 'term', label: 'Term' },
    { value: 'subjectNumber', label: 'Subject' },
    { value: 'aliases', label: 'Aliases' },
    { value: 'subjectTitle', label: 'Title' },
    { value: 'instructors', label: 'Instructors' },
    { value: 'createdAt', label: 'Created' },
    { value: 'updatedAt', label: 'Updated' },
    { value: 'warehouseSyncedAt', label: 'Warehouse' },
    { value: 'actions', label: 'Edit action' },
]

const DEFAULT_COLUMNS = ['display', 'term', 'subjectNumber', 'aliases', 'subjectTitle', 'instructors', 'warehouseSyncedAt', 'actions']

const EMPTY_FILTERS = {
    term: '',
    subjectNumber: '',
    subjectTitle: '',
    warehouseSynced: '',
}

type ColumnFilters = typeof EMPTY_FILTERS

function formatDate(value?: string | Date | null) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit'
    })
}

/** The "Sync from catalog" drawer: pulls a term's departments from the MIT subjects API. */
function CatalogSyncDrawer({
    opened,
    onClose,
    onSynced,
}: {
    opened: boolean
    onClose: () => void
    onSynced: () => void
}) {
    const [term, setTerm] = useState('')
    const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
    const [reviewable, setReviewable] = useState(false)
    const [fetching, setFetching] = useState(false)

    const countsQuery = useCatalogCounts()
    const normalizedTerm = term.trim().toUpperCase()

    const syncedCountsForTerm = useMemo(() => {
        const map = new Map<string, number>()
        countsQuery.data?.find(t => t.term === normalizedTerm)?.departments
            .forEach(d => map.set(d.department, d.classCount))
        return map
    }, [countsQuery.data, normalizedTerm])

    const departmentOptions = useMemo(() => {
        if (!isMitTermCode(normalizedTerm)) return departments
        return departments.map(({ value, label }) => {
            const count = syncedCountsForTerm.get(value) ?? 0
            return { value, label: `${label} · ${count > 0 ? `${count} synced` : 'not synced'}` }
        })
    }, [normalizedTerm, syncedCountsForTerm])

    const fetchClasses = async () => {
        setFetching(true)
        let notificationId: string | undefined

        try {
            const response = await fetch('/api/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ term, selectedDepartments, reviewable })
            })

            if (!response.ok) {
                const body = await response.json()
                showNotification({ title: 'Sync failed', message: body.message, color: 'red' })
                setFetching(false)
                return
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) throw new Error('No reader available')

            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (line.trim() === '') continue

                    try {
                        const data = JSON.parse(line)

                        if (data.type === 'progress') {
                            const timeRemaining = data.estimatedTimeRemaining > 0
                                ? ` (~${data.estimatedTimeRemaining}s remaining)`
                                : ''
                            const classInfo = data.classCount !== undefined
                                ? ` - ${data.classCount} classes`
                                : ''
                            const payload = {
                                title: `Syncing classes (${data.percentage}%)`,
                                message: `(${data.current}/${data.total}) ${data.department}${classInfo}${timeRemaining}`,
                                loading: true,
                                autoClose: false as const,
                                withCloseButton: false
                            }
                            if (notificationId) {
                                notifications.update({ id: notificationId, ...payload })
                            } else {
                                notificationId = `fetch-${Date.now()}`
                                notifications.show({ id: notificationId, ...payload })
                            }
                        } else if (data.type === 'departmentError') {
                            notifications.show({
                                title: `Error syncing ${data.department}`,
                                message: data.error,
                                color: 'orange',
                                autoClose: 8000
                            })
                        } else if (data.type === 'complete') {
                            const failedInfo = data.failedDepartments?.length > 0
                                ? ` Failed: ${data.failedDepartments.join(', ')}.`
                                : ''
                            const durationInfo = data.totalDuration ? ` Completed in ${data.totalDuration}s.` : ''

                            if (notificationId) {
                                notifications.update({
                                    id: notificationId,
                                    title: data.failedDepartments?.length > 0 ? 'Partially complete' : 'Sync complete',
                                    message: `Created ${data.newClasses} classes. Updated ${data.updatedClasses} classes.${durationInfo}${failedInfo}`,
                                    color: data.failedDepartments?.length > 0 ? 'yellow' : 'green',
                                    loading: false,
                                    autoClose: 5000
                                })
                            }
                            if (data.newClasses > 0 || data.updatedClasses > 0) {
                                notifications.show({
                                    title: 'Warehouse enrichment needed',
                                    message: `New ${term} docs lack registrar data (units, level, seasons, schedules). From a machine with Data Warehouse access run: node scripts/warehouse-extract.cjs --terms ${term}, then npx tsx scripts/sync-warehouse.ts --terms ${term}. The sync also auto-hides safe duplicate docs.`,
                                    color: 'yellow',
                                    autoClose: false
                                })
                            }
                        } else if (data.type === 'error') {
                            if (notificationId) {
                                notifications.update({
                                    id: notificationId,
                                    title: 'Sync failed',
                                    message: data.message,
                                    color: 'red',
                                    loading: false,
                                    autoClose: 5000
                                })
                            }
                        }
                    } catch (e) {
                        console.error('Failed to parse line:', line, e)
                    }
                }
            }

            onSynced()
        } catch (error) {
            console.error('Error:', error)
            showNotification({
                title: 'Sync failed',
                message: error instanceof Error ? error.message : 'An error occurred',
                color: 'red'
            })
        } finally {
            setFetching(false)
        }
    }

    return (
        <Drawer
            opened={opened}
            onClose={() => !fetching && onClose()}
            title={<Text fw={600}>Sync from catalog</Text>}
            position="right"
            size="md"
            padding="lg"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Pull a term's subject listings from the MIT catalog into OpenGrades. Already-synced
                    departments are updated in place.
                </Text>
                <TextInput
                    label="Term"
                    placeholder="e.g. 2026FA"
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    error={term !== '' && !isMitTermCode(normalizedTerm) ? 'Use a term code like 2026FA' : undefined}
                />
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" fw={500}>Departments</Text>
                        <Group gap="xs">
                            <Button size="compact-xs" variant="light" onClick={() => setSelectedDepartments(departments.map(d => d.value))}>
                                All
                            </Button>
                            <Button
                                size="compact-xs"
                                variant="light"
                                color="orange"
                                disabled={!isMitTermCode(normalizedTerm)}
                                onClick={() => setSelectedDepartments(
                                    departments
                                        .filter(d => (syncedCountsForTerm.get(d.value) ?? 0) === 0)
                                        .map(d => d.value)
                                )}
                            >
                                Unsynced
                            </Button>
                            <Button size="compact-xs" variant="light" color="red" onClick={() => setSelectedDepartments([])}>
                                None
                            </Button>
                        </Group>
                    </Group>
                    <MultiSelect
                        data={departmentOptions}
                        value={selectedDepartments}
                        onChange={setSelectedDepartments}
                        placeholder={selectedDepartments.length === 0 ? 'Select departments…' : undefined}
                        searchable
                        clearable
                    />
                </Stack>
                <Switch
                    label="Mark synced classes as reviewable"
                    checked={reviewable}
                    onChange={(event) => setReviewable(event.target.checked)}
                />
                <Button
                    leftSection={<IconDownload size={16} />}
                    onClick={fetchClasses}
                    disabled={term === '' || selectedDepartments.length === 0}
                    loading={fetching}
                >
                    Sync {selectedDepartments.length > 0 ? `${selectedDepartments.length} department${selectedDepartments.length === 1 ? '' : 's'}` : 'classes'}
                </Button>
            </Stack>
        </Drawer>
    )
}

export function ClassesPanel() {
    const queryClient = useQueryClient()

    const [loading, setLoading] = useState(false)
    const [classes, setClasses] = useState<IClass[]>([])
    const [totalRecords, setTotalRecords] = useState(0)
    const [page, setPage] = useState(1)
    const [rows, setRows] = useState(10)
    const [sortField, setSortField] = useState<string | null>(null)
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null)

    const [searchInput, setSearchInput] = useState('')
    const [debouncedSearch] = useDebouncedValue(searchInput, 300)
    const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS)

    const [selectedClasses, setSelectedClasses] = useState<IClass[]>([])
    const [bulkWorking, setBulkWorking] = useState(false)
    const [editingClass, setEditingClass] = useState<IClass | null>(null)
    const [editSaving, setEditSaving] = useState(false)

    const [shownColumns, setShownColumns] = useState<string[]>(DEFAULT_COLUMNS)
    const [filtersOpened, setFiltersOpened] = useState(false)
    const [syncOpened, setSyncOpened] = useState(false)

    const activeFilterCount = Object.values(filters).filter(v => v.trim() !== '').length

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, filters])

    useEffect(() => {
        loadClasses()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, rows, sortField, sortOrder, debouncedSearch, filters])

    const loadClasses = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/classes?' + new URLSearchParams({
                page: String(page),
                limit: String(rows),
                sortField: sortField || '',
                sortOrder: String(sortOrder || ''),
                search: debouncedSearch,
                ...filters,
            }))
            const result = await response.json()

            if (result.success) {
                setTotalRecords(result.meta?.totalClasses ?? 0)
                setClasses(Array.isArray(result.data) ? result.data : [])
            } else {
                showNotification({ title: 'Failed to load classes', message: result.message, color: 'red' })
            }
        } catch (error) {
            showNotification({
                title: 'Failed to load classes',
                message: error instanceof Error ? error.message : 'Network error',
                color: 'red'
            })
        } finally {
            setLoading(false)
        }
    }

    const refreshAfterCatalogChange = () => {
        loadClasses()
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.catalogCounts })
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.twins })
    }

    const clearFilters = () => {
        setSearchInput('')
        setFilters(EMPTY_FILTERS)
    }

    const saveEditedClass = async (payload: { subjectTitle?: string; instructors?: string[]; aliases?: string[]; description?: string; display?: boolean }) => {
        if (!editingClass?._id) return
        setEditSaving(true)
        try {
            const res = await fetch(`/api/classes/${editingClass._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const data = await res.json()
            if (!res.ok) {
                showNotification({ title: 'Save failed', message: data.message || 'Failed to update', color: 'red' })
                return
            }
            setClasses(prev => prev.map(c => (c._id === editingClass._id ? { ...c, ...data.data } : c)))
            showNotification({ title: 'Saved', message: 'Class updated.', color: 'green' })
            setEditingClass(null)
        } catch (e) {
            showNotification({ title: 'Save failed', message: e instanceof Error ? e.message : 'Failed to update', color: 'red' })
        } finally {
            setEditSaving(false)
        }
    }

    const confirmBulk = (mode: 'delete' | 'toggle') => openConfirmModal({
        title: mode === 'delete' ? 'Delete classes' : 'Toggle visibility',
        children: (
            <Text size="sm" component="div">
                {mode === 'delete'
                    ? 'The following classes will be permanently deleted:'
                    : 'Visibility will be flipped for the following classes:'}
                <List size="sm" mt="xs">
                    {selectedClasses.map((classEntry) => (
                        <List.Item key={classEntry._id}>
                            ({classEntry.term}) {classEntry.subjectNumber} - {classEntry.subjectTitle}
                        </List.Item>
                    ))}
                </List>
            </Text>
        ),
        labels: { confirm: mode === 'delete' ? 'Delete' : 'Toggle visibility', cancel: 'Cancel' },
        confirmProps: { color: mode === 'delete' ? 'red' : 'violet' },
        onConfirm: () => (mode === 'delete' ? deleteSelected() : toggleSelectedVisibility())
    })

    const deleteSelected = async () => {
        setBulkWorking(true)
        try {
            const res = await fetch('/api/classes', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classes: selectedClasses.map((c) => c._id) })
            })
            const body = await res.json()
            if (res.ok) {
                showNotification({ title: 'Deleted', message: `Deleted ${body.data.deletedCount} classes`, color: 'green' })
                setSelectedClasses([])
                refreshAfterCatalogChange()
            } else {
                showNotification({ title: 'Delete failed', message: body.message, color: 'red' })
            }
        } catch (e) {
            showNotification({ title: 'Delete failed', message: e instanceof Error ? e.message : 'Network error', color: 'red' })
        } finally {
            setBulkWorking(false)
        }
    }

    const toggleSelectedVisibility = async () => {
        setBulkWorking(true)
        try {
            const res = await fetch('/api/classes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    classes: selectedClasses.map((c) => c._id),
                    display: selectedClasses.map((c) => !c.display)
                })
            })
            const body = await res.json()
            if (res.ok) {
                showNotification({
                    title: 'Visibility updated',
                    message: `Toggled ${body.data.updatedCount ?? body.data.deletedCount ?? 0} class visibilities`,
                    color: 'green'
                })
                setSelectedClasses([])
                refreshAfterCatalogChange()
            } else {
                showNotification({ title: 'Update failed', message: body.message, color: 'red' })
            }
        } catch (e) {
            showNotification({ title: 'Update failed', message: e instanceof Error ? e.message : 'Network error', color: 'red' })
        } finally {
            setBulkWorking(false)
        }
    }

    const allColumns = [
        {
            accessor: 'display', title: '', width: 48, render: (r: IClass) => (!r.display
                ? <Tooltip label="Hidden from the site"><IconEyeOff size={16} color="var(--mantine-color-red-6)" /></Tooltip>
                : null)
        },
        { accessor: 'term', title: 'Term', render: (r: IClass) => <Text size="sm" ff="monospace">{r.term}</Text> },
        { accessor: 'subjectNumber', title: 'Subject', sortable: true, render: (r: IClass) => <Text size="sm" fw={500}>{r.subjectNumber}</Text> },
        { accessor: 'aliases', title: 'Aliases', sortable: true, render: (r: IClass) => r.aliases?.map(alias => <Badge key={alias} size="sm" variant="light"> {alias} </Badge>) },
        { accessor: 'subjectTitle', title: 'Title' },
        { accessor: 'instructors', title: 'Instructors', render: (r: IClass) => r.instructors?.map(inst => <Badge key={inst} size="sm" variant="light"> {inst} </Badge>) },
        { accessor: 'createdAt', title: 'Created', sortable: true, render: (r: IClass) => formatDate(r.createdAt) },
        { accessor: 'updatedAt', title: 'Updated', sortable: true, render: (r: IClass) => formatDate(r.updatedAt) },
        {
            accessor: 'warehouseSyncedAt', title: 'Warehouse', sortable: true, render: (r: IClass) => (
                r.warehouseSyncedAt
                    ? <Badge color="green" variant="light" size="sm">{formatDate(r.warehouseSyncedAt)}</Badge>
                    : <Badge color="gray" variant="light" size="sm">not synced</Badge>
            )
        },
        {
            accessor: 'actions', title: '', width: 56, render: (r: IClass) => (
                <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setEditingClass(r) }} aria-label="Edit class">
                    <IconPencil size={16} />
                </ActionIcon>
            )
        }
    ]
    const columns = allColumns.filter((col) => shownColumns.includes(col.accessor))

    return (
        <Stack gap="md">
            <Group gap="sm" wrap="wrap">
                <TextInput
                    style={{ flex: 1, minWidth: 220 }}
                    value={searchInput}
                    leftSection={<IconSearch size={16} />}
                    rightSection={searchInput !== '' && (
                        <ActionIcon size="sm" variant="subtle" c="dimmed" onClick={() => setSearchInput('')} aria-label="Clear search">
                            <IconX size={14} />
                        </ActionIcon>
                    )}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search all fields"
                />

                <Popover opened={filtersOpened} onChange={setFiltersOpened} position="bottom-end" width={320} trapFocus>
                    <Popover.Target>
                        <Indicator disabled={activeFilterCount === 0} label={activeFilterCount} size={16} color="brick">
                            <Button
                                variant="default"
                                leftSection={<IconAdjustmentsHorizontal size={16} />}
                                onClick={() => setFiltersOpened(o => !o)}
                            >
                                Filters
                            </Button>
                        </Indicator>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Stack gap="sm">
                            <TextInput
                                label="Term"
                                placeholder="e.g. 2026FA"
                                value={filters.term}
                                onChange={(e) => setFilters(f => ({ ...f, term: e.target.value }))}
                            />
                            <TextInput
                                label="Subject number"
                                placeholder="e.g. 6.006"
                                value={filters.subjectNumber}
                                onChange={(e) => setFilters(f => ({ ...f, subjectNumber: e.target.value }))}
                            />
                            <TextInput
                                label="Title contains"
                                placeholder="Filter by title"
                                value={filters.subjectTitle}
                                onChange={(e) => setFilters(f => ({ ...f, subjectTitle: e.target.value }))}
                            />
                            <Select
                                label="Warehouse sync"
                                data={[
                                    { value: '', label: 'Any' },
                                    { value: 'true', label: 'Synced' },
                                    { value: 'false', label: 'Not synced' },
                                ]}
                                value={filters.warehouseSynced}
                                onChange={(value) => setFilters(f => ({ ...f, warehouseSynced: value ?? '' }))}
                            />
                            <Group justify="space-between">
                                <Button variant="subtle" size="xs" disabled={activeFilterCount === 0 && searchInput === ''} onClick={clearFilters}>
                                    Clear all
                                </Button>
                                <Button size="xs" onClick={() => setFiltersOpened(false)}>Done</Button>
                            </Group>
                        </Stack>
                    </Popover.Dropdown>
                </Popover>

                <Menu closeOnItemClick={false} position="bottom-end" width={200}>
                    <Menu.Target>
                        <Button variant="default" leftSection={<IconColumns3 size={16} />}>Columns</Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {COLUMN_OPTIONS.map((col) => (
                            <Menu.Item
                                key={col.value}
                                onClick={() => setShownColumns((prev) =>
                                    prev.includes(col.value) ? prev.filter(v => v !== col.value) : [...prev, col.value]
                                )}
                            >
                                <Checkbox
                                    label={col.label}
                                    size="xs"
                                    checked={shownColumns.includes(col.value)}
                                    onChange={() => { }}
                                    tabIndex={-1}
                                    styles={{ input: { cursor: 'pointer' }, label: { cursor: 'pointer' } }}
                                />
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>

                <Button leftSection={<IconDownload size={16} />} onClick={() => setSyncOpened(true)}>
                    Sync from catalog
                </Button>
            </Group>

            {selectedClasses.length > 0 && (
                <Paper p="xs" px="md" radius="md" withBorder bg="var(--mantine-color-default-hover)">
                    <Group justify="space-between" wrap="wrap">
                        <Text size="sm" fw={500}>
                            {selectedClasses.length} class{selectedClasses.length === 1 ? '' : 'es'} selected
                        </Text>
                        <Group gap="xs">
                            <Button variant="subtle" size="xs" onClick={() => setSelectedClasses([])}>
                                Clear selection
                            </Button>
                            <Button variant="light" color="violet" size="xs" loading={bulkWorking} onClick={() => confirmBulk('toggle')}>
                                Toggle visibility
                            </Button>
                            <Button variant="light" color="red" size="xs" loading={bulkWorking} onClick={() => confirmBulk('delete')}>
                                Delete
                            </Button>
                        </Group>
                    </Group>
                </Paper>
            )}

            <DataTable
                storeColumnsKey="settings-v2-classes-table"
                idAccessor="_id"
                records={classes}
                columns={columns}
                fetching={loading}
                selectedRecords={selectedClasses}
                onSelectedRecordsChange={setSelectedClasses}
                sortStatus={{ columnAccessor: sortField || 'subjectNumber', direction: sortOrder === 'asc' ? 'asc' : 'desc' }}
                onSortStatusChange={(status) => {
                    setSortField(status.columnAccessor as string)
                    setSortOrder(status.direction)
                    setPage(1)
                }}
                page={page}
                onPageChange={setPage}
                totalRecords={totalRecords}
                recordsPerPage={rows}
                onRecordsPerPageChange={(n) => { setRows(n); setPage(1) }}
                recordsPerPageOptions={[10, 25, 50]}
                paginationWithEdges
                paginationWithControls
                minHeight={300}
                noRecordsText={activeFilterCount > 0 || debouncedSearch !== '' ? 'No classes match the current filters' : 'No classes yet — sync a term from the catalog'}
            />

            <Modal
                title={editingClass ? `Edit ${editingClass.subjectNumber} (${editingClass.term})` : ''}
                opened={Boolean(editingClass)}
                onClose={() => !editSaving && setEditingClass(null)}
                size="lg"
            >
                {editingClass && (
                    <EditClassForm
                        classEntry={editingClass}
                        saving={editSaving}
                        onSave={saveEditedClass}
                        onCancel={() => setEditingClass(null)}
                    />
                )}
            </Modal>

            <CatalogSyncDrawer
                opened={syncOpened}
                onClose={() => setSyncOpened(false)}
                onSynced={() => {
                    clearFilters()
                    refreshAfterCatalogChange()
                }}
            />
        </Stack>
    )
}
