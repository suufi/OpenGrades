// @ts-nocheck

import type { InferGetServerSidePropsType, NextPage } from 'next'
import Head from 'next/head'

// import type {
//   Session,
// } from "@auth/core/types"
import ClassSearch from '@/components/ClassSearch'
import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import User from '@/models/User'
import classes from '@/styles/Home.module.css'
import { IClass, IClassReview, IUser } from '@/types'
import mongoConnection from '@/utils/mongoConnection'
import { Accordion, ActionIcon, Anchor, Button, Card, Collapse, Container, Divider, Flex, Grid, Group, List, LoadingOverlay, Modal, MultiSelect, Select, Space, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { IconCircleCheck, IconCircleX } from '@tabler/icons'
import { GetServerSideProps } from 'next'
import { Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import { useRouter } from 'next/router'
import authOptions from "pages/api/auth/[...nextauth]"
import { useEffect, useState } from 'react'

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

const Home: NextPage<InferGetServerSidePropsType<typeof getServerSideProps>> = ({ session, userProp, reviewsProp, academicYearsProp }) => {

  const academicYears = [...new Set(userProp.classesTaken.map((classTaken: IClass) => classTaken.academicYear))]
  const allAcademicYears = academicYearsProp.map((academicYear: number) => ({ value: academicYear.toString(), label: `${academicYear - 1} - ${academicYear}` }))
  const router = useRouter()

  const [academicYearTaken, setAcademicYearTaken] = useState<string | null>(allAcademicYears[0].value)
  const [selectedTerm, setSelectedTerm] = useState<string | null>('FA')
  const [contentLoading, setContentLoading] = useState<boolean>(false)
  const [flagExplanation, setFlagExplanation] = useState<boolean>(false)

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


  return (
    <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
      <Head>
        <title>MIT OpenGrades</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Title>
        Hello, {session?.user?.name.split(' ')[0]}! 👋🏾
      </Title>

      <Space h="lg" />
      {/* Generate a dashboard listing of classes the person has taken in the past and allow them to add more */}

      <Grid>
        <Grid.Col span={{ md: 6 }}>
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
                              const reviewForClass = reviewsProp.find((review: IClassReview) => review.class._id === classTaken._id)

                              return (
                                <List.Item
                                  // className={classes.linkedText}
                                  key={classTaken._id}
                                  icon={reviewForClass && <ThemeIcon color="green" size={24} radius="xl"> <IconCircleCheck size="1rem" /> </ThemeIcon>}
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
              You have written {reviewsProp.length} reviews.
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
      const user = await User.findOne({ email: session.user.email }).populate('classesTaken').lean()
      const reviews = await ClassReview.find({ author: (user as IUser)._id }).populate('class').lean()
      const academicYears = await Class.find().select('academicYear').distinct('academicYear').lean()

      return {
        props: {
          session: JSON.parse(JSON.stringify(session)),
          userProp: JSON.parse(JSON.stringify(user)),
          reviewsProp: JSON.parse(JSON.stringify(reviews)),
          academicYearsProp: JSON.parse(JSON.stringify(academicYears))
        }
      }
    }
  }

  return {
    redirect: {
      destination: '/api/auth/signin',
      permanent: false
    }
  }
}

export default Home
