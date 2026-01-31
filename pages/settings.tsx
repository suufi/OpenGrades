import React, { useEffect, useState } from 'react'

import InferNextPropsType from 'infer-next-props-type'
import Head from 'next/head'

import { ActionIcon, Badge, Button, Center, Checkbox, Container, Grid, Group, List, Modal, MultiSelect, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core'
import { notifications, showNotification } from '@mantine/notifications'
import { DataTable } from 'mantine-datatable'
import 'mantine-datatable/styles.css'

import mongoConnection from '@/utils/mongoConnection'

import User from '@/models/User'
import { IClass, IUser } from '../types'

import { DonutChart } from '@mantine/charts'
import { openConfirmModal } from '@mantine/modals'
import { getServerSession } from 'next-auth'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { EyeOff, Pencil, Search } from 'tabler-icons-react'
// import { ClassManagementTable } from '../components/ClassManagementTable'
import { EmbeddingManagement } from '@/components/EmbeddingManagement'
import { DepartmentProgressTable } from '@/components/DepartmentProgressTable'
import authOptions from '@/pages/api/auth/[...nextauth]'
import { MIT_DEPARTMENT_OPTIONS as departments } from '@/utils/departments'

function EditClassForm({
  classEntry,
  saving,
  onSave,
  onCancel
}: {
  classEntry: IClass
  saving: boolean
  onSave: (payload: { subjectTitle?: string; instructors?: string[]; aliases?: string[]; description?: string; display?: boolean }) => Promise<void>
  onCancel: () => void
}) {
  const [subjectTitle, setSubjectTitle] = useState(classEntry.subjectTitle ?? '')
  const [instructorsText, setInstructorsText] = useState((classEntry.instructors ?? []).join('\n'))
  const [aliasesText, setAliasesText] = useState((classEntry.aliases ?? []).join('\n'))
  const [description, setDescription] = useState(classEntry.description ?? '')
  const [display, setDisplay] = useState(classEntry.display !== false)

  const handleSubmit = () => {
    const instructors = instructorsText.split('\n').map(s => s.trim()).filter(Boolean)
    const aliases = aliasesText.split('\n').map(s => s.trim()).filter(Boolean)
    onSave({ subjectTitle: subjectTitle.trim() || undefined, instructors, aliases, description: description.trim() || undefined, display })
  }

  return (
    <Stack gap="md">
      <TextInput label="Title" value={subjectTitle} onChange={e => setSubjectTitle(e.target.value)} placeholder="Subject title" />
      <Textarea label="Instructors (one per line)" value={instructorsText} onChange={e => setInstructorsText(e.target.value)} placeholder="One name per line" minRows={2} />
      <Textarea label="Aliases (one per line)" value={aliasesText} onChange={e => setAliasesText(e.target.value)} placeholder="e.g. 6.006, 18.410" minRows={2} />
      <Textarea label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Course description" minRows={4} />
      <Switch label="Display (visible on site)" checked={display} onChange={e => setDisplay(e.target.checked)} />
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSubmit} loading={saving}>Save</Button>
      </Group>
    </Stack>
  )
}

