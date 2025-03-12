
// @ts-nocheck

import type { InferGetServerSidePropsType, NextPage } from 'next'
import Head from 'next/head'

// import type {
//   Session,
// } from "@auth/core/types"
import ClassSearch from '@/components/ClassSearch'
import GradeReportModal from '@/components/GradeReportModal'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import User from '@/models/User'
import classes from '@/styles/Index.module.css'
import { IClass, IClassReview, IUser } from '@/types'
import mongoConnection from '@/utils/mongoConnection'
import { Accordion, ActionIcon, Alert, Anchor, Button, Card, Collapse, Container, Divider, Flex, Grid, Group, List, LoadingOverlay, Modal, MultiSelect, Select, Space, Stack, Text, TextInput, ThemeIcon, Title, Transition } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDebouncedState, useDisclosure, useLocalStorage, useMounted } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { IconCheck, IconCircleCheck, IconCircleX, IconQuestionMark } from '@tabler/icons'
import { GetServerSideProps } from 'next'
import { Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import { useRouter } from 'next/router'
import authOptions from "pages/api/auth/[...nextauth]"
import { useEffect, useState } from 'react'
import { News } from 'tabler-icons-react'

const scaleY = {
  in: { opacity: 1, transform: 'scaleY(1)' },
  out: { opacity: 0, transform: 'scaleY(0)' },
  common: { transformOrigin: 'top' },
  transitionProperty: 'transform, opacity',
}

function getEmojiForTerm (term: string) {
  term = term.substring(4)
  switch (term) {
    case 'FA':
      return '🍁'
    case 'SP':
      return '🌸'
    case 'JA':
      return '❄️'
    default:
      return ''
  }
}

interface FormValues {
  classes: {
    [key: string]: string[]
  },
  flatClasses?: string[]
}

const Home: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ session, userProp, reviewsProp, academicYearsProp, referralsProp }) => {

  const academicYears = [...new Set(userProp.classesTaken.map((classTaken: IClass) => classTaken.academicYear))]
  const allAcademicYears = academicYearsProp.map((academicYear: number) => ({ value: academicYear.toString(), label: `${academicYear - 1} - ${academicYear}` }))
  const router = useRouter()

  const [academicYearTaken, setAcademicYearTaken] = useState<string | null>(allAcademicYears[0].value)
  const [selectedTerm, setSelectedTerm] = useState<string | null>('FA')
  const [contentLoading, setContentLoading] = useState<boolean>(false)
  const [flagExplanation, setFlagExplanation] = useState<boolean>(false)
  const [referredBy, setReferredBy] = useDebouncedState<string>('', 500)
  const [referredByState, setReferredByState] = useState<State>({ data: '', status: 'initial' })

  const [newsOpen, setNewsOpen] = useLocalStorage({
    key: 'newsOpen.3-12-2025',
    defaultValue: true,
    getInitialValueInEffect: true
  })


  async function verifyReferralKerb (kerb: string) {
    const res = await fetch(`/api/me/referral-kerb?kerb=${kerb}`)
    const body = await res.json()
    if (res.ok && body.data) {
      setReferredByState({ data: body.data, status: 'success' })
      return body.data
    } else {
      setReferredByState({ data: body.message || 'That kerb is not registered on OpenGrades. Maybe you can refer them?', status: 'error' })
      return false
    }
  }

  useEffect(() => {
    if (referredBy.length === 0) return
    verifyReferralKerb(referredBy)
  }, [referredBy])


  const form = useForm<FormValues>({
    initialValues: {
      classes: {}
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

  async function addClasses (values: any) {
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

  async function deleteClass (classId: string) {
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

  async function updateFlags (flags: string[]) {

    await fetch('/api/me/flags', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        flags
      })
    }).then(async (res) => {
      const body = await res.json()

      if (res.ok) {
        showNotification({
          title: 'Flags updated!',
          message: 'Your flags have been updated.',
          color: 'purple'
        })
      } else {
        showNotification({
          title: 'Error updating flags',
          message: body.message,
          color: 'red'
        })
      }
    })

    router.replace(router.asPath)
  }

  async function updateReferral (kerb: string) {
    await fetch('/api/me/referral', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        referredBy: kerb
      })
    }).then(async (res) => {
      const body = await res.json()

      if (res.ok) {
        showNotification({
          title: 'Referral updated!',
          message: 'Your referral has been updated.',
          color: 'purple'
        })
      } else {
        showNotification({
          title: 'Error updating referral',
          message: body.message,
          color: 'red'
        })
      }
    })

    router.replace(router.asPath)
  }

  const DeleteClassModal = ({ classTaken }: { classTaken: IClass }) => {
    const [opened, { open, close }] = useDisclosure(false)
    return (
      <>
        <ActionIcon variant="transparent" color="red" radius="xl" onClick={open}>
          <IconCircleX size="1rem" />
        </ActionIcon>
        <Modal opened={opened} onClose={close} title="Class Deletion">
          <Text> Are you sure you want to delete <b>{classTaken.subjectTitle}</b> (<i>{`${classTaken.academicYear - 1}-${classTaken.term}`}</i>) from your class history? This will remove the class from classes you've taken. This will not delete your review (if any) for the class, however. Please contact <Anchor href="mailto:opengrades@mit.edu">opengrades@mit.edu</Anchor> to delete your review.</Text>
          <Space h='lg' />
          <Group justify={'center'}>
            <Button onClick={close}> Cancel </Button>
            <Button color='red' onClick={() => classTaken._id && deleteClass(classTaken._id)}> Confirm </Button>
          </Group>
        </Modal>
      </>
    )
  }

  const [modalOpened, setModalOpened] = useState(false)

  const handleAddClassesFromModal = async (classes: { [key: string]: IClass[] }, partialReviews: { class: string; letterGrade: string; dropped: boolean, firstYear: boolean }[]) => {
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
        form.setValues((prevValues) => ({
          ...prevValues,
          classes: {
            ...prevValues.classes,
            ...classes,
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

  const isMounted = useMounted()

  return (
    <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
      <Head>
        <title>MIT OpenGrades</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <Title>
        Hello, {session?.user?.name.split(' ')[0]}! 👋🏾
      </Title>

      <Space h="lg" />
      {/* Generate a dashboard listing of classes the person has taken in the past and allow them to add more */}

      <Grid>
        <Grid.Col span={{ md: 6 }}>
          {
            isMounted &&
            <>
              <Transition
                duration={500}
                timingFunction="ease"
                transition={scaleY}
                mounted={newsOpen}
              >
                {
                  (transitionStyle) => (
                    <>
                      <Alert variant='light' color='blue' title='Bulletin' withCloseButton icon={<News size={24} />} onClose={() => setNewsOpen(false)} style={{ ...transitionStyle }}>
                        <Title order={6}> March 12, 2025 </Title>
                        <Text className={classes.text} c='gray'>
                          👨🏽‍🎓 Who's Taken What page to see what classes other people have taken for each major and term. <br />
                          📊 Statistics page! See the best and worst rated departments.
                        </Text>
                        <Title order={6}> January 25, 2025 </Title>
                        <Text className={classes.text} c='gray'>
                          🔎 Searching is significantly faster and now powered by ElasticSearch. Filters and sorting are improved. List view is now available. <br />
                          📚 Spring 2025 classes have been uploaded, but are not yet reviewable. Toggle advanced search settings to view. <br />
                          ℹ️ About Page created with information about OpenGrades, its maintainers + supporters, and some fun 'real-time' statistics.
                        </Text>
                        <Space h="md" />
                      </Alert>
                      <Space h="lg" />
                    </>
                  )
                }
              </Transition>
            </>
          }

          <Card>
            <LoadingOverlay visible={contentLoading} />
            <Title order={3}> 📚 Classes Taken </Title>
            <Space h="sm" />
            {
              (userProp.classesTaken.length === 0) &&
              <Text className={classes.text}> You haven&apos;t reported any classes yet! Use the add form on the right side to add classes! </Text>
            }
            <Accordion variant={'contained'} defaultValue={academicYears.length > 0 ? academicYears[academicYears.length - 1].toString() : "None"}>
              {
                academicYears.reverse().map((academicYear: number) => {
                  let classesTakenInAcademicYear = userProp.classesTaken.filter((classTaken: IClass) => classTaken.academicYear === academicYear)

                  return (
                    <Accordion.Item value={academicYear.toString()} key={academicYear}>
                      <Accordion.Control> {academicYear - 1} - {academicYear} </Accordion.Control>
                      <Accordion.Panel>
                        <List
                          icon={
                            <ThemeIcon color="red" size={24} radius="xl">
                              <IconCircleX size="1rem" />
                            </ThemeIcon>
                          }
                          spacing="xs"
                        >
                          {
                            classesTakenInAcademicYear.sort((a: IClass, b: IClass) => {
                              if (a.term < b.term) { return -1 }
                              if (a.term > b.term) { return 1 }
                              return 0
                            }).map((classTaken: IClass) => {
                              const reviewForClass = reviewsProp.find((review: IClassReview) => (review.class._id === classTaken._id))

                              const icon = reviewForClass ? reviewForClass?.partial ?
                                <ThemeIcon color='yellow' size={24} radius='xl'>
                                  <IconQuestionMark size='1rem' />
                                </ThemeIcon>
                                : <ThemeIcon color="green" size={24} radius="xl">
                                  <IconCircleCheck size="1rem" />
                                </ThemeIcon> : null


                              return (
                                <List.Item
                                  // className={classes.linkedText}
                                  key={classTaken._id}
                                  icon={icon}
                                >
                                  <Flex align={'center'}>
                                    <Text className={classes.linkedText} onClick={() => router.push(`/classes/${classTaken._id}`)}>
                                      {getEmojiForTerm(classTaken.term)} {classTaken.subjectNumber}: {classTaken.subjectTitle}
                                    </Text>

                                    {/* Delete class button */}
                                    <DeleteClassModal classTaken={classTaken} />
                                  </Flex>
                                </List.Item>
                              )
                            })
                          }
                        </List>
                      </Accordion.Panel>
                    </Accordion.Item>
                  )
                })
              }

            </Accordion>

          </Card>
        </Grid.Col>
        <Grid.Col span={{ md: 6 }}>
          <Card>
            <Title order={3}> ➕ Add Classes </Title>
            <form onSubmit={form.onSubmit((values) => addClasses(form.getTransformedValues()))}>
              <Stack gap="xs">
                <Grid>
                  <Grid.Col span={6}>
                    <Select allowDeselect={false} placeholder="Academic year" label="Academic Year" data={allAcademicYears} value={academicYearTaken} onChange={setAcademicYearTaken} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Select allowDeselect={false} placeholder="Term" label="Term" data={[{ value: 'FA', label: '🍁 Fall' }, { value: 'SP', label: '🌸 Spring' }, { value: 'JA', label: '❄️ IAP' }]} value={selectedTerm} onChange={setSelectedTerm} />
                  </Grid.Col>
                </Grid>
                <Divider variant='dotted' label={"Select your classes"} />
                <ClassSearch term={academicYearTaken && selectedTerm ? academicYearTaken + selectedTerm : ""} display={`${Number(academicYearTaken) - 1}-${academicYearTaken} ${selectedTerm}`} form={form as any} />
                <Button type="submit" disabled={
                  form.getTransformedValues().flatClasses?.length === 0
                }> Submit </Button>
                <Divider variant='dotted' label={"Or paste your grade report"} />
                <Button variant='outline' onClick={() => setModalOpened(true)}> Add Classes from Grade Report </Button>
                <GradeReportModal opened={modalOpened} onClose={() => setModalOpened(false)} onAddClasses={handleAddClassesFromModal} />
              </Stack>
            </form>
          </Card>
          <Space h="lg" />
          <Card>
            <Title order={3}> ℹ️ About You! </Title>
            <Space h="sm" />
            <Text className={classes.text}>
              You have taken {userProp.classesTaken.length} classes.
            </Text>
            <Text className={classes.text}>
              You have {reviewsProp.length} reviews, {reviewsProp.filter((review) => review.partial).length} of which are partial.
            </Text>
            <Text className={classes.text}>
              You have {referralsProp} referrals.
            </Text>
            <Divider my='md' />
            <MultiSelect value={userProp.flags} onChange={(selected) => {
              updateFlags(selected)
            }} label='Identity Tags' description={<Text fz="sm" c='dimmed' style={{ cursor: 'pointer' }} onClick={() => setFlagExplanation(!flagExplanation)}> Please select identities that you identify with. Click me for more info! </Text>} data={[
              {
                value: 'First Gen',
                label: 'First Generation'
              },
              {
                value: 'Low Income',
                label: 'Low Income'
              },
              {
                value: 'International',
                label: 'International'
              },
              {
                value: 'BIL',
                label: 'Black, Native American/Indigenous, or Latino'
              }
            ]} />
            <Collapse in={flagExplanation}>
              <Space h="sm" />
              <Text c='dimmed' fz='sm'>
                The following field is optional. Data collected from this field will only be used in aggregate form to observe trends in classes where students of a particular background consistently have a less favorable experience compared to the overall rating of the class. If we do observe such a trend, we may reach out to the Office of Minority Education, student groups, and/or committees to identify and address issues regarding classes.
              </Text>
              <Space />
              <Text c="dimmed" fz="sm">
                The following definitions are used for the identity tags:
              </Text>
              <List withPadding>
                <List.Item> <Text c='dimmed' fz='sm'>First Generation: no parent in your household has received a Bachelor&apos;s degree or more in any country. </Text> </List.Item>
                <List.Item> <Text c='dimmed' fz='sm'>Low Income: you are a Pell-eligible student and/or your family EFC at MIT is &le; $5,000 </Text> </List.Item>
                <List.Item> <Text c='dimmed' fz='sm'>International: any student who does not hold United States citizenship or permanent residency, regardless of where they live or attend school.⁠ </Text> </List.Item>
              </List>
            </Collapse>
            <Divider my='md' />
          </Card>

          <Card style={{ marginTop: 'var(--mantine-spacing-lg)' }}>
            <Title order={3}> 🤝 Referral </Title>
            <Space h="sm" />
            {userProp.referredBy && <Text className={classes.text}> Referred by: {userProp.referredBy.kerb} </Text>}
            {
              !userProp.referredBy && (
                <>
                  <Text className={classes.text}> If you were referred by someone, please enter their kerb here. </Text>
                  <Stack gap="xs">
                    <TextInput defaultValue={referredBy} disabled={referredByState.status == 'loading'} onChange={(e) => setReferredBy(e.target.value)} error={referredByState.status == 'error' && referredByState.data} rightSectionPointerEvents='none' rightSection={referredByState.status == 'success' && <IconCheck color='green' />} label="OpenGrades Referral" placeholder='kerb' />
                    <Button onClick={() => updateReferral(referredBy)} disabled={referredByState.status != 'success'}> Update Referral </Button>
                  </Stack>
                </>
              )
            }
          </Card>
        </Grid.Col>
      </Grid>

    </Container >
  )
}

interface ServerSideProps {
  session: any,
  userProp: IUser,
  reviewsProp: IClassReview[],
  academicYearsProp: number[]
}

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (context) => {
  await mongoConnection()
  console.log("attempting to fetch session")
  // const session: Session | null = await auth(context.req, context.res)
  const session: Session | null = await getServerSession(context.req, context.res, authOptions)
  // const session = await auth(context.req, context.res
  console.log("session", session)
  console.log("user", session?.user)
  if (session) {
    if (session.user && session.user?.email) {
      const user = await User.findOne({ email: session.user.email }).populate([
        { path: 'classesTaken', select: '-description' },
        {
          path: 'referredBy', select: 'kerb'
        }
      ]).lean()
      const academicYears = await Class.find().select('academicYear').distinct('academicYear').lean()
      let reviews = []
      if (user) {
        reviews = await ClassReview.find({ author: (user as IUser)._id }).populate('class').lean()
      }
      const referralCount = await User.countDocuments({ referredBy: user._id })

      return {
        props: {
          session: JSON.parse(JSON.stringify(session)),
          userProp: JSON.parse(JSON.stringify(user)),
          reviewsProp: JSON.parse(JSON.stringify(reviews)),
          academicYearsProp: JSON.parse(JSON.stringify(academicYears)),
          referralsProp: referralCount
        }
      }
    }
  }

  return {
    // redirect: {
    // destination: '/api/auth/signin',
    // permanent: false
    // }
    props: {

    }
  }
}

export default Home
