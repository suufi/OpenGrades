// @ts-nocheck

import React, { useContext, useEffect, useState } from 'react'

import InferNextPropsType from 'infer-next-props-type'
import Head from 'next/head'

import { Badge, Button, Checkbox, Container, Grid, Group, List, MultiSelect, Select, Stack, Table, Text, TextInput, Title, useMantineColorScheme } from '@mantine/core'
import { showNotification } from '@mantine/notifications'

import mongoConnection from '../utils/mongoConnection'

import Class from '../models/Class'
import { IClass } from '../types'

import { FilterMatchMode, FilterOperator, PrimeReactContext, PrimeReactProvider } from 'primereact/api'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'

import { Calendar } from '@mantine/dates'
import { openConfirmModal } from '@mantine/modals'
import { useRouter } from 'next/router'
import { EyeOff, Search } from 'tabler-icons-react'
// import { ClassManagementTable } from '../components/ClassManagementTable'


const courseCatalog = `1 - Civil and Environmental Engineering
2 - Mechanical Engineering
3 - Materials Science and Engineering
4 - Architecture
5 - Chemistry
6 - Electrical Engineering and Computer Science
7 - Biology
8 - Physics
9 - Brain and Cognitive Sciences
10 - Chemical Engineering
11 - Urban Studies and Planning
12 - Earth, Atmospheric, and Planetary Sciences
14 - Economics
15 - Management
16 - Aeronautics and Astronautics
17 - Political Science
18 - Mathematics
20 - Biological Engineering
21A - Anthropology
CMS - Comparative Media Studies
21W - Writing
21G - Global Languages
21H - History
21L - Literature
21M - Music and Theater Arts
WGS - Women's and Gender Studies
22 - Nuclear Science and Engineering
24 - Linguistics and Philosophy
CC - Concourse Program
CSB - Computational and Systems Biology
CSE - Center for Computational Science and Engineering
EC - Edgerton Center
EM - Engineering Management
ES - Experimental Study Group
HST - Health Sciences and Technology
IDS - Institute for Data, Systems and Society
MAS - Media Arts and Sciences
SCM - Supply Chain Management
AS - Aerospace Studies
MS - Military Science
NS - Naval Science
STS - Science, Technology, and Society
SWE - Engineering School-Wide Electives
SP - Special Programs
`

const departments = courseCatalog.split('\n').map(line => {
  const regex = /(.+?) - (.+)/g
  const matches = [...line.matchAll(regex)][0]

  if (matches && matches.index === 0) {
    return {
      value: matches[1],
      label: `${matches[2]} (${matches[1]})`
    }
  }

  return null
}).filter((department) => department !== null)