const Settings = ({ totalUsers, summaryByClassYear, summaryByLevel, activeUsers }: InferNextPropsType<typeof getServerSideProps>) => {
  const router = useRouter()
  const { data: session } = useSession()

  if (!session.user || session.user.trustLevel < 2) {
    return <Container>
      <Title>
        You're not supposed to be here!
      </Title>
    </Container>
  }

  const [loading, setLoading] = useState(false)
  const [totalRecords, setTotalRecords] = useState(0)
  const [lazyState, setLazyState] = useState({
    first: 0,
    rows: 10,
    page: 1,
    sortField: null,
    sortOrder: null,
    filters: {
      subjectNumber: { value: '', matchMode: 'contains' },
      subjectTitle: { value: '', matchMode: 'contains' },
      term: { value: '', matchMode: 'contains' },
    },
    globalFilter: ''
  })
  const [classes, setClasses] = useState([])

  useEffect(() => {
    loadLazyData()
  }, [lazyState])

  const loadLazyData = async () => {
    setLoading(true)

    try {
      const response = await fetch('/api/classes?' + new URLSearchParams({
        page: lazyState.page,
        limit: lazyState.rows,
        sortField: lazyState.sortField || '',
        sortOrder: lazyState.sortOrder || '',
        search: lazyState.globalFilter || '',
        ...Object.fromEntries(
          Object.entries(lazyState.filters).map(([key, value]) => [key, value.value])
        )
      }))

      const result = await response.json()

      if (result.success) {
        setTotalRecords(result.meta?.totalClasses ?? 0)
        setClasses(Array.isArray(result.data) ? result.data : [])
      } else {
        console.error('Failed to fetch data:', result.message)
      }
    } catch (error) {
      console.error('Error during data fetching:', error)
    } finally {
      setLoading(false)
    }
  }

  const onPageChange = (page: number) => {
    setLazyState(prev => ({ ...prev, page, first: (page - 1) * prev.rows }))
  }
  const onRecordsPerPageChange = (recordsPerPage: number) => {
    setLazyState(prev => ({ ...prev, rows: recordsPerPage, page: 1, first: 0 }))
  }
  const onSortStatusChange = (sortStatus: { columnAccessor: string; direction: 'asc' | 'desc' }) => {
    setLazyState(prev => ({
      ...prev,
      sortField: sortStatus.columnAccessor,
      sortOrder: sortStatus.direction,
      page: 1,
      first: 0
    }))
  }


  // const [classes, setClasses] = useState(classesProp)
  const [term, setTerm] = useState('')
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [reviewable, setReviewable] = useState(false)
  const [loadingButton, setLoadingButton] = useState(false)
  const [globalFilterValue, setGlobalFilterValue] = useState('')
  const [selectedClasses, setSelectedClasses] = useState([])
  const [editingClass, setEditingClass] = useState<IClass | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [shownColumns, setShownColumns] = useState([
    'display',
    'term',
    'subjectNumber',
    'aliases',
    'subjectTitle',
    'instructors',
    'actions'
  ])

  const onGlobalFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setGlobalFilterValue(value)

    setLazyState(prevState => ({
      ...prevState,
      globalFilter: value,
      first: 0,
      page: 1
    }))
  }

  const resetFilters = () => {
    setGlobalFilterValue('')
    setLazyState(prev => ({
      ...prev,
      globalFilter: '',
      filters: { subjectNumber: { value: '', matchMode: 'contains' }, subjectTitle: { value: '', matchMode: 'contains' }, term: { value: '', matchMode: 'contains' } },
      page: 1,
      first: 0
    }))
  }

  const onFilterChange = (key: 'term' | 'subjectNumber' | 'subjectTitle') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLazyState(prev => ({
      ...prev,
      filters: { ...prev.filters, [key]: { ...prev.filters[key], value } },
      page: 1,
      first: 0
    }))
  }

  const hasActiveFilters = Boolean(
    lazyState.globalFilter?.trim() ||
    lazyState.filters.term?.value?.trim() ||
    lazyState.filters.subjectNumber?.value?.trim() ||
    lazyState.filters.subjectTitle?.value?.trim()
  )

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
        showNotification({ title: 'Error', message: data.message || 'Failed to update', color: 'red' })
        return
      }
      setClasses(prev => Array.isArray(prev) ? prev.map(c => (c._id === editingClass._id ? { ...c, ...data.data } : c)) : [])
      showNotification({ title: 'Saved', message: 'Class updated.', color: 'green' })
      setEditingClass(null)
    } catch (e) {
      showNotification({ title: 'Error', message: e instanceof Error ? e.message : 'Failed to update', color: 'red' })
    } finally {
      setEditSaving(false)
    }
  }

  const fetchClasses = async () => {
    setLoadingButton(true)
    let notificationId: string | undefined

    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          term,
          selectedDepartments,
          reviewable
        })
      })

      if (!response.ok) {
        const body = await response.json()
        showNotification({
          title: 'Error fetching',
          message: body.message,
          color: 'red'
        })
        setLoadingButton(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No reader available')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim() === '') continue

          console.log('Received line:', line)

          try {
            const data = JSON.parse(line)
            console.log('Parsed data:', data)

            if (data.type === 'progress') {
              console.log('Showing/updating progress notification', notificationId)
              const timeRemaining = data.estimatedTimeRemaining > 0
                ? ` (~${data.estimatedTimeRemaining}s remaining)`
                : ''
              const classInfo = data.classCount !== undefined
                ? ` - ${data.classCount} classes`
                : ''

              if (notificationId) {
                notifications.update({
                  id: notificationId,
                  title: `Fetching Classes (${data.percentage}%)`,
                  message: `(${data.current}/${data.total}) ${data.department}${classInfo}${timeRemaining}`,
                  loading: true,
                  autoClose: false,
                  withCloseButton: false
                })
              } else {
                notificationId = `fetch-${Date.now()}`
                console.log('Creating notification with ID:', notificationId)
                notifications.show({
                  id: notificationId,
                  title: `Fetching Classes (${data.percentage}%)`,
                  message: `(${data.current}/${data.total}) ${data.department}${classInfo}${timeRemaining}`,
                  loading: true,
                  autoClose: false,
                  withCloseButton: false
                })
              }
            } else if (data.type === 'departmentError') {
              console.log('Department error:', data)
              notifications.show({
                title: `Error fetching ${data.department}`,
                message: data.error,
                color: 'orange',
                autoClose: 8000
              })
            } else if (data.type === 'complete') {
              console.log('Showing complete notification')
              const failedInfo = data.failedDepartments?.length > 0
                ? ` Failed: ${data.failedDepartments.join(', ')}.`
                : ''
              const durationInfo = data.totalDuration ? ` Completed in ${data.totalDuration}s.` : ''

              if (notificationId) {
                notifications.update({
                  id: notificationId,
                  title: data.failedDepartments?.length > 0 ? 'Partially Complete' : 'Success!',
                  message: `Created ${data.newClasses} classes. Updated ${data.updatedClasses} classes.${durationInfo}${failedInfo}`,
                  color: data.failedDepartments?.length > 0 ? 'yellow' : 'green',
                  loading: false,
                  autoClose: 5000
                })
              }
            } else if (data.type === 'error') {
              console.log('Showing error notification')
              if (notificationId) {
                notifications.update({
                  id: notificationId,
                  title: 'Error',
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

      loadLazyData()
      resetFilters()
    } catch (error) {
      console.error('Error:', error)
      showNotification({
        title: 'Error',
        message: error instanceof Error ? error.message : 'An error occurred',
        color: 'red'
      })
    } finally {
      setLoadingButton(false)
    }
  }

  const openDeleteModal = () => openConfirmModal({
    title: 'Delete Confirmation',
    children: (
      <Text size="sm">
        The following classes will be deleted:
        <List>
          {selectedClasses.map((classEntry: IClass) => (
            <List.Item key={classEntry._id}>
              ({classEntry.term}) {classEntry.subjectNumber} - {classEntry.subjectTitle}
            </List.Item>
          ))}
        </List>
      </Text>
    ),
    labels: { confirm: 'Confirm', cancel: 'Cancel' },
    onCancel: () => console.log('Cancel'),
    onConfirm: () => deleteSelectedClasses()
  })

  const deleteSelectedClasses = async () => {
    setLoadingButton(true)
    await fetch('/api/classes', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        classes: selectedClasses.map((classEntry: IClass) => classEntry._id)
      })
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Deleted ${body.data.deletedCount} classes`
        })
        setClasses(Array.isArray(body.data.classes) ? body.data.classes : [])
        setSelectedClasses([])
        resetFilters()
      } else {
        showNotification({
          title: 'Error deleting',
          message: body.message,
          color: 'red'
        })
      }
    })
    setLoadingButton(false)
  }

  const openHideModal = () => openConfirmModal({
    title: 'Hide Classes Confirmation',
    children: (
      <Text size="sm">
        The following classes will be hidden:
        <List>
          {selectedClasses.map((classEntry: IClass) => (
            <List.Item key={classEntry._id}>
              ({classEntry.term}) {classEntry.subjectNumber} - {classEntry.subjectTitle}
            </List.Item>
          ))}
        </List>
      </Text>
    ),
    labels: { confirm: 'Confirm', cancel: 'Cancel' },
    onCancel: () => console.log('Cancel'),
    onConfirm: () => hideSelectedClasses()
  })

  const hideSelectedClasses = async () => {
    setLoadingButton(true)
    await fetch('/api/classes', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        classes: selectedClasses.map((classEntry: IClass) => classEntry._id),
        display: selectedClasses.map((classEntry: IClass) => !classEntry.display)
      })
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Toggled ${body.data.updatedCount ?? body.data.deletedCount ?? 0} class visibilities`
        })
        setClasses(Array.isArray(body.data.classes) ? body.data.classes : [])
        setSelectedClasses([])
      } else {
        showNotification({
          title: 'Error toggling',
          message: body.message,
          color: 'red'
        })
      }
    })
    setLoadingButton(false)
  }

  const formatDate = (value: string | Date) => {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit'
    })
  }

  const allColumns = [
    { accessor: 'display', title: '', width: 48, render: (r: IClass) => (!r.display ? <EyeOff size={16} color="var(--mantine-color-red-6)" /> : null) },
    { accessor: 'term', title: 'Term' },
    { accessor: 'subjectNumber', title: 'Subject', sortable: true },
    { accessor: 'aliases', title: 'Aliases', sortable: true, render: (r: IClass) => r.aliases?.map(alias => <Badge key={alias} size="sm" variant="light"> {alias} </Badge>) },
    { accessor: 'subjectTitle', title: 'Title' },
    { accessor: 'instructors', title: 'Instructors', render: (r: IClass) => r.instructors?.map(inst => <Badge key={inst} size="sm" variant="light"> {inst} </Badge>) },
    { accessor: 'createdAt', title: 'Created', sortable: true, render: (r: IClass) => formatDate(r.createdAt) },
    { accessor: 'updatedAt', title: 'Updated', sortable: true, render: (r: IClass) => formatDate(r.updatedAt) },
    {
      accessor: 'actions', title: '', width: 56, render: (r: IClass) => (
        <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setEditingClass(r); }} aria-label="Edit class">
          <Pencil size={16} />
        </ActionIcon>
      )
    }
  ]
  const columns = React.useMemo(() => {
    const list = Array.isArray(shownColumns) ? shownColumns : []
    return allColumns.filter((col) => list.includes(col.accessor as string))
  }, [shownColumns])

  const footer = () => {
    return (
      <>
        <Stack>
          <Group justify='center'>
            <Button variant='filled' color='red' disabled={selectedClasses.length === 0} loading={loadingButton} onClick={openDeleteModal}> Delete Selected Classes </Button>
            <Button variant='filled' color='violet' disabled={selectedClasses.length === 0} loading={loadingButton} onClick={openHideModal}> Hide Selected Classes </Button>
          </Group>
          <Grid gutter={6} align={'flex-end'} justify='space-between'>
            <Grid.Col span={{ md: 3, xs: 4 }}>
              <TextInput label="Term" placeholder="2024FA" value={term} onChange={(event) => setTerm(event.target.value)} />
            </Grid.Col>
            <Grid.Col span={{ md: 9, xs: 8 }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>Departments</Text>
                  <Group gap="xs">
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => setSelectedDepartments(departments.map(d => d.value))}
                    >
                      Select All
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="red"
                      onClick={() => setSelectedDepartments([])}
                    >
                      Clear All
                    </Button>
                  </Group>
                </Group>
                <MultiSelect
                  data={departments}
                  value={selectedDepartments}
                  onChange={(val) => setSelectedDepartments(val)}
                  placeholder="Select departments..."
                  searchable
                  clearable
                />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ md: 5, xs: 4 }}>
              <Switch label="Reviewable" checked={reviewable} onChange={(event) => setReviewable(event.target.checked)} />
            </Grid.Col>
            <Grid.Col span={{ md: 2, xs: 12 }}>
              <Button onClick={() => fetchClasses()} disabled={term === '' || selectedDepartments.length === 0} loading={loadingButton}> Fetch Classes </Button>
            </Grid.Col>
          </Grid>
        </Stack>
      </>
    )
  }

  const header = () => {
    return (
      <>
        <Stack gap="sm">
          <Title order={3}> Class Management </Title>
          <TextInput value={globalFilterValue} leftSection={<Search size={20} />} onChange={onGlobalFilterChange} placeholder="Keyword search (all fields)" />
          <Grid>
            <Grid.Col span={{ base: 12, xs: 4 }}>
              <TextInput
                label="Term"
                placeholder="e.g. 2024FA"
                value={lazyState.filters?.term?.value ?? ''}
                onChange={onFilterChange('term')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, xs: 4 }}>
              <TextInput
                label="Subject number"
                placeholder="e.g. 6.006"
                value={lazyState.filters?.subjectNumber?.value ?? ''}
                onChange={onFilterChange('subjectNumber')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, xs: 4 }}>
              <TextInput
                label="Title contains"
                placeholder="Filter by title"
                value={lazyState.filters?.subjectTitle?.value ?? ''}
                onChange={onFilterChange('subjectTitle')}
              />
            </Grid.Col>
          </Grid>
          {hasActiveFilters && (
            <Button variant="light" size="xs" onClick={resetFilters}>Clear all filters</Button>
          )}
          <Checkbox.Group value={shownColumns} onChange={(val) => setShownColumns(Array.isArray(val) ? val : [])}>
            <Group mt="xs">
              <Checkbox value="display" label="Display" />
              <Checkbox value="term" label="Term" />
              <Checkbox value="subjectNumber" label="Subject" />
              <Checkbox value="aliases" label="Aliases" />
              <Checkbox value="subjectTitle" label="Title" />
              <Checkbox value="instructors" label="Instructors" />
              <Checkbox value="createdAt" label="Created" />
              <Checkbox value="updatedAt" label="Updated" />
              <Checkbox value="actions" label="Actions" />
            </Group>
          </Checkbox.Group>
        </Stack>
      </>
    )
  }

  const colors = ["indigo", "yellow", "cyan", "violet", "blue", "orange", "teal", "red", "green", "gray"]
  // const mappings = Object.entries(summaryByClassYear).map(([classYear, count], index) => ({
  //   value: count,
  //   color: `${colors[index]}.${index}`,
  //   name: classYear
  // }))

  return (
    <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
      <Head>
        <title>Settings | MIT OpenGrades</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <Stack>

        <Title>
          Settings
        </Title>

        <Title order={3}> User Management </Title>

        <Center>
          {
            summaryByLevel && (
              <DonutChart chartLabel={"Users by Level"} withLabelsLine labelsType="value" withLabels data={summaryByLevel.sort((a, b) => a._id - b._id).map(({ _id, count }, index) => (
                {
                  value: count,
                  color: `${colors[index]}.${index}`,
                  name: _id
                }
              ))} />
            )
          }

          {
            summaryByClassYear && (
              <DonutChart chartLabel={"Users by Year"} withLabelsLine labelsType="value" withLabels data={summaryByClassYear.sort((a, b) => a._id - b._id).map(({ _id, count }, index) => (
                {
                  value: count,
                  color: `${colors.reverse()[index]}.${index}`,
                  name: _id
                }
              ))} />
            )
          }

          {
            activeUsers && (
              <DonutChart chartLabel={"Active Users"} withLabels data={[
                { value: activeUsers, color: 'blue.7', name: 'Active Users' },
                { value: totalUsers - activeUsers, color: 'red.7', name: 'Inactive Users' }
              ]} />
            )
          }
        </Center>

        <Stack gap="md">
          {header()}
          <DataTable
            storeColumnsKey="settings-classes-table"
            idAccessor="_id"
            records={Array.isArray(classes) ? classes : []}
            columns={Array.isArray(columns) ? columns : []}
            fetching={loading}
            selectedRecords={Array.isArray(selectedClasses) ? selectedClasses : []}
            onSelectedRecordsChange={(v) => setSelectedClasses(Array.isArray(v) ? v : [])}
            sortStatus={{ columnAccessor: lazyState.sortField || 'subjectNumber', direction: lazyState.sortOrder === 'asc' ? 'asc' : 'desc' }}
            onSortStatusChange={onSortStatusChange}
            page={lazyState.page}
            onPageChange={onPageChange}
            totalRecords={totalRecords}
            recordsPerPage={lazyState.rows}
            onRecordsPerPageChange={onRecordsPerPageChange}
            recordsPerPageOptions={[10, 25, 50]}
            paginationWithEdges
            paginationWithControls
            minHeight={300}
            noRecordsText="No classes"
          />
          {footer()}
        </Stack>

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

        <DepartmentProgressTable />

        <EmbeddingManagement />
      </Stack>
    </Container>
  )
}

export async function getServerSideProps(context) {
  await mongoConnection()

  const users: IUser[] = await User.find({}).lean() as IUser[]

  const totalUsers = await User.countDocuments()

  const summaryByClassYear = await User.aggregate([
    {
      $match: {
        trustLevel: { $gt: 0 },
        verified: true
      }
    },
    {
      $group: {
        _id: "$classOf",
        count: { $sum: 1 }
      }
    }
  ])

  const summaryByLevel = await User.aggregate([
    {
      $match: {
        trustLevel: { $gt: 0 },
        verified: true
      }
    },
    {
      $group: {
        _id: "$year",
        count: { $sum: 1 }
      }
    }
  ])

  const activeUsers = await User.countDocuments({
    trustLevel: { $gt: 0 }
  })

  return {
    props: {
      session: JSON.parse(JSON.stringify(await getServerSession(
        context.req,
        context.res,
        authOptions
      ))),
      totalUsers,
      summaryByClassYear,
      summaryByLevel,
      activeUsers
    }
  }
}

export default Settings
