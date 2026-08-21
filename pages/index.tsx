import type { InferGetServerSidePropsType, NextPage } from 'next'
import Head from 'next/head'

// import type {
//   Session,
// } from "@auth/core/types"
import ClassSearch from '@/components/ClassSearch'
import DegreeTermsModal from '@/components/DegreeTermsModal'
import GradeReportModal from '@/components/GradeReportModal'
import RecommendationsPanel from '@/components/RecommendationsPanel'
import { UpcomingCalendarBanner } from '@/components/UpcomingCalendarBanner'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import User from '@/models/User'
import classes from '@/styles/Index.module.css'
import { AddClassesFormValues, IClass, IClassReview, ICourseOption, IUser } from '@/types'
import { buildTermCode, compareTermsSequential, formatAcademicYear, formatTermDisplay, getTermLabel, TERM_SELECT_OPTIONS } from '@/utils/formatTerm'
import { formatCourseOptionCode } from '@/utils/courseOptions'
import mongoConnection from '@/utils/mongoConnection'
import { Accordion, ActionIcon, Alert, Anchor, Badge, Button, Container, Divider, Grid, Group, LoadingOverlay, Modal, Select, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import ui from '@/styles/Interface.module.css'
import { GetServerSideProps } from 'next'
import { Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import { useRouter } from 'next/router'
import authOptions from "@/pages/api/auth/[...nextauth]"
import { useEffect, useRef, useState } from 'react'
import { auth } from '@/utils/auth'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'

const Home: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ session, userProp, reviewsProp, academicYearsProp }) => {

  const academicYears = [...new Set(userProp.classesTaken.map((classTaken: IClass) => classTaken.academicYear))]
  const sortedAcademicYears = [...academicYears].sort((a, b) => a - b)
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'
  const allAcademicYears = academicYearsProp.map((academicYear: number) => ({ value: academicYear.toString(), label: formatAcademicYear(academicYear) }))
  const router = useRouter()
  const reviewQueueRef = useRef<HTMLDivElement>(null)

  const fullReviewCount = reviewsProp.filter((review) => !review.partial).length
  const needsReview = userProp.classesTaken
    .map((classTaken: IClass) => {
      const review = reviewsProp.find((item) => item.class._id === classTaken._id)
      const status = !review ? 'none' : review.partial ? 'partial' : 'full'
      return { classTaken, review, status }
    })
    .filter((item) => item.status !== 'full')
    .sort((a, b) => compareTermsSequential(b.classTaken.term, a.classTaken.term))

  const needsReviewCount = needsReview.length
  const hasClasses = userProp.classesTaken.length > 0
  const hasRecentReport = hasRecentGradeReport(userProp.lastGradeReportUpload)
  const reviewQueuePreviewCount = 3
  const classCount = userProp.classesTaken.length
  const courseAffiliationLabels = (userProp.courseAffiliation ?? [])
    .filter((course): course is ICourseOption => Boolean(course && typeof course === 'object' && 'departmentCode' in course))
    .map((course) => formatCourseOptionCode(course))
  const studentStatusLabel = userProp.year === 'G'
    ? 'Graduate student'
    : userProp.classOf
      ? `Class of ${userProp.classOf}`
      : null
  const heroDetailParts = [
    ...courseAffiliationLabels,
    studentStatusLabel,
    userProp.affiliation && userProp.affiliation !== 'student' ? userProp.affiliation : null,
  ].filter(Boolean) as string[]

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const now = new Date()
  const defaultAcademicYear = now.getFullYear().toString()
  const [academicYearTaken, setAcademicYearTaken] = useState<string | null>(
    allAcademicYears.some((year) => year.value === defaultAcademicYear)
      ? defaultAcademicYear
      : allAcademicYears[allAcademicYears.length - 1].value
  )
  const [selectedTerm, setSelectedTerm] = useState<string | null>(now.getMonth() < 5 ? 'FA' : 'SP')
  const [contentLoading, setContentLoading] = useState<boolean>(false)
  const [modalOpened, setModalOpened] = useState(false)
  const [reviewQueueOpen, setReviewQueueOpen] = useState(false)
  const [greeting, setGreeting] = useState('Hello')

  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening')
  }, [])

  const [degreeTermsModalOpened, setDegreeTermsModalOpened] = useState(false)
  const [degreeTermsReviewed, setDegreeTermsReviewed] = useState(
    ((userProp?.year === 'G') && (userProp?.programTerms?.length ?? 0) > 0) || false
  )

  // Sync degreeTermsReviewed when grad has already assigned terms (e.g. in LockdownModule)
  useEffect(() => {
    if (userProp?.year === 'G' && (userProp?.programTerms?.length ?? 0) > 0 && !degreeTermsReviewed) {
      setDegreeTermsReviewed(true)
    }
  }, [userProp?.year, userProp?.programTerms, degreeTermsReviewed, setDegreeTermsReviewed])

  const [gradeReportModalOpened, { open: openGradeReportModal, close: closeGradeReportModal }] = useDisclosure(false)

  // Check eligibility based on student level 'G' (handles early grad with no course affiliation)
  const isEligibleForDegreeTerms = userProp?.year === 'G'

  const hasAssignedTerms = userProp.programTerms && userProp.programTerms.length > 0

  const form = useForm<AddClassesFormValues>({
    initialValues: {
      classes: {},
      flatClasses: []
    },

    transformValues: (values) => ({
      ...values,
      flatClasses: Object.values(values.classes).flat()
    })
  })

  // if either academicYearTaken or selectedTerm changes, we need to reset the form values
  useEffect(() => {
    form.setValues({
      classes: {}
    })
  }, [academicYearTaken, selectedTerm])

  async function addClasses(values: AddClassesFormValues) {
    console.log(values)
    setContentLoading(true)
    const classesTaken = values.flatClasses.map((classId: string) => ({ _id: classId }))

    await fetch('/api/me/classes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        classesTaken
      })
    }).then(async (res) => {
      const body = await res.json()
      console.log(body, res.ok, body.success)
      if (res.ok) {
        showNotification({
          title: 'Classes added!',
          message: 'Your classes have been added.',
          color: 'green'
        })

        form.reset()
      } else {
        showNotification({
          title: 'Error adding classes',
          message: body.message,
          color: 'red'
        })
      }
      setContentLoading(false)
    })

    router.replace(router.asPath)
  }

  async function deleteClass(classId: string) {
    setContentLoading(true)

    await fetch('/api/me/classes', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        classId
      })
    }).then(async (res) => {
      const body = await res.json()

      if (res.ok) {
        showNotification({
          title: 'Class removed!',
          message: 'Your class has been removed.',
          color: 'purple'
        })
      } else {
        showNotification({
          title: 'Error removing class',
          message: body.message,
          color: 'red'
        })
      }
      setContentLoading(false)
    })

    router.replace(router.asPath)
  }

  const DeleteClassModal = ({ classTaken }: { classTaken: IClass }) => {
    const [opened, { open, close }] = useDisclosure(false)
    return (
      <>
        <ActionIcon variant="subtle" color="red" radius="md" onClick={open} className={classes.deleteAction}>
          <IconCircleX size="1rem" />
        </ActionIcon>
        <Modal opened={opened} onClose={close} title="Remove class from history?">
          <Stack gap="lg">
            <Text>
              Are you sure you want to remove <Text span fw={600}>{classTaken.subjectTitle}</Text> ({formatTermDisplay(classTaken.term)}) from your class history? This will not delete your review for the class. Contact <Anchor href="mailto:opengrades@mit.edu">opengrades@mit.edu</Anchor> if you need a review removed.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>Cancel</Button>
              <Button color="red" onClick={() => classTaken._id && deleteClass(classTaken._id)}>Remove class</Button>
            </Group>
          </Stack>
        </Modal>
      </>
    )
  }

  const handleAddClassesFromModal = async (classes: { [key: string]: IClass[] }, partialReviews: { class: string; letterGrade: string; droppedClass: boolean, firstYear: boolean }[]) => {
    const flatClasses = Object.values(classes).flat().map((c: IClass) => ({ _id: c._id }))

    setContentLoading(true)
    try {
      const response = await fetch('/api/me/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classesTaken: flatClasses,
          partialReviews
        }),
      })

      const body = await response.json()

      if (response.ok) {
        showNotification({
          title: 'Classes added!',
          message: 'Your classes have been added successfully.',
          color: 'green',
        })

        // Merge parsed classes into form's state
        const classIdsByTerm = Object.entries(classes).reduce<Record<string, string[]>>((acc, [term, classList]) => {
          acc[term] = classList
            .map((c) => c._id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
          return acc
        }, {})

        form.setValues((prevValues) => ({
          ...prevValues,
          classes: {
            ...prevValues.classes,
            ...classIdsByTerm,
          },
        }))
      } else {
        showNotification({
          title: 'Error adding classes',
          message: body.message,
          color: 'red',
        })
      }
    } catch (error) {
      showNotification({
        title: 'Error!',
        message: 'Failed to add classes.',
        color: 'red',
      })
    } finally {
      setContentLoading(false)
      router.replace(router.asPath) // Refresh data
    }
  }

  const getReviewBadge = (reviewForClass?: IClassReview) => {
    if (!reviewForClass) {
      return <Badge size="xs" variant="light" color="gray">Review</Badge>
    }
    if (reviewForClass.partial) {
      return <Badge size="xs" variant="light" color="yellow">Partial</Badge>
    }
    return null
  }

  const groupClassesByTerm = (classesTaken: IClass[]) => {
    const byTerm = new Map<string, IClass[]>()

    for (const classTaken of classesTaken) {
      const term = classTaken.term || 'unknown'
      const existing = byTerm.get(term) ?? []
      existing.push(classTaken)
      byTerm.set(term, existing)
    }

    return Array.from(byTerm.entries())
      .sort(([termA], [termB]) => compareTermsSequential(termA, termB))
      .map(([term, termClasses]) => ({
        term,
        termClasses: termClasses.sort((a, b) => a.subjectNumber.localeCompare(b.subjectNumber)),
      }))
  }

  const visibleNeedsReview = reviewQueueOpen ? needsReview : needsReview.slice(0, reviewQueuePreviewCount)

  return (
    <Container size="lg" px="md" className={ui.page}>
      <Head>
        <title>MIT OpenGrades</title>
        <meta name="description" content="Manage your classes, reviews, and profile on MIT OpenGrades." />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <Stack className={classes.pageStack}>
        <header className={ui.hero}>
          <Title order={1} className={ui.heroTitle}>{greeting}, {firstName}</Title>
          {heroDetailParts.length > 0 && (
            <Text className={ui.heroSubtitle}>
              {heroDetailParts.join(' · ')}
            </Text>
          )}
          {hasClasses && (
            <Text className={classes.statusLine}>
              You&apos;ve reviewed {fullReviewCount} of your {classCount} {classCount === 1 ? 'class' : 'classes'}
              {needsReviewCount > 0 ? (
                <>
                  {' — '}
                  <button type="button" className={classes.statusLink} onClick={() => scrollToSection(reviewQueueRef)}>
                    {needsReviewCount} {needsReviewCount === 1 ? 'is' : 'are'} still waiting on you
                  </button>
                  .
                </>
              ) : (
                <> — you&apos;re all caught up.</>
              )}
            </Text>
          )}
        </header>

        <UpcomingCalendarBanner />

        {!hasClasses && (
          <section className={`${ui.sectionCard} ${classes.panel} ${classes.getStarted}`}>
            <div>
              <Title order={3} className={ui.sectionTitle}>Get started</Title>
              <Text className={classes.text} mt="xs">Upload your grade report to import your classes.</Text>
            </div>
            <Button onClick={() => setModalOpened(true)}>Upload grade report</Button>
          </section>
        )}

        {hasClasses && !hasRecentReport && (
          <Alert variant="light" color="orange" title="Grade report out of date" className={classes.alertBanner}>
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Text size="sm">Re-upload your grade report to keep Discover and recommendations current.</Text>
              <Button size="sm" variant="light" onClick={() => setModalOpened(true)}>Upload grade report</Button>
            </Group>
          </Alert>
        )}

        {isEligibleForDegreeTerms && !degreeTermsReviewed && (
          <Alert
            variant="light"
            color="grape"
            title="Graduate degree program assignment"
            icon={<IconCircleCheck size={20} />}
            className={classes.alertBanner}
          >
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Text size="sm">Assign semesters to your undergrad or grad program for Who&apos;s Taken What.</Text>
              <Button size="sm" variant="light" onClick={() => setDegreeTermsModalOpened(true)}>
                {hasAssignedTerms ? 'Edit assignments' : 'Assign terms'}
              </Button>
            </Group>
          </Alert>
        )}

        <Grid className={classes.summaryGrid}>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="md">
        {needsReview.length > 0 && (
          <section ref={reviewQueueRef} className={`${ui.sectionCard} ${classes.panel}`}>
            <div className={classes.panelHeader}>
              <Title order={3} className={`${ui.sectionTitle} ${classes.sectionHeading}`}>
                Waiting on your review
              </Title>
              {needsReviewCount > reviewQueuePreviewCount && (
                <Button
                  variant="subtle"
                  size="compact-sm"
                  color="brick"
                  onClick={() => setReviewQueueOpen((open) => !open)}
                >
                  {reviewQueueOpen ? 'Show less' : 'Show all'}
                </Button>
              )}
            </div>

            <div className={classes.reviewQueueList}>
              {visibleNeedsReview.map(({ classTaken, status }) => (
                <UnstyledButton
                  key={classTaken._id}
                  className={classes.reviewQueueItem}
                  onClick={() => router.push(`/classes/${classTaken._id}`)}
                >
                  <Text span className={classes.reviewQueueNumber}>{classTaken.subjectNumber}</Text>
                  <Text span className={classes.reviewQueueTitle} lineClamp={1}>
                    {classTaken.subjectTitle}
                  </Text>
                  <Badge size="xs" variant="light" color={status === 'partial' ? 'yellow' : 'gray'}>
                    {status === 'partial' ? 'Partial' : formatTermDisplay(classTaken.term)}
                  </Badge>
                </UnstyledButton>
              ))}
            </div>
          </section>
        )}

        {hasClasses && (
          <section className={`${ui.sectionCard} ${classes.panel}`} style={{ position: 'relative' }}>
            <LoadingOverlay visible={contentLoading} />
            <div className={classes.panelHeader}>
              <Title order={3} className={`${ui.sectionTitle} ${classes.sectionHeading}`}>Classes taken</Title>
            </div>

            <Accordion
              variant="default"
              className={classes.accordion}
              defaultValue={sortedAcademicYears.length > 0 ? sortedAcademicYears[sortedAcademicYears.length - 1].toString() : undefined}
            >
              {sortedAcademicYears.slice().reverse().map((academicYear: number) => {
                const classesTakenInAcademicYear = userProp.classesTaken.filter((classTaken: IClass) => classTaken.academicYear === academicYear)

                return (
                  <Accordion.Item value={academicYear.toString()} key={academicYear}>
                    <Accordion.Control>{formatAcademicYear(academicYear)}</Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="md" className={classes.classList}>
                        {groupClassesByTerm(classesTakenInAcademicYear as IClass[]).map(({ term, termClasses }) => (
                          <div className={classes.termSection} key={term}>
                            <Text className={classes.termHeader} size="sm" fw={600}>
                              {getTermLabel(term, { withEmoji: true })}
                            </Text>
                            <Stack gap={2}>
                              {termClasses.map((classTaken: IClass) => {
                                const reviewForClass = reviewsProp.find((review: IClassReview) => review.class._id === classTaken._id)
                                const reviewBadge = getReviewBadge(reviewForClass)

                                return (
                                  <div className={classes.classRow} key={classTaken._id}>
                                    <button
                                      type="button"
                                      className={classes.classRowButton}
                                      onClick={() => router.push(`/classes/${classTaken._id}`)}
                                    >
                                      {reviewBadge}
                                      <Text span className={classes.classNumber}>{classTaken.subjectNumber}</Text>
                                      <Text span className={classes.classTitle}>{classTaken.subjectTitle}</Text>
                                    </button>
                                    <DeleteClassModal classTaken={classTaken} />
                                  </div>
                                )
                              })}
                            </Stack>
                          </div>
                        ))}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                )
              })}
            </Accordion>
          </section>
        )}

            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="md">
            <section className={`${ui.sectionCard} ${classes.panel} ${classes.columnPanel}`} style={{ position: 'relative' }}>
              <LoadingOverlay visible={contentLoading} />
              <div className={classes.panelHeader}>
                <Title order={3} className={`${ui.sectionTitle} ${classes.sectionHeading}`}>Add classes</Title>
              </div>

              <form onSubmit={form.onSubmit(() => addClasses(form.getTransformedValues()))}>
                <Stack gap="sm" mt="sm">
                  <Button type="button" variant={hasClasses ? 'default' : 'filled'} onClick={() => setModalOpened(true)}>
                    Upload grade report
                  </Button>
                  <GradeReportModal opened={modalOpened} onClose={() => setModalOpened(false)} onAddClasses={handleAddClassesFromModal} />

                  <Divider className={classes.formDivider} label="Or add manually" labelPosition="left" />

                  <Grid>
                    <Grid.Col span={6}>
                      <Select
                        allowDeselect={false}
                        placeholder="Academic year"
                        label="Academic year"
                        data={allAcademicYears}
                        value={academicYearTaken}
                        onChange={(val) => setAcademicYearTaken(val || '')}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Select
                        allowDeselect={false}
                        placeholder="Term"
                        label="Term"
                        data={TERM_SELECT_OPTIONS}
                        value={selectedTerm}
                        onChange={(val) => setSelectedTerm(val || '')}
                      />
                    </Grid.Col>
                  </Grid>

                  <ClassSearch
                    term={academicYearTaken && selectedTerm ? buildTermCode(academicYearTaken, selectedTerm) : ''}
                    display={academicYearTaken && selectedTerm ? formatTermDisplay(buildTermCode(academicYearTaken, selectedTerm)) : ''}
                    form={form}
                  />
                  <Button
                    type="submit"
                    variant="default"
                    disabled={form.getTransformedValues().flatClasses?.length === 0}
                  >
                    Add selected classes
                  </Button>
                </Stack>
              </form>
            </section>
              <RecommendationsPanel />
            </Stack>
          </Grid.Col>
        </Grid>


      </Stack>

      <GradeReportModal opened={gradeReportModalOpened} onClose={closeGradeReportModal} onAddClasses={handleAddClassesFromModal} />
      <DegreeTermsModal
        opened={degreeTermsModalOpened}
        onClose={() => {
          setDegreeTermsModalOpened(false)
          // Only mark as reviewed when user explicitly closes/cancels
          // setDegreeTermsReviewed(true)
        }}
        onSave={() => {
          // Refresh page data to update user profile
          router.reload()
        }}
      />
    </Container>
  )
}