function DepartmentalTermGroupings () {
  const [groupedData, setGroupedData] = useState<DepartmentGroupingData[]>([])
  const [activeTerm, setActiveTerm] = useState<string | null>(null)

  useEffect(() => {
    // Fetch data from the count API endpoint
    const fetchGroupedData = async () => {
      try {
        const response = await fetch('/api/classes/count')
        const result = await response.json()

        if (result.success) {
          setGroupedData(result.data)
          if (result.data.length > 0) {
            setActiveTerm(result.data[0].term) // Set the default active term
          }
        }
      } catch (error) {
        console.error('Error fetching grouped data:', error)
      }
    }

    fetchGroupedData()
  }, [])

  // Filter the grouped data by the active term
  const activeTermData = groupedData.find(data => data.term === activeTerm)

  // Sort the department data according to the sorted `departments` list
  const sortedDepartments = departments.map(department => {
    const departmentData = activeTermData?.departments.find(
      d => d.department === department.value
    )
    return {
      department: department.value,
      classCount: departmentData?.classCount || 0,
      displayCount: departmentData?.displayCount || 0,
    }
  })

  return (
    <Stack>
      <Select
        allowDeselect={false}
        data={groupedData.map(data => ({ value: data.term, label: data.term }))}
        value={activeTerm}
        onChange={setActiveTerm}
        placeholder="Select a term"
      />
      <Table striped withTableBorder withColumnBorders withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th> Department </Table.Th>
            <Table.Th> Class Count </Table.Th>
            <Table.Th> Displayed Count </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedDepartments && sortedDepartments.map(({ department, classCount, displayCount }) => (
            <Table.Tr key={`${activeTerm}-${department}`}>
              <Table.Td> {department} </Table.Td>
              <Table.Td> {classCount} </Table.Td>
              <Table.Td> {displayCount} </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

const Settings = ({ classesProp }: InferNextPropsType<typeof getServerSideProps>) => {
  const { colorScheme } = useMantineColorScheme()
  const { changeTheme } = useContext(PrimeReactContext)

  const router = useRouter()

  // change theme when page is loaded
  useEffect(() => {
    // console.log("theme was changed to " + colorScheme)
    if (changeTheme) {
      changeTheme(`lara-${colorScheme == "dark" ? "light" : "dark"}-blue`, `lara-${colorScheme}-blue`, 'theme-link')
    }
  }, [colorScheme])

  const refreshData = () => {
    router.replace(router.asPath)
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
        setTotalRecords(result.meta.totalClasses)
        setClasses(result.data)
      } else {
        console.error('Failed to fetch data:', result.message)
      }
    } catch (error) {
      console.error('Error during data fetching:', error)
    } finally {
      setLoading(false)
    }
  }

  const onPage = (event) => {
    setLazyState(prevState => ({
      ...prevState,
      first: event.first,
      page: event.page + 1, // PrimeReact starts at 0, so add 1
      rows: event.rows
    }))
  }
  const onSort = (event) => {
    setLazyState(prevState => ({
      ...prevState,
      sortField: event.sortField,
      sortOrder: event.sortOrder
    }))
  }

  const onFilter = (event) => {
    setLazyState(prevState => ({
      ...prevState,
      filters: event.filters,
      first: 0,
      page: 1,

    }))
  }


  // const [classes, setClasses] = useState(classesProp)
  const [term, setTerm] = useState('')
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [loadingButton, setLoadingButton] = useState(false)
  const [globalFilterValue, setGlobalFilterValue] = useState('')
  const [selectedClasses, setSelectedClasses] = useState([])
  const [shownColumns, setShownColumns] = useState([
    'display',
    'term',
    'subjectNumber',
    'aliases',
    'subjectTitle',
    'instructors'
  ])

  const [filters, setFilters] = useState({
    global: { value: '', matchMode: FilterMatchMode.CONTAINS },
    hidden: { value: null, matchMode: FilterMatchMode.EQUALS },
    subjectNumber: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }] },
    aliases: { value: null, matchMode: FilterMatchMode.IN },
    title: { operator: FilterOperator.OR, constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }] },
    instructors: { operator: FilterOperator.OR, constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }] },
    createdAt: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }] },
    updatedAt: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }] }
  })

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

  const dateFilterTemplate = (options: any) => {
    return <Calendar date={options.value} onChange={(date) => options.filterCallback(date, options.index)} />
  }

  const resetFilters = () => {
    setFilters({
      global: { value: '', matchMode: FilterMatchMode.CONTAINS },
      hidden: { value: null, matchMode: FilterMatchMode.EQUALS },
      subjectNumber: { operator: FilterOperator.OR, constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }] },
      aliases: { value: null, matchMode: FilterMatchMode.IN },
      title: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }] },
      instructors: { operator: FilterOperator.OR, constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }] },
      createdAt: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }] },
      updatedAt: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }] }
    })
    setGlobalFilterValue('')
  }

  const fetchClasses = async () => {
    setLoadingButton(true)
    await fetch('/api/classes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        term,
        selectedDepartments
      })
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Created ${body.data.newClasses} classes`
        })
        setClasses(body.data.classes)
        resetFilters()
      } else {
        showNotification({
          title: 'Error fetching',
          message: body.message,
          color: 'red'
        })
      }
    })
    setLoadingButton(false)
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
        setClasses(body.data.classes)
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
          message: `Toggled ${body.data.deletedCount} class visibilities`
        })
        setClasses(body.data.classes)
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

  const columns = [

    { field: 'display', headerStyle: { width: '3em' }, body: (rowData: IClass) => (!rowData.display ? <EyeOff color='red' /> : '') },
    { field: 'term', header: 'Term' },
    { field: 'subjectNumber', header: 'Subject', sortable: true },
    { field: 'aliases', header: 'Aliases', sortable: true, body: (rowData: IClass) => rowData.aliases?.map(alias => <Badge key={alias}> {alias} </Badge>) },
    { field: 'subjectTitle', header: 'Title' },
    { field: 'instructors', header: 'Instructors', body: (rowData: IClass) => rowData.instructors?.map(instructor => <Badge key={instructor}> {instructor} </Badge>) },
    { field: 'createdAt', excludeGlobalFilter: true, header: 'Created', sortable: true, filterElement: dateFilterTemplate },
    { field: 'updatedAt', excludeGlobalFilter: true, header: 'Updated', sortable: true, filterElement: dateFilterTemplate }
  ].filter((column) => shownColumns.includes(column.field))

  const dynamicColumns = columns.map((col, i) => {
    return <Column key={col.field} {...col} />
    // return <Column bodyClassName={StyleClasses.columnBody} key={col.field} {...col} />
  })

  const formatDate = (value: Date) => {
    return value.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit'
    })
  }

  const dateBodyTemplate = (rowData: any) => {
    return formatDate(rowData.date)
  }

  const footer = () => {
    return (
      <>
        <Stack>
          <Group justify='center'>
            <Button variant='filled' color='red' disabled={selectedClasses.length === 0} loading={loadingButton} onClick={openDeleteModal}> Delete Selected Classes </Button>
            <Button variant='filled' color='violet' disabled={selectedClasses.length === 0} loading={loadingButton} onClick={openHideModal}> Hide Selected Classes </Button>
          </Group>
          <Grid gutter={6} align={'flex-end'} justify='center'>
            <Grid.Col span={{ md: 3, xs: 4 }}>
              <TextInput label="Term" placeholder="2022FA" value={term} onChange={(event) => setTerm(event.target.value)} />
            </Grid.Col>
            <Grid.Col span={{ md: 6, xs: 4 }}>
              <MultiSelect data={departments} label="Departments" value={selectedDepartments} onChange={(val) => setSelectedDepartments(val)} />
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
        <Stack>
          <Title order={3}> Class Management </Title>
          <TextInput value={globalFilterValue} leftSection={<Search size={20} />} onChange={onGlobalFilterChange} placeholder="Keyword Search" />
          <Checkbox.Group value={shownColumns} onChange={setShownColumns}>
            <Group mt="sm">
              <Checkbox value="display" label="Display" />
              <Checkbox value="term" label="Term" />
              <Checkbox value="subjectNumber" label="Subject Number" />
              <Checkbox value="aliases" label="Aliases" />
              <Checkbox value="subjectTitle" label="Title" />
              <Checkbox value="instructors" label="Instructors" />
              <Checkbox value="createdAt" label="Created At" />
              <Checkbox value="updatedAt" label="Updated At" />
            </Group>
          </Checkbox.Group>
        </Stack>
      </>
    )
  }

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

        <DataTable
          // className={StyleClasses.table}
          header={header}
          footer={footer}
          value={classes}
          filterDisplay='menu'
          globalFilterFields={['subjectNumber', 'aliases', 'title', 'instructors', 'createdAt', 'updatedAt']}
          scrollable
          paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
          rowsPerPageOptions={[10, 25, 50]}
          showGridlines
          paginator
          reorderableColumns
          removableSort
          lazy

          dataKey="id"
          first={lazyState.first}
          rows={lazyState.rows}
          totalRecords={totalRecords}
          onPage={onPage}
          onSort={onSort}
          onFilter={onFilter}
          sortField={lazyState.sortField}
          sortOrder={lazyState.sortOrder}
          filters={lazyState.filters}
          loading={loading}
          selectionMode="multiple"
          selection={selectedClasses}
          onSelectionChange={(e) => setSelectedClasses(e.value)}


        >
          <Column selectionMode="multiple" headerStyle={{ width: '3em' }} />
          {dynamicColumns}
          {/* <Column field="name" header="Name" /> */}
          {/* <Column field="value" header="Value" /> */}

        </DataTable>

        {/* <ClassManagementTable /> */}
        {/* <DataTable
          className={StyleClasses.table}
          tableClassName={StyleClasses.table}
          header={header}
          footer={footer}
          value={classes}
          filters={filters}
          filterDisplay='menu'
          globalFilterFields={['subjectNumber', 'aliases', 'title', 'instructors', 'createdAt', 'updatedAt']}
          rows={10}
          paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
          rowsPerPageOptions={[10, 25, 50]}
          responsiveLayout="scroll"
          showGridlines
          reorderableColumns
          selection={selectedClasses}
          onSelectionChange={e => setSelectedClasses(e.value)}
          removableSort
          paginator
          style={{ backgroundColor: 'red' }}
        >
          <Column selectionMode='multiple' bodyClassName={StyleClasses.columnBody} headerStyle={{ width: '3em' }} />
          {dynamicColumns}
        </DataTable> */}

        <Title order={3}> Department Listings (Grouped) </Title>
        <DepartmentalTermGroupings classes={classes} />
      </Stack>
    </Container>
  )
}

export async function getServerSideProps () {
  await mongoConnection()

  const classesProp: IClass[] = await Class.find({}).lean() as IClass[]

  return {
    props: {
      classesProp: JSON.parse(JSON.stringify(classesProp))
    }
  }
}

const SettingsWrapper = ({ classesProp }: InferNextPropsType<typeof getServerSideProps>) => {
  return (
    <PrimeReactProvider>
      <Settings classesProp={classesProp} />
    </PrimeReactProvider>
  )
}

export default SettingsWrapper
