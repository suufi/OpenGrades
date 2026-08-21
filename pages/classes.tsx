
import type { NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Badge, Box, Center, Checkbox, Chip, Code, Collapse, Container, Divider, Grid, Group, List, Loader, LoadingOverlay, Mark, MultiSelect, Pagination, SegmentedControl, Select, Stack, Switch, Text, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core'


import { IClass } from '../types'
import { formatTermDisplay } from '@/utils/formatTerm'
import { useDebouncedValue, useDisclosure, useHotkeys, useToggle } from '@mantine/hooks'
import { useFilters, useClasses } from '@/lib/query'
import {
  DEFAULT_INSTITUTIONS,
  getInstitutionScope,
  institutionsToQueryParam,
  hasInstitutionSelection,
  isDefaultInstitutionFilter,
  parseInstitutionFiltersFromSession,
  type Institution,
} from '@/utils/institutionFilters'
import { compareDepartmentCodes, formatDepartmentOptionLabel, sortDepartmentCodes } from '@/utils/departments'
import { IconFile, IconGridPattern, IconList, IconSearch, IconUserCircle } from '@tabler/icons-react'
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'

import ClassesPageClasses from '../styles/ClassesPage.module.css'
import ui from '@/styles/Interface.module.css'
type ClassAPIEntry = IClass & { classReviewCount: number, contentSubmissionCount: number, userCount?: number, withDescription?: boolean, searchTerm?: string, highlight?: object }
type SelectOption = { value: string, label: string }
const ClassButton = ({ _id, classReviewCount, contentSubmissionCount, subjectTitle, subjectNumber, aliases, instructors, term, academicYear, display, description, department, units, offered, reviewable, userCount, withDescription, searchTerm, highlight, institution }: ClassAPIEntry) => {
  const router = useRouter()

  let formattedDescription = (
    <Text c="dimmed" size="sm"> {description} </Text>
  )

  let formattedInstructors = (
    <>{instructors?.join(', ')}</>
  )

  const regex = /("[^"]+"|[^,| ]+)/g
  const replaceHighlight = (fullText: string, snippet: string) => {
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

  if (highlight) {
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

  const cardContent = (
    <UnstyledButton onClick={() => router.push(`/classes/${_id}`)} className={ClassesPageClasses.classButton}>
      <div className={ClassesPageClasses.classHeader}>
        <Text className={ClassesPageClasses.classTitle}>
          <Text span className={ClassesPageClasses.classNumber}>{subjectNumber}</Text>
          <Text span> · {subjectTitle}</Text>
        </Text>
      </div>

      <div className={ClassesPageClasses.classMetaRow}>
        {units && <Text size="xs" c="dimmed" className={ClassesPageClasses.classUnits}>{units.trim()}</Text>}
        <Badge variant="light" color="gray" size="xs">{formatTermDisplay(term)}</Badge>
        {aliases && aliases.length > 0 && (
          <Badge variant="outline" color="gray" size="xs">AKA {aliases.join(', ')}</Badge>
        )}
        {instructors && instructors.length > 0 && (
          <Text size="xs" c="dimmed" lineClamp={1} className={ClassesPageClasses.instructors}>
            {formattedInstructors}
          </Text>
        )}
      </div>

      {withDescription && (
        <div className={ClassesPageClasses.classDescription}>{formattedDescription}</div>
      )}

      <div className={ClassesPageClasses.statsRow}>
        <div className={ClassesPageClasses.badgesRow}>
          {!!classReviewCount && (
            <Badge size="xs" variant="light">{classReviewCount} {classReviewCount === 1 ? 'review' : 'reviews'}</Badge>
          )}
          {institution === 'harvard' && <Badge variant="light" color="red" size="xs">Harvard</Badge>}
          {!reviewable && offered && institution !== 'harvard' && <Badge variant="light" color="red" size="xs">Not reviewable</Badge>}
          {!offered && <Badge variant="light" color="red" size="xs">Not offered</Badge>}
        </div>
        <div className={ClassesPageClasses.statsRight}>
          {contentSubmissionCount > 0 && (
            <Text size="xs" c="dimmed" className={ClassesPageClasses.statChip}>
              <IconFile size={14} /> {contentSubmissionCount}
            </Text>
          )}
          <Text size="xs" c="dimmed" className={ClassesPageClasses.statChip}>
            <IconUserCircle size={14} /> {userCount}
          </Text>
        </div>
      </div>
    </UnstyledButton>
  )

  if (withDescription) {
    return cardContent
  }

  return (
    <Tooltip w={300} withArrow multiline label={description || 'No description provided.'}>
      {cardContent}
    </Tooltip>
  )
}


interface ClassesProps {
  classesProp: IClass[]
  classReviewCountsProp: { _id: string, count: number }[]
}

const Classes: NextPage = () => {
  const router = useRouter()
  const { status: authStatus } = useSession()
  const favoritesView = router.isReady && router.query.view === 'favorites'

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
    levelFilter: [],
    seasonFilter: [],
    halfTermFilter: false,
    schoolFilter: DEFAULT_INSTITUTIONS,
    currentPage: 1,
  }

  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem('classesPageState')
    if (saved) {
      const parsed = JSON.parse(saved)
      initialState = {
        ...initialState,
        ...parsed,
        schoolFilter: parseInstitutionFiltersFromSession(parsed),
      }
    }
  }


  const [searchTerm, setSearchTerm] = useState(initialState.searchTerm)
  const [debounced] = useDebouncedValue(searchTerm, 500, { leading: true })
  const { data: filtersData } = useFilters()
  const academicYears = useMemo(() => {
    const fData = filtersData as any
    if (!fData?.years) return []
    return fData.years.map((year: number) => ({
      value: year.toString(),
      label: `${year - 1}-${year}`,
    }))
  }, [filtersData])

  const mitDepartments = useMemo((): SelectOption[] => {
    const fData = filtersData as any
    const depts = (fData?.mitDepartments ?? fData?.departments ?? []) as string[]
    return sortDepartmentCodes(depts.filter(Boolean)).map((dept) => ({
      value: dept,
      label: formatDepartmentOptionLabel(dept),
    }))
  }, [filtersData])

  const harvardDepartments = useMemo((): SelectOption[] => {
    const fData = filtersData as any
    const depts = ((fData?.harvardDepartments ?? []) as string[]).filter(Boolean)
    return [...depts]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((dept) => ({
        value: dept,
        label: dept,
      }))
  }, [filtersData])

  const [offeredFilter, setOfferedFilter] = useState(initialState.offeredFilter)
  const [reviewableFilter, setReviewable] = useState(initialState.reviewableFilter)
  const [reviewsOnlyFilter, setReviewsOnlyFilter] = useState(initialState.reviewsOnlyFilter)
  const [academicYearFilter, setAcademicYearFilter] = useState<string[]>(initialState.academicYearFilter)
  const [departmentFilter, setDepartmentFilter] = useState<string[]>(initialState.departmentFilter)
  const [termFilter, setTermFilter] = useState<string[]>(initialState.termFilter)
  const [communicationFilter, setCommunicationFilter] = useState<string[]>(initialState.communicationFilter)
  const [girFilter, setGirFilter] = useState<string[]>(initialState.girFilter)
  const [hassFilter, setHassFilter] = useState<string[]>(initialState.hassFilter)
  const [levelFilter, setLevelFilter] = useState<string[]>(initialState.levelFilter)
  const [seasonFilter, setSeasonFilter] = useState<string[]>(initialState.seasonFilter)
  const [halfTermFilter, setHalfTermFilter] = useState<boolean>(initialState.halfTermFilter)
  const [schoolFilter, setSchoolFilter] = useState<Institution[]>(initialState.schoolFilter)

  const [currentPage, setCurrentPage] = useState(initialState.currentPage)

  const itemsPerPage = 21 // Set the number of items per page
  const [helpOpened, setHelpOpened] = useState(false)
  const [tipsOpened, { toggle: toggleTips }] = useDisclosure(false)
  const [filtersOpened, { toggle: toggleFilterView }] = useDisclosure(false)
  const [sort, setSort] = useState('relevance')
  const [viewMode, setViewMode] = useToggle(['grid', 'list'])

  const institutionScope = useMemo(() => getInstitutionScope(schoolFilter), [schoolFilter])
  const { includesHarvard, harvardOnly, label: schoolFilterLabel } = institutionScope

  const classQueryParams = useMemo(() => ({
    page: currentPage,
    limit: itemsPerPage,
    search: debounced,
    offered: offeredFilter.toString(),
    reviewable: reviewableFilter.toString(),
    reviewsOnly: reviewsOnlyFilter.toString(),
    useDescription: viewMode === 'list' ? 'true' : 'false',
    sortField: sort,
    academicYears: academicYearFilter.length > 0 ? academicYearFilter.join(',') : undefined,
    departments: departmentFilter.length > 0 ? departmentFilter.join(',') : undefined,
    terms: termFilter.length > 0 ? termFilter.join(',') : undefined,
    communicationRequirements: communicationFilter.length > 0 ? communicationFilter.join(',') : undefined,
    girAttributes: girFilter.length > 0 ? girFilter.join(',') : undefined,
    hassAttributes: hassFilter.length > 0 ? hassFilter.join(',') : undefined,
    levels: levelFilter.length > 0 ? levelFilter.join(',') : undefined,
    seasons: seasonFilter.length > 0 ? seasonFilter.join(',') : undefined,
    halfTerm: halfTermFilter ? 'true' : undefined,
    institutions: institutionsToQueryParam(schoolFilter),
    favoritesOnly: favoritesView ? 'true' : undefined,
  }), [
    currentPage, debounced, offeredFilter, reviewableFilter, reviewsOnlyFilter,
    academicYearFilter, departmentFilter, termFilter, communicationFilter,
    girFilter, hassFilter, levelFilter, seasonFilter, halfTermFilter, schoolFilter, sort, viewMode, favoritesView,
  ])

  const classesEnabled = router.isReady && (!favoritesView || authStatus === 'authenticated')
  const { data: classesResult, isLoading, isFetching, isPlaceholderData } = useClasses(classQueryParams, classesEnabled)

  useEffect(() => {
    if (favoritesView) {
      setOfferedFilter(false)
    }
  }, [favoritesView])

  const rawClasses = ((isFetching && isPlaceholderData) ? [] : (classesResult?.data ?? [])) as IClass[]
  const unauthenticatedFavoritesView = favoritesView && authStatus !== 'authenticated'
  const classes = unauthenticatedFavoritesView ? [] : rawClasses
  const totalClasses = unauthenticatedFavoritesView ? 0 : (classesResult?.meta?.totalClasses ?? 0)
  const totalPages = unauthenticatedFavoritesView ? 1 : (classesResult?.meta?.totalPages ?? 1)
  const loading = (favoritesView && authStatus === 'loading') || isLoading || isFetching
  const showResultsOverlay = isFetching && (classes.length > 0 || isPlaceholderData)

  const availableDepartments = useMemo(() => {
    if (harvardOnly) return harvardDepartments
    const combined = includesHarvard ? [...mitDepartments, ...harvardDepartments] : mitDepartments
    return combined
      .filter((option, index, array) => array.findIndex((entry) => entry.value === option.value) === index)
      .sort((a, b) => {
        const mitComparison = compareDepartmentCodes(a.value, b.value)
        if (mitComparison !== 0) return mitComparison
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      })
  }, [harvardOnly, includesHarvard, mitDepartments, harvardDepartments])

  useEffect(() => {
    if (includesHarvard || harvardDepartments.length === 0) {
      return
    }

    const mitDepartmentValues = new Set(mitDepartments.map((dept) => dept.value))
    const harvardOnlyDepartmentValues = new Set(
      harvardDepartments
        .map((dept) => dept.value)
        .filter((dept) => !mitDepartmentValues.has(dept))
    )

    setDepartmentFilter((current) => current.filter((dept) => !harvardOnlyDepartmentValues.has(dept)))
  }, [includesHarvard, mitDepartments, harvardDepartments])

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
      levelFilter,
      seasonFilter,
      halfTermFilter,
      schoolFilter,
      currentPage,
    }
    sessionStorage.setItem('classesPageState', JSON.stringify(state))
  }, [searchTerm, offeredFilter, reviewableFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter, termFilter, communicationFilter, girFilter, hassFilter, levelFilter, seasonFilter, halfTermFilter, schoolFilter, currentPage])


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

  const skipPageReset = useRef(true)

  useEffect(() => {
    if (skipPageReset.current) {
      skipPageReset.current = false
      return
    }
    setCurrentPage(1)
  }, [debounced, offeredFilter, reviewableFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter, termFilter, communicationFilter, girFilter, hassFilter, levelFilter, seasonFilter, halfTermFilter, schoolFilter, sort, viewMode, favoritesView])

  useHotkeys([
    ['mod+\\', () => {
      setHelpOpened(!helpOpened)
    }]
  ])

  const schoolFilterIsActive = !isDefaultInstitutionFilter(schoolFilter)

  const activeFilterCount = Object.entries({
    offeredFilter, reviewableFilter, reviewsOnlyFilter, academicYearFilter, departmentFilter,
    termFilter, communicationFilter, girFilter, hassFilter,
    levelFilter, seasonFilter, halfTermFilter,
    ...(schoolFilterIsActive ? { schoolFilter } : {}),
  }).filter(([_, value]) => Array.isArray(value) ? value.length > 0 : !!value).length

  const setView = (value: string) => {
    const nextQuery = { ...router.query }
    if (value === 'favorites') {
      nextQuery.view = 'favorites'
      setOfferedFilter(false)
    } else {
      delete nextQuery.view
    }
    router.replace({ pathname: '/classes', query: nextQuery }, undefined, { shallow: true })
  }

  return (
    <Container size="lg" px="md" className={`${ui.page} ${ClassesPageClasses.page}`}>
      <Head>
        <title>Classes | MIT OpenGrades</title>
        <meta name="description" content="Search MIT and Harvard classes on OpenGrades." />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <Stack gap="md" className={ClassesPageClasses.pageStack}>
        <div className={ClassesPageClasses.pageHeader}>
          <Group gap="md" align="center" wrap="wrap" className={ClassesPageClasses.pageHeaderLeft}>
            <Title order={1} className={ui.heroTitle}>Classes</Title>
            <SegmentedControl
              size="xs"
              value={favoritesView ? 'favorites' : 'all'}
              onChange={setView}
              data={[
                { label: 'All', value: 'all' },
                { label: 'Favorites', value: 'favorites' },
              ]}
            />
          </Group>
          <button type="button" className={ClassesPageClasses.tipsToggle} onClick={toggleTips}>
            {tipsOpened ? 'Hide search tips' : 'Search tips'}
          </button>
        </div>

        <Collapse expanded={tipsOpened}>
          <div className={ClassesPageClasses.tipsPanel}>
            <List spacing={4} size="sm" className={ClassesPageClasses.tipsList}>
              <List.Item>Use quotes for exact phrases, such as <Code>"computer science"</Code>.</List.Item>
              <List.Item>Use wildcards like <Code>bio*</Code> to broaden matches.</List.Item>
              <List.Item>Switch to list view for descriptions on each result.</List.Item>
            </List>
          </div>
        </Collapse>

        <Collapse expanded={helpOpened}>
          <div className={`${ui.sectionCard} ${ClassesPageClasses.helpPanel}`}>
            <Title order={5}>Filter tags (beta)</Title>
            <List size="sm" mt="xs" spacing={4}>
              <List.Item><b>@academicYear:2022</b> — classes in AY 2022–2023</List.Item>
              <List.Item><b>@offered:false</b> — classes not offered this year</List.Item>
              <List.Item><b>@term:(2022FA|2022JA|2022SP)</b> — filter by term codes</List.Item>
            </List>
          </div>
        </Collapse>

        <section className={`${ui.sectionCard} ${ClassesPageClasses.searchPanel}`}>
          <TextInput
            leftSection={<IconSearch size={18} stroke={1.5} />}
            radius="md"
            size="sm"
            rightSection={loading && <Loader size="sm" />}
            placeholder="Search by number, title, instructor, or department"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            rightSectionWidth={42}
          />

          <button type="button" className={ClassesPageClasses.filterToggle} onClick={toggleFilterView}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} {filtersOpened ? '▴' : '▾'}
          </button>

          <Collapse expanded={filtersOpened}>
            <div className={ClassesPageClasses.filtersPanel}>
              <div className={ClassesPageClasses.schoolFilterSection}>
                <Text className={ClassesPageClasses.filterGroupLabel}>Schools</Text>
                <Chip.Group
                  multiple
                  value={schoolFilter}
                  onChange={(value) => setSchoolFilter(value as Institution[])}
                >
                  <Group gap="sm" className={ClassesPageClasses.schoolChips}>
                    <Chip value="mit" variant="outline" size="md" classNames={{ label: ClassesPageClasses.schoolChipLabel }}>
                      MIT
                    </Chip>
                    <Chip value="harvard" variant="outline" size="md" classNames={{ label: ClassesPageClasses.schoolChipLabel }}>
                      Harvard
                    </Chip>
                  </Group>
                </Chip.Group>
              </div>

              <Grid className={ClassesPageClasses.filterGrid}>
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <Stack gap="sm" className={ClassesPageClasses.filterColumn}>
                    <Text className={ClassesPageClasses.filterGroupLabel}>Quick filters</Text>
                    <Stack gap="xs" className={ClassesPageClasses.checkboxGroup}>
                      <Checkbox label="Offered only" checked={offeredFilter} onChange={(e) => setOfferedFilter(e.target.checked)} />
                      <Checkbox label="Reviewable only" checked={reviewableFilter} onChange={(e) => setReviewable(e.target.checked)} />
                      <Checkbox label="Has reviews" checked={reviewsOnlyFilter} onChange={(e) => setReviewsOnlyFilter(e.target.checked)} />
                      <Checkbox label="Half-term / partial only" checked={halfTermFilter} onChange={(e) => setHalfTermFilter(e.target.checked)} />
                    </Stack>
                  </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 8 }}>
                  <Stack gap="sm" className={ClassesPageClasses.filterColumn}>
                    <Text className={ClassesPageClasses.filterGroupLabel}>Refine results</Text>
                    <Stack gap="sm" className={ClassesPageClasses.filterFields}>
                      <MultiSelect placeholder="Academic year" data={academicYears} value={academicYearFilter} onChange={setAcademicYearFilter} />
                      <MultiSelect placeholder="Term" data={[
                        { label: 'Fall', value: 'FA' },
                        { label: 'IAP', value: 'JA' },
                        { label: 'Spring', value: 'SP' },
                      ]} value={termFilter} onChange={setTermFilter} />
                      <MultiSelect placeholder="Department" data={availableDepartments} value={departmentFilter} onChange={setDepartmentFilter} />
                      <MultiSelect placeholder="Communication intensive" data={[
                        { label: 'CI-H', value: 'CI-H' },
                        { label: 'CI-HW', value: 'CI-HW' },
                      ]} value={communicationFilter} onChange={setCommunicationFilter} />
                      <MultiSelect placeholder="GIR attributes" data={[
                        { label: 'REST', value: 'REST' },
                        { label: 'LAB', value: 'LAB' },
                        { label: 'PLAB', value: 'PLAB' },
                        { label: 'Chemistry', value: 'CHEM' },
                        { label: 'Biology', value: 'BIOL' },
                        { label: 'Physics I', value: 'PHY1' },
                        { label: 'Physics II', value: 'PHY2' },
                        { label: 'Calculus I', value: 'CAL1' },
                        { label: 'Calculus II', value: 'CAL2' },
                      ]} value={girFilter} onChange={setGirFilter} />
                      <MultiSelect placeholder="HASS attributes" data={[
                        { label: 'HASS-A', value: 'HASS-A' },
                        { label: 'HASS-E', value: 'HASS-E' },
                        { label: 'HASS-H', value: 'HASS-H' },
                        { label: 'HASS-S', value: 'HASS-S' },
                      ]} value={hassFilter} onChange={setHassFilter} />
                      <MultiSelect placeholder="Level" data={[
                        { label: 'Undergraduate', value: 'U' },
                        { label: 'Graduate', value: 'G' },
                      ]} value={levelFilter} onChange={setLevelFilter} />
                      <MultiSelect placeholder="Offered in" data={[
                        { label: 'Fall', value: 'fall' },
                        { label: 'IAP', value: 'iap' },
                        { label: 'Spring', value: 'spring' },
                        { label: 'Summer', value: 'summer' },
                      ]} value={seasonFilter} onChange={setSeasonFilter} />
                    </Stack>
                  </Stack>
                </Grid.Col>
              </Grid>
            </div>
          </Collapse>
        </section>

        <Group justify="space-between" align="center" wrap="wrap" gap="sm" className={ClassesPageClasses.resultsToolbar}>
          {!loading && (
            <Stack gap={2}>
              <Text size="sm" className={ClassesPageClasses.resultsMeta}>
                {totalClasses.toLocaleString()} result{totalClasses === 1 ? '' : 's'}
              </Text>
              <Text size="xs" c="dimmed">{schoolFilterLabel}</Text>
            </Stack>
          )}
          {!loading && (
            <Group gap="sm" wrap="nowrap" className={ClassesPageClasses.resultsControls}>
              <Select
                size="xs"
                placeholder="Sort"
                data={[
                  { label: 'Relevance', value: 'relevance' },
                  { label: 'Alphabetical', value: 'alphabetical' },
                  { label: 'Reviews', value: 'reviews' },
                  { label: 'Users', value: 'users' },
                ]}
                value={sort}
                onChange={(value) => value && setSort(value)}
                clearable={false}
                allowDeselect={false}
                w={130}
              />
              <Switch
                size="md"
                color="brick"
                onLabel={<IconGridPattern size={14} />}
                offLabel={<IconList size={14} />}
                checked={viewMode === 'grid'}
                onChange={(e) => setViewMode(e.target.checked ? 'grid' : 'list')}
              />
            </Group>
          )}
        </Group>

        <section className={ClassesPageClasses.resultsSection}>
          <Box pos="relative" className={ClassesPageClasses.resultsBox}>
            <LoadingOverlay visible={showResultsOverlay} />

            {loading && classes.length === 0 ? (
              <Center py="md">
                <Loader size="lg" />
              </Center>
            ) : classes.length === 0 ? (
              <Center py="md">
                <Text size="sm" c="dimmed">
                  {favoritesView && authStatus === 'unauthenticated'
                    ? 'Sign in to see favorites.'
                    : favoritesView
                      ? 'No favorites yet. Bookmark a class from its page.'
                      : hasInstitutionSelection(schoolFilter)
                        ? 'No classes match your search and filters.'
                        : 'Select at least one school to see results.'}
                </Text>
              </Center>
            ) : viewMode === 'grid' ? (
              <ResponsiveMasonry columnCountBreakPoints={{ 600: 1, 900: 2, 1200: 3 }}>
                <Masonry gutter="1rem">
                  {classes.map((classEntry: IClass) => (
                    <ClassButton
                      key={`${classEntry.subjectNumber}-${classEntry.term}`}
                      classReviewCount={(classEntry as ClassAPIEntry).classReviewCount || 0}
                      contentSubmissionCount={(classEntry as ClassAPIEntry).contentSubmissionCount || 0}
                      {...classEntry}
                    />
                  ))}
                </Masonry>
              </ResponsiveMasonry>
            ) : (
              <Stack gap="md">
                {classes.map((classEntry: IClass) => (
                  <ClassButton
                    key={classEntry._id}
                    classReviewCount={(classEntry as ClassAPIEntry).classReviewCount || 0}
                    contentSubmissionCount={(classEntry as ClassAPIEntry).contentSubmissionCount || 0}
                    withDescription
                    searchTerm={searchTerm}
                    highlight={(classEntry as ClassAPIEntry).highlight}
                    {...classEntry}
                  />
                ))}
              </Stack>
            )}
          </Box>

          {totalPages > 1 && (
            <Center mt="md">
              <Pagination
                value={currentPage}
                onChange={setCurrentPage}
                total={totalPages}
                withControls
                radius="md"
                size="sm"
              />
            </Center>
          )}
        </section>
      </Stack>
    </Container>
  )
}

export default Classes