interface ServerSideProps {
  session: any,
  userProp: IUser & { referredBy: { kerb: string } },
  reviewsProp: IClassReview[],
  academicYearsProp: number[],
}

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (context) => {
  await mongoConnection()
  console.log("attempting to fetch session")

  const session = await auth(context.req, context.res)

  if (session) {
    if (session.user && session.user?.email) {
      const user = await User.findOne({ email: session.user.email }).populate<{
        referredBy: { kerb: string }
      }>([
        { path: 'classesTaken', select: '-description' },
        {
          path: 'referredBy', select: 'kerb'
        },
        {
          path: 'courseAffiliation'
        }
      ]).lean()
      const academicYears = await Class.find().select('academicYear').distinct('academicYear').lean() as number[]
      let reviews = []
      if (user) {
        if (Array.isArray(user.classesTaken)) {
          user.classesTaken = user.classesTaken.filter(Boolean)
        }
        if (Array.isArray(user.courseAffiliation)) {
          user.courseAffiliation = user.courseAffiliation.filter(Boolean)
        }
        reviews = await ClassReview.find({ author: user._id }).populate<IClass>('class').lean()
      }

      return {
        props: {
          session: JSON.parse(JSON.stringify(session)),
          userProp: JSON.parse(JSON.stringify(user)),
          reviewsProp: JSON.parse(JSON.stringify(reviews)),
          academicYearsProp: JSON.parse(JSON.stringify(academicYears)),
        }
      }
    }
  }

  return {
    props: {} as ServerSideProps
  }
}

export default Home
