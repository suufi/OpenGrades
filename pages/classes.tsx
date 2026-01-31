import type { NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

import { Alert, Badge, Box, Card, Center, Checkbox, Code, Collapse, Container, Divider, Flex, Grid, Group, List, Loader, LoadingOverlay, Mark, MultiSelect, Pagination, Select, Space, Stack, Switch, Text, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core'


import { IClass } from '../types'

import { useDebouncedValue, useDisclosure, useHotkeys, useToggle } from '@mantine/hooks'

import { IconFile, IconGridPattern, IconList, IconSearch, IconUserCircle } from '@tabler/icons'
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'

import ClassesPageClasses from '../styles/ClassesPage.module.css'
const ClassButton = ({ _id, classReviewCount, contentSubmissionCount, subjectTitle, subjectNumber, aliases, instructors, term, academicYear, display, description, department, units, offered, reviewable, userCount, withDescription, searchTerm, highlight }: IClass & { classReviewCount: number, contentSubmissionCount: number, userCount: number, withDescription: boolean, searchTerm: string, highlight: object }) => {
  const router = useRouter()

  let formattedDescription = (
    <Text c="dimmed" size="sm"> {description} </Text>
  )

  let formattedInstructors = (
    <> {instructors.join(', ')} </>
  )

  const regex = /("[^"]+"|[^,| ]+)/g


  if (highlight) {

    function replaceHighlight (fullText: string, snippet: string) {
      const snippetSansMark = snippet.replace(/<\/?mark>/g, '')
      const i = fullText.toLowerCase().indexOf(snippetSansMark.toLowerCase())
      if (i < 0) return fullText

      const before = fullText.slice(0, i)
      const after = fullText.slice(i + snippetSansMark.length)
      const markedParts = snippet.split(/(<mark>.*?<\/mark>)/g).map((part, idx) => {
        if (part.startsWith('<mark>') && part.endsWith('</mark>')) {
          return <Mark key={idx}>{part.replace(/^<mark>|<\/mark>$/g, '')}</Mark>
        }
        return part
      })

      return (
        <>
          {before}
          {markedParts}
          {after}
        </>
      )
    }

    Object.entries(highlight).forEach(([field, snippets]) => {
      if (!Array.isArray(snippets)) return

      // For simplicity, just use the first snippet
      const snippet = snippets[0]
      if (field === 'description' && description) {
        formattedDescription = (
          <Text c="dimmed" size="sm">
            {replaceHighlight(description, snippet)}
          </Text>
        )
      }
      if (field === 'instructors' && instructors?.length) {
        const joined = instructors.join(', ')
        formattedInstructors = (
          <>
            {replaceHighlight(joined, snippet)}
          </>
        )
      }
    })
  }


  return (
    <Tooltip w={300} withArrow multiline label={description || 'No description provided.'}>
      <UnstyledButton onClick={() => router.push(`/classes/${_id}`)} className={ClassesPageClasses.ClassButton}>
        <Title order={5}>
          {`${subjectNumber}: ${subjectTitle}`}
        </Title>
        <Text c='dimmed' size='xs'> ({units.trim()}) </Text>
        <Space h="sm" />
        <Text c="dimmed" size="sm"> {`${Number(term.substring(0, 4)) - 1}-${term}`} - {formattedInstructors} {(aliases && aliases.length > 0) && `- AKA ${aliases?.join(', ')}`} </Text>
        <Space h="sm" />
        {withDescription && formattedDescription}

        <Space h="sm" />
        <Group justify={(classReviewCount || !offered || !reviewable) ? 'space-between' : 'flex-end'}>
          {
            (classReviewCount || !offered || !reviewable) && (
              <Flex align='left'>
                {!!classReviewCount && (<Badge size='sm' variant="filled">{classReviewCount} {classReviewCount === 1 ? 'Response' : 'Responses'}</Badge>)}
                {(!reviewable && offered) && <Badge variant='filled' color='red' size='sm'> Not Reviewable </Badge>}
                {!offered && <Badge variant='filled' color='red' size='sm'> Not Offered </Badge>}
              </Flex>
            )
          }
          <Flex justify={'flex-end'} align={'center'} gap={8}>
            {contentSubmissionCount > 0 && (
              <Flex align={'center'} gap={2}>
                <IconFile size={18} fontWeight={300} color='gray' />
                <Text c='dimmed' size='sm'>{contentSubmissionCount}</Text>
              </Flex>
            )}
            <Flex align={'center'} gap={2}>
              <IconUserCircle size={18} fontWeight={300} color='gray' />
              <Text c='dimmed' size='sm'>{userCount}</Text>
            </Flex>
          </Flex>
        </Group>
      </UnstyledButton>
    </Tooltip>
  )
}


interface ClassesProps {
  classesProp: IClass[]
  classReviewCountsProp: { _id: string, count: number }[]
}

const Classes: NextPage = () => {
  const router = useRouter()

  let initialState = {
    searchTerm: '',
    offeredFilter: true,
    reviewableFilter: false,
    reviewsOnlyFilter: false,
    academicYearFilter: [],
    departmentFilter: [],
    termFilter: [],
    communicationFilter: [],
    girFilter: [],
    hassFilter: [],
    currentPage: 1,
  }

  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem('classesPageState')
    if (saved) {
      const parsed = JSON.parse(saved)
      initialState = { ...initialState, ...parsed }
    }
  }


  const [searchTerm, setSearchTerm] = useState(initialState.searchTerm)
  const [debounced] = useDebouncedValue(searchTerm, 500, { leading: true })
  const [classes, setClasses] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [allDepartments, setAllDepartments] = useState([])

  const [offeredFilter, setOfferedFilter] = useState(initialState.offeredFilter)
  const [reviewableFilter, setReviewable] = useState(initialState.reviewableFilter)
  const [reviewsOnlyFilter, setReviewsOnlyFilter] = useState(initialState.reviewsOnlyFilter)
  const [academicYearFilter, setAcademicYearFilter] = useState<string[]>(initialState.academicYearFilter)
  const [departmentFilter, setDepartmentFilter] = useState<string[]>(initialState.departmentFilter)
  const [termFilter, setTermFilter] = useState<string[]>(initialState.termFilter)
  const [communicationFilter, setCommunicationFilter] = useState<string[]>(initialState.communicationFilter)
  const [girFilter, setGirFilter] = useState<string[]>(initialState.girFilter)
  const [hassFilter, setHassFilter] = useState<string[]>(initialState.hassFilter)

  const [currentPage, setCurrentPage] = useState(initialState.currentPage)
  const [totalPages, setTotalPages] = useState(1)
  const [totalClasses, setTotalClasses] = useState(0)
  const [timeForResults, setTimeForResults] = useState(0)

  const itemsPerPage = 21 // Set the number of items per page
  const [loading, setLoading] = useState(true)
  const [helpOpened, setHelpOpened] = useState(false)
  const [filtersOpened, { toggle: toggleFilterView }] = useDisclosure(false)
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState('relevance')
  const [viewMode, setViewMode] = useToggle(['grid', 'list'])

  // Update sessionStorage whenever state changes
  useEffect(() => {
    const state = {
      searchTerm,
      offeredFilter,
      reviewableFilter,
      reviewsOnlyFilter,
      academicYearFilter,
      departmentFilter,
      termFilter,
      communicationFilter,
      girFilter,
      hassFilter,
      currentPage,
    }
    sessionStorage.setItem('classesPageState', JSON.stringify(state))
  }, [searchTerm, offeredFilter, reviewableFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter, termFilter, communicationFilter, girFilter, hassFilter, currentPage])


  // useEffect(() => {
  //   if (router.query.searchTerm) {
  //     setSearchTerm(router.query.search as string)
  //   }
  // }, [router.query.searchTerm])

  // useEffect(() => {
  //   if (searchTerm) {
  //     router.push({
  //       pathname: router.pathname,
  //       query: { ...router.query, searchTerm },
  //     }, undefined, { shallow: true })
  //   } else {
  //     const { searchTerm, ...rest } = router.query
  //     router.push({
  //       pathname: router.pathname,
  //       query: rest,
  //     }, undefined, { shallow: true })
  //   }
  // }, [searchTerm])


  // useEffect(() => {
  //   setLoading(true)
  //   setPage(1)
  //   console.log('debounced', debounced)
  //   if (debounced !== "") {
  //     // let results = classesFuse.search(debounced).map(match => match.item)
  //     let results = minisearch.search(debounced, {
  //       boost: { subjectNumber: 2, subjectTitle: 1, aliases: 2 },
  //       fuzzy: false,
  //       prefix: function (term) {
  //         if (/[0-9.]/.test(term)) {
  //           return true
  //         }

  //         return false
  //       }
  //     }).map((result: { id: string }) => classesProp.filter((classEntry: IClass) => classEntry._id === result.id)[0])
  //     if (offeredFilter) {
  //       results = results.filter((c: IClass) => c.offered)
  //     }

  //     if (reviewsOnlyFilter) {
  //       results = results.filter((c: IClass) => classReviewCountsProp.map((classReviewCount: { _id: string, count: number }) => classReviewCount._id).includes(c._id))
  //     }

  //     if (academicYearFilter.length > 0 && academicYearFilter[0] !== '') {
  //       results = results.filter((c: IClass) => academicYearFilter.includes(c.academicYear.toString()))
  //     }
  //     console.log('departmentFilter', departmentFilter)
  //     if (departmentFilter.length > 0 && departmentFilter[0] !== '') {
  //       results = results.filter((c: IClass) => departmentFilter.includes(c.department))
  //     }

  //     if (termFilter.length > 0 && termFilter[0] !== '') {
  //       // obtain term from term (2022FA -> FA)
  //       results = results.filter((c: IClass) => termFilter.includes(c.term.substring(4)))
  //     }
  //     setClasses(results)
  //   }
  //   setLoading(false)
  // }, [debounced])

  // useEffect(() => {
  //   setLoading(true)
  //   let results = classesProp

  //   if (offeredFilter) {
  //     results = results.filter((c: IClass) => c.offered)
  //   }

  //   if (reviewsOnlyFilter) {
  //     results = results.filter((c: IClass) => classReviewCountsProp.map((classReviewCount: { _id: string, count: number }) => classReviewCount._id).includes(c._id))
  //   }

  //   if (academicYearFilter.length > 0 && academicYearFilter[0] !== '') {
  //     results = results.filter((c: IClass) => academicYearFilter.includes(c.academicYear.toString()))
  //   }
  //   console.log('departmentFilter', departmentFilter)
  //   if (departmentFilter.length > 0 && departmentFilter[0] !== '') {
  //     results = results.filter((c: IClass) => departmentFilter.includes(c.department))
  //   }

  //   if (termFilter.length > 0 && termFilter[0] !== '') {
  //     // obtain term from term (2022FA -> FA)
  //     results = results.filter((c: IClass) => termFilter.includes(c.term.substring(4)))
  //   }

  //   setClasses(results)
  //   setLoading(false)
  // }, [offeredFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter, termFilter])

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const response = await fetch('/api/classes/filters')
        const result = await response.json()

        if (result.success) {
          setAcademicYears(result.data.years.map((year: number) => ({
            value: year.toString(),
            label: `${year - 1}-${year}`,
          })))

          setAllDepartments(result.data.departments.map((dept: string) => ({
            value: dept,
            label: dept,
          })))
        }
      } catch (error) {
        console.error('Error fetching filters:', error)
      }
    }

    fetchFilters()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const fetchClasses = async () => {
      setLoading(true)
      try {
        const queryParams = new URLSearchParams({
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
          search: debounced,
          offered: offeredFilter.toString(),
          reviewable: reviewableFilter.toString(),
          reviewsOnly: reviewsOnlyFilter.toString(),
          useDescription: viewMode === 'list' ? 'true' : 'false',
          sortField: sort,
        })

        if (academicYearFilter.length > 0) {
          queryParams.append('academicYears', academicYearFilter.join(','))
        }
        if (departmentFilter.length > 0) {
          queryParams.append('departments', departmentFilter.join(','))
        }
        if (termFilter.length > 0) {
          queryParams.append('terms', termFilter.join(','))
        }
        if (communicationFilter.length > 0) {
          queryParams.append('communicationRequirements', communicationFilter.join(','))
        }
        if (girFilter.length > 0) {
          queryParams.append('girAttributes', girFilter.join(','))
        }
        if (hassFilter.length > 0) {
          queryParams.append('hassAttributes', hassFilter.join(','))
        }

        const startTime = performance.now()
        const response = await fetch(`/api/classes?${queryParams}`, {
          signal: controller.signal
        })
        const result = await response.json()
        const endTime = performance.now()

        setTimeForResults(endTime - startTime)

        if (result.success) {
          setClasses(result.data)
          setTotalClasses(result.meta.totalClasses)
          setTotalPages(result.meta.totalPages)
          setLoading(false)
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching classes:', error)
        }
      }
    }

    fetchClasses()

    return () => {
      controller.abort()
    }
  }, [
    currentPage, debounced, offeredFilter, reviewableFilter,
    reviewsOnlyFilter, academicYearFilter, departmentFilter,
    termFilter, communicationFilter, girFilter, hassFilter, sort
  ])

  useEffect(() => {
    setCurrentPage(1)
  }, [debounced, offeredFilter, reviewableFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter, termFilter, communicationFilter, girFilter, hassFilter, sort])

  useHotkeys([
    ['mod+\\', () => {
      setHelpOpened(!helpOpened)
    }]
  ])

  return (
    <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
      <Head>
        <title> Classes | MIT OpenGrades</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>
      <Alert color="blue" title="New: Advanced searching!" style={{ marginBottom: 'var(--mantine-spacing-lg)' }}>

        <Text>Here are a few quick tips for using our new ElasticSearch-powered search:
          <List>
            <List.Item>Use quotes to find exact phrases, such as <Code>"computer science"</Code>.</List.Item>
            <List.Item>Use wildcards to broaden your matches, like <Code>bio*</Code> for any words starting with "bio".</List.Item>
            <List.Item>Flip the switch to see more details about each class.</List.Item>
          </List>
        </Text>
      </Alert>
      <Title>
        Class Query
      </Title>
      <Collapse in={helpOpened}>
        <Card>
          <Title order={4}> Filter Tags (BETA) </Title>
          <Text size="sm">
            The following filters can be used to narrow down your search.
            <List>
              <List.Item> <b>@academicYear:2022</b> - Find classes offered in academic year 2022-2023 </List.Item>
              <List.Item> <b>@offered:false</b> - Find classes that aren&apos;t offered during AY2022-2023 (default: true) </List.Item>
              <List.Item> <b>@term:(2022FA|2022JA|2022SP)</b> - Find classes that are offered in the Fall, IAP, and Spring semesters of AY2022-2023 (default: true) </List.Item>
            </List>
          </Text>
        </Card>
      </Collapse>
      <Space h='md' />
      <TextInput
        leftSection={<IconSearch size={18} stroke={1.5} />}
        radius="xl"
        size="md"
        rightSection={loading && <Loader size='sm' />}
        placeholder="Search classes"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        rightSectionWidth={42}
      />

      <Divider
        my="md"
        label={`Advanced Search (${Object.entries({ offeredFilter, reviewableFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter, termFilter, communicationFilter, girFilter, hassFilter })
          .filter(([_, value]) =>
            Array.isArray(value) ? value.length > 0 : !!value
          ).length
          } selected) ${filtersOpened ? '▲' : '▼'}`}
        labelPosition="center"
        onClick={toggleFilterView}
      />

      <Collapse in={filtersOpened}>
        <Grid grow>
          <Grid.Col span={3}>
            <Checkbox label="Offered classes only" checked={offeredFilter} onChange={(e) => setOfferedFilter(e.target.checked)} />
            <Space h="sm" />
            <Checkbox label="Reviewable classes only" checked={reviewableFilter} onChange={(e) => setReviewable(e.target.checked)} />
            <Space h="sm" />
            <Checkbox label="Show only classes with reviews" checked={reviewsOnlyFilter} onChange={(e) => setReviewsOnlyFilter(e.target.checked)} />
          </Grid.Col>
          <Grid.Col span={9}>
            <MultiSelect placeholder="Academic Year" data={academicYears} value={academicYearFilter} onChange={setAcademicYearFilter} />
            <Space h="sm" />
            <MultiSelect placeholder="Term" data={[
              { label: 'Fall', value: 'FA' },
              { label: 'IAP', value: 'JA' },
              { label: 'Spring', value: 'SP' }
            ]} value={termFilter} onChange={setTermFilter} />
            <Space h="sm" />
            <MultiSelect placeholder="Department" data={allDepartments} value={departmentFilter} onChange={setDepartmentFilter} />
            <Space h="sm" />
            <MultiSelect
              placeholder="Communication Intensive"
              data={[
                { label: 'CI-H (Humanities)', value: 'CI-H' },
                { label: 'CI-HW (Humanities Writing)', value: 'CI-HW' }
              ]}
              value={communicationFilter}
              onChange={setCommunicationFilter}
            />
            <Space h="sm" />
            <MultiSelect
              placeholder="GIR Attributes"
              data={[
                { label: 'REST (Science)', value: 'REST' },
                { label: 'LAB (Laboratory)', value: 'LAB' },
                { label: 'Chemistry (GIR)', value: 'CHEM' },
                { label: 'Biology (GIR)', value: 'BIOL' },
                { label: 'Physics I (GIR)', value: 'PHY1' },
                { label: 'Physics II (GIR)', value: 'PHY2' },
                { label: 'Calculus I (GIR)', value: 'CAL1' },
                { label: 'Calculus II (GIR)', value: 'CAL2' }
              ]}
              value={girFilter}
              onChange={setGirFilter}
            />
            <Space h="sm" />
            <MultiSelect
              placeholder="HASS Attributes"
              data={[
                { label: 'HASS-A (Arts)', value: 'HASS-A' },
                { label: 'HASS-E (Elective)', value: 'HASS-E' },
                { label: 'HASS-H (Humanities)', value: 'HASS-H' },
                { label: 'HASS-S (Social Sciences)', value: 'HASS-S' }
              ]}
              value={hassFilter}
              onChange={setHassFilter}
            />
          </Grid.Col>
        </Grid>

      </Collapse>

      {/* <Space h="md" /> */}
      {/* <Text> <b> Filters: </b> {Object.entries(filters).length > 0 ? Object.entries(filters).filter(([key]) => key !== 'searchPhrases').map(([key, value]) => (<Badge key={key}> {`${ key }: ${ value.toString() }`} </Badge>)) : (<> None </>)} </Text> */}
      <Space h="lg" />
      {
        !loading &&
        <Flex justify="space-between" align={'center'}>

          <Text c='gray'> Found {totalClasses.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} result{totalClasses === 1 ? '' : 's'}. ({Math.round(timeForResults)} ms) </Text>

          <Group>
            <Select size='md' placeholder="Sort by" data={[
              { label: 'Relevance', value: 'relevance' },
              { label: 'Alphabetical', value: 'alphabetical' },
              { label: 'Reviews', value: 'reviews' },
              { label: 'Users', value: 'users' },
            ]} size='sm' defaultValue={sort} onChange={(value) => setSort(value)} clearable={false} allowDeselect={false} />
            <Switch
              size='lg'
              color='purple'
              onLabel={<IconGridPattern size={16} />}
              offLabel={<IconList size={16} />}
              checked={viewMode == 'grid'}
              onChange={(e) => setViewMode(e.target.checked ? 'grid' : 'list')}
            />
          </Group>
        </Flex>
      }
      <Space h="md" />
      <Box pos="relative">
        <LoadingOverlay visible={loading && classes.length > 0} />
        {
          viewMode === 'grid' ? (

            <ResponsiveMasonry columnCountBreakPoints={{ 600: 1, 1500: 2, 1200: 3 }}>
              <Masonry gutter={'0.5rem'}>
                {
                  classes.map((classEntry: IClass) => (
                    <ClassButton key={`${classEntry.subjectNumber} ${classEntry.term}`} classReviewCount={classEntry.classReviewCount || 0} contentSubmissionCount={classEntry.contentSubmissionCount || 0} {...classEntry} />
                  ))
                }
              </Masonry>
            </ResponsiveMasonry>) : (
            <Stack spacing="md">
              {
                classes.map((classEntry: IClass) => (
                  <ClassButton key={classEntry._id} classReviewCount={classEntry.classReviewCount || 0} contentSubmissionCount={classEntry.contentSubmissionCount || 0} withDescription searchTerm={searchTerm} highlight={classEntry.highlight} {...classEntry} />
                ))
              }
            </Stack>
          )
        }
      </Box>
      <Space h="md" />
      {/* align Pagination to center */}
      {
        (loading && classes.length == 0) && (
          <>
            <Center>
              <Loader size='lg' />
            </Center>
            <Space h="md" />
          </>
        )
      }
      <Center>
        <Pagination
          value={currentPage}
          onChange={(page) => {
            setLoading(true)
            setCurrentPage(page)
          }}
          total={totalPages}
          withControls
          radius="md"
        />
      </Center>

    </Container>
  )
}

// export async function getServerSideProps (context) {
//   await mongoConnection()

//   const classesProp: IClass[] = await Class.find({display: true }).lean() as any as IClass[]
//   const classReviewCounts = await ClassReview.aggregate().sortByCount('class')
//   // const session: Session | null = await getServerSession(context.req, context.res, authOptions)
//   return {
//     props: {
//       classesProp: JSON.parse(JSON.stringify(classesProp)),
//       classReviewCountsProp: JSON.parse(JSON.stringify(classReviewCounts))
//     }
//   }
// }

export default Classes
