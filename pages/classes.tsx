
// @ts-nocheck
import type { InferGetServerSidePropsType, NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

import { Badge, Card, Center, Checkbox, Collapse, Container, Divider, Grid, Group, List, Loader, MultiSelect, Pagination, Space, Text, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core'

import mongoConnection from '../utils/mongoConnection'

import Class from '../models/Class'
import { IClass } from '../types'

import { useDebouncedValue, useDisclosure, useHotkeys } from '@mantine/hooks'

import { IconSearch } from '@tabler/icons'
import Minisearch from 'minisearch'
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'
import ClassReview from '../models/ClassReview'

import ClassesPageClasses from '../styles/ClassesPage.module.css'

const ClassButton = ({ _id, classReviewCount, subjectTitle, subjectNumber, aliases, instructors, term, academicYear, display, description, department, units, offered }: IClass & { classReviewCount: number }) => {
  const router = useRouter()
  return (
    <Tooltip w={300} withArrow multiline label={description || 'No description provided.'}>
      <UnstyledButton onClick={() => router.push(`/classes/${_id}`)} className={ClassesPageClasses.ClassButton}>
        <Title order={5}>
          {`${subjectNumber}: ${subjectTitle}`}
        </Title>
        <Text c='dimmed' size='xs'> ({units.trim()}) </Text>
        <Space h="sm" />
        <Text c="dimmed" size="sm"> {`${Number(term.substring(0, 4)) - 1}-${term}`} - {instructors.join(', ')} {(aliases && aliases.length > 0) && `- AKA ${aliases?.join(', ')}`} </Text>
        <Space h="sm" />
        <Group>
          {classReviewCount && <Badge size='sm' variant="filled">{classReviewCount} {classReviewCount === 1 ? 'Response' : 'Responses'}</Badge>}
          {!offered && <Badge variant='filled' color='red' size='sm'> Not Offered </Badge>}
        </Group>
      </UnstyledButton>
    </Tooltip>
  )
}

interface ClassesProps {
  classesProp: IClass[]
  classReviewCountsProp: { _id: string, count: number }[]
}

const Classes: NextPage<ClassesProps> = ({ classesProp, classReviewCountsProp }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [debounced] = useDebouncedValue(searchTerm, 10, { leading: true })
  const [classes, setClasses] = useState(classesProp)

  // turn all of the above into useState variables
  const [offeredFilter, setOfferedFilter] = useState(true)
  const [reviewsOnlyFilter, setReviewsOnlyFilter] = useState(false)
  const [academicYearFilter, setAcademicYearFilter] = useState<string[]>([])
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([])
  const [termFilter, setTermFilter] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [helpOpened, setHelpOpened] = useState(false)
  const [activePage, setPage] = useState(1)
  const [filtersOpened, { toggle: toggleFilterView }] = useDisclosure(false)

  // get unique class years
  const academicYears = classesProp.map((academicClass: IClass) => academicClass.academicYear).filter((year: number, index: number, array: number[]) => array.indexOf(year) === index).map((year: number) => {
    return {
      value: year.toString(),
      label: `${year - 1}-${year}`
    }
  })

  // get unique departments
  const allDepartments = classesProp.map((academicClass: IClass) => academicClass.department).filter((department: string, index: number, array: string[]) => array.indexOf(department) === index).map((department: string) => {
    return {
      value: department,
      label: department
    }
  })

  const options = {
    shouldSort: true,
    threshold: 0.3,
    keys: [
      'subjectNumber',
      'subjectTitle',
      'aliases'
    ]
  }

  // const classesFuse = new Fuse(classesProp, options)

  const minisearch = new Minisearch({
    idField: '_id',
    fields: ['subjectNumber', 'subjectTitle', 'aliases', 'instructors'],
    storeFields: ['subjectNumber', 'subjectTitle', 'aliases', 'instructors', 'term', 'academicYear', 'display', 'description', 'department', 'units', 'offered']
  })

  minisearch.addAll(classesProp)

  // useEffect(() => {
  //   setLoading(true)
  //   const updatedFilters: Record<string, string | boolean | number> = {
  //     offered: true
  //   }
  //   const debouncedParsed = debounced.split(' ')
  //   debouncedParsed.forEach(term => {
  //     if (term.startsWith('@') && term.includes(':')) {
  //       // If the term starts with an "@", split it on the first colon and add it to the filters object
  //       const terms = term.split(':')
  //       const key = terms[0] || ''
  //       let value: string | boolean | number = terms[1] || ''
  //       if (['false', 'true'].includes(terms[1].toLowerCase())) {
  //         value = terms[1] === 'true'
  //         console.log(`i just set ${terms[1]} to ${value}`)
  //       } else if (/^\d+$/.test(terms[1])) {
  //         value = parseInt(terms[1])
  //       }
  //       console.log(key, value, key.length > 1, value.toString().length >= 1)
  //       if (key.length > 1 && value.toString().length >= 1) {
  //         updatedFilters[key.substring(1)] = value // remove the "@" from the key
  //       }
  //     } else {
  //       // If the term does not start with an "@", it is a search phrase
  //       // Add it to the searchPhrases array in the filters object
  //       if (updatedFilters.searchPhrases) {
  //         updatedFilters.searchPhrases += ` ${term}`
  //       } else {
  //         updatedFilters.searchPhrases = term
  //       }
  //     }
  //   })
  //   setFilters({
  //     ...updatedFilters
  //   })

  //   let results = classesProp

  //   if (updatedFilters.searchPhrases && updatedFilters.searchPhrases !== '') {
  //     console.log('updatedFilters.searchPhrases', updatedFilters.searchPhrases)
  //     results = classesFuse.search(updatedFilters.searchPhrases).map(match => match.item)
  //     console.log(updatedFilters.searchPhrases, results)
  //   }

  //   console.log('results before filtering', results)

  //   // results = classes.filter((c: IClass) =>
  //   //   Object.entries(filters).every(([key, value]) => key !== 'searchPhrases' && c[key] === value)
  //   // )
  //   console.groupCollapsed()

  //   results = results.filter((classEntry: IClass) => {
  //     return Object.entries(filters).filter(([key]) => key !== 'searchPhrases').every(([key, value]) => {
  //       console.log('checking class', classEntry)
  //       console.log('\tfilter check:', classEntry[key], value)
  //       console.log('\tincluding class:', classEntry[key] === value ? '✅' : '❌')
  //       return classEntry[key] === value
  //     })
  //   })
  //   console.groupEnd()

  //   console.log('filters applied', Object.entries(filters))
  //   console.log('classes remaining', results)

  //   setClasses(results)

  //   setLoading(false)
  // }, [debounced])

  useEffect(() => {
    setLoading(true)
    setPage(1)
    console.log('debounced', debounced)
    if (debounced !== "") {
      // let results = classesFuse.search(debounced).map(match => match.item)
      let results = minisearch.search(debounced, {
        boost: { subjectNumber: 2, subjectTitle: 1, aliases: 2 },
        fuzzy: false,
        prefix: function (term) {
          if (/[0-9.]/.test(term)) {
            return true
          }

          return false
        }
      }).map((result: { id: string }) => classesProp.filter((classEntry: IClass) => classEntry._id === result.id)[0])
      if (offeredFilter) {
        results = results.filter((c: IClass) => c.offered)
      }

      if (reviewsOnlyFilter) {
        results = results.filter((c: IClass) => classReviewCountsProp.map((classReviewCount: { _id: string, count: number }) => classReviewCount._id).includes(c._id))
      }

      if (academicYearFilter.length > 0 && academicYearFilter[0] !== '') {
        results = results.filter((c: IClass) => academicYearFilter.includes(c.academicYear.toString()))
      }
      console.log('departmentFilter', departmentFilter)
      if (departmentFilter.length > 0 && departmentFilter[0] !== '') {
        results = results.filter((c: IClass) => departmentFilter.includes(c.department))
      }

      if (termFilter.length > 0 && termFilter[0] !== '') {
        // obtain term from term (2022FA -> FA)
        results = results.filter((c: IClass) => termFilter.includes(c.term.substring(4)))
      }
      setClasses(results)
    }
    setLoading(false)
  }, [debounced])

  useEffect(() => {
    setLoading(true)
    let results = classesProp

    if (offeredFilter) {
      results = results.filter((c: IClass) => c.offered)
    }

    if (reviewsOnlyFilter) {
      results = results.filter((c: IClass) => classReviewCountsProp.map((classReviewCount: { _id: string, count: number }) => classReviewCount._id).includes(c._id))
    }

    if (academicYearFilter.length > 0 && academicYearFilter[0] !== '') {
      results = results.filter((c: IClass) => academicYearFilter.includes(c.academicYear.toString()))
    }
    console.log('departmentFilter', departmentFilter)
    if (departmentFilter.length > 0 && departmentFilter[0] !== '') {
      results = results.filter((c: IClass) => departmentFilter.includes(c.department))
    }

    if (termFilter.length > 0 && termFilter[0] !== '') {
      // obtain term from term (2022FA -> FA)
      results = results.filter((c: IClass) => termFilter.includes(c.term.substring(4)))
    }

    setClasses(results)
    setLoading(false)
  }, [offeredFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter, termFilter])

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
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Title>
        Classes
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
        rightSection=
        {loading && <Loader size='sm' />}
        placeholder="Search classes"
        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
        rightSectionWidth={42}
      />

      <Divider my="md" label={`Advanced Search ${filtersOpened ? '▲' : '▼'}`} labelPosition="center" onClick={toggleFilterView} />

      <Collapse in={filtersOpened}>
        <Grid grow>
          <Grid.Col span={3}>
            <Checkbox label="Offered classes only" checked={offeredFilter} onChange={(e) => setOfferedFilter(e.target.checked)} />
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
          </Grid.Col>
        </Grid>

      </Collapse>

      {/* <Space h="md" /> */}
      {/* <Text> <b> Filters: </b> {Object.entries(filters).length > 0 ? Object.entries(filters).filter(([key]) => key !== 'searchPhrases').map(([key, value]) => (<Badge key={key}> {`${key}: ${value.toString()}`} </Badge>)) : (<> None </>)} </Text> */}
      <Space h="lg" />
      <Text> Showing {classes.length} result{classes.length === 1 ? '' : 's'}. </Text>
      <Space h="md" />
      <ResponsiveMasonry columnCountBreakPoints={{ 600: 1, 1500: 2, 1200: 3 }}>
        <Masonry gutter={'0.5rem'}>
          {
            classes.slice((activePage - 1) * 21, activePage * 21).map((classEntry: IClass) => (
              <ClassButton key={`${classEntry.subjectNumber} ${classEntry.term}`} classReviewCount={classReviewCountsProp.filter((reviewCount: { _id: string, count: number }) => reviewCount._id === classEntry._id)[0]?.count} {...classEntry} />
            ))
          }
        </Masonry>
      </ResponsiveMasonry>
      <Space h="md" />
      {/* align Pagination to center */}
      <Center>
        <Pagination value={activePage} onChange={setPage} total={Math.ceil(classes.length / 21)} />
      </Center>

    </Container>
  )
}

export async function getServerSideProps (context) {
  await mongoConnection()

  const classesProp: IClass[] = await Class.find({ display: true }).lean() as IClass[]
  const classReviewCounts = await ClassReview.aggregate().sortByCount('class')
  // const session: Session | null = await getServerSession(context.req, context.res, authOptions)
  return {
    props: {
      classesProp: JSON.parse(JSON.stringify(classesProp)),
      classReviewCountsProp: JSON.parse(JSON.stringify(classReviewCounts))
    }
  }
}

export default Classes
