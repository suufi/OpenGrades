
// @ts-nocheck

import { ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Checkbox, Container, Divider, Group, Input, LoadingOverlay, Modal, NumberInput, Paper, Rating, Select, Space, Stack, Stepper, Text, TextInput, Textarea, Title, em } from '@mantine/core'
import { useForm, zodResolver } from '@mantine/form'
import { useHotkeys, useMediaQuery } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import type { InferGetServerSidePropsType, NextPage } from 'next'
// import {  } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState } from 'react'

// eslint-disable-next-line camelcase

import { z } from 'zod'

import mongoConnection from '../../utils/mongoConnection'

import Class from '../../models/Class'
import ClassReview from '../../models/ClassReview'
import ContentSubmission from '../../models/ContentSubmission'
import Report from '../../models/Report'
import User from '../../models/User'

import { IClass, IClassReview, IContentSubmission, IParams, IReport, IUser, LetterGrade, TimeRange } from '../../types'

import GradeChart from '../../components/GradeChart'


import { IconAlertCircle, IconArrowDownCircle, IconArrowUpCircle } from '@tabler/icons'
import moment from 'moment-timezone'
import mongoose from 'mongoose'
import { Session, getServerSession } from 'next-auth'
import Link from 'next/link'
import authOptions from "pages/api/auth/[...nextauth]"
import { Eye, EyeOff, Flag2, Pencil, Plus } from 'tabler-icons-react'
import styles from '../../styles/ClassPage.module.css'

const RecommendationLevels: Record<number, string> = {
  1: 'Definitely not recommend',
  2: 'Unlikely to recommend',
  3: 'Recommend with reservations',
  4: 'Likely to recommend',
  5: 'Recommend with enthusiasm'
}

interface ClassReviewCommentProps {
  classReview: IClassReview,
  author: {
    name: string,
    hiddenName: string
  },
  reported: boolean,
  trustLevel: number,

  userVote: number | null // null for no vote, 1 for upvote, -1 for downvote
  upvotes: number
  downvotes: number
  onVoteChange: (vote: number) => void // Function to change the vote
}

interface ContentSubmissionForm extends Omit<IContentSubmission, 'class' | 'author' | 'approved' | 'createdAt' | 'updatedAt'> { }

interface ClassReviewForm extends Omit<IClassReview, 'class' | 'author' | 'createdAt' | 'updatedAt' | 'approved' | 'display' | 'verified'> { }

function HideContent ({ classId, classReview, contentSubmission, callback, hidden }: { classId?: string, classReview?: IClassReview, contentSubmission?: IContentSubmission, callback: Function, hidden: boolean }) {
  const [opened, setOpened] = useState(false)

  const goal = hidden ? 'Unhide' : 'Hide'

  async function toggleHide () {
    const url = contentSubmission ? `/api/classes/${classId}/content/${contentSubmission._id}` : `/api/classes/${classId}/reviews/${classReview?._id}`
    const body = contentSubmission ? {
      approved: hidden
    } : {
      display: hidden
    }
    await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `${goal.substring(0, goal.length - 1)} ${contentSubmission ? 'content submission' : 'class review'}`
        })
        callback(!hidden)
        setOpened(false)
      } else {
        showNotification({
          title: 'Failure!',
          message: body.message
        })
      }
    })
  }

  return (
    <>
      <ActionIcon variant='outline' radius='xl' color='red' onClick={() => setOpened(true)}>
        {!hidden ? <EyeOff size={20} /> : <Eye size={20} />}
      </ActionIcon>
      <Modal title={`${goal} this post?`} size='lg' centered opened={opened} onClose={() => setOpened(false)}>
        <Stack>
          <Text size='sm'> Are you sure you want to {goal.toLowerCase()} this post? </Text>
          <Group justify='flex-end'>
            <Button variant='default' onClick={() => setOpened(false)}> Cancel </Button>
            <Button variant='filled' size='sm' onClick={() => { toggleHide() }}> {goal} </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

function ClassReviewComment ({ classReview,
  author,
  reported,
  trustLevel,
  userVote,
  upvotes,
  downvotes,
  onVoteChange,
}: ClassReviewCommentProps) {
  const [showName, setShowName] = useState(false)
  const [hidden, setHidden] = useState(!classReview.display)

  const [previousVote, setPreviousVote] = useState(userVote) // Track previous vote state

  const handleVote = async (vote: number) => {
    let newVote = vote

    // If the user clicks on the already selected vote, unvote (reset to null)
    if (previousVote === vote) {
      newVote = 0
    }

    // Send the vote request to the API to register or update the vote
    const response = await fetch(`/api/classes/${classReview.class.toString()}/reviews/${classReview._id}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vote: newVote }),
    })

    const data = await response.json()
    if (response.ok && data.success) {
      onVoteChange(newVote)  // Update the vote state in the parent
      setPreviousVote(newVote)  // Update the previous vote state
    } else {
      showNotification({
        title: 'Error',
        message: data.message || 'An error occurred while casting your vote.',
        color: 'red',
      })
    }
  }


  async function deanon () {
    console.log("Denaonymizing user")
    if (!showName) {
      await fetch(`/api/auditlogs`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'DeanonymizeReview',
          description: `Deanonymized ${author.hiddenName}'s review for ${classReview.class.toString()}`
        })
      })
    }

    setShowName(!showName)
  }

  return (
    <Paper className={styles.comment} withBorder radius="md" >
      <Group>
        <Avatar alt={author.name} radius="xl" />
        <div>
          {
            trustLevel && trustLevel >= 2 ? <Text size="sm" className={styles.text} onClick={() => deanon()}>{showName ? author.hiddenName : author.name}</Text> : <Text size="sm" className={styles.text}>{author.name}</Text>
          }
          <Text size="xs" c="dimmed">
            {moment(classReview.createdAt).tz('America/New_York').format('MMMM DD, YYYY hh:mm a')}
          </Text>
          {(classReview.firstYear || classReview.retaking || classReview.droppedClass || trustLevel && trustLevel >= 2 && (reported || hidden)) && <Space h='sm' />}
          <Group gap='xs'>
            {classReview.firstYear && <Badge color={'indigo'} variant="filled">First Year</Badge>}
            {classReview.retaking && <Badge color={'green'} variant="filled">Retake</Badge>}
            {classReview.droppedClass && <Badge color={'yellow'} variant="filled">Dropped</Badge>}
            {
              trustLevel && trustLevel >= 2 && reported && <Badge color={'red'} variant="filled">Reported</Badge>
            }
            {
              trustLevel && trustLevel >= 2 && hidden && <Badge color={'orange'} variant="filled">Hidden</Badge>
            }
          </Group>
        </div>
      </Group>
      <Text className={`${styles.text} ${styles.commentBody}`} size="sm">
        <b> Overall Rating: </b> {classReview.overallRating}/7 <br />
        <b> Hours Per Week: </b> {classReview.hoursPerWeek} <br />
        <b> Recommendation: </b> {classReview.recommendationLevel} - {RecommendationLevels[classReview.recommendationLevel]} <br />
      </Text>
      <Text className={`${styles.text} ${styles.commentBody}`} size="sm">
        <Divider mb='sm' />
        Class Comments: <em> &ldquo;{classReview.classComments}&rdquo; </em> <br />
        Background Comments: <em> &ldquo;{classReview.backgroundComments}&rdquo; </em>
        {/* {body} */}
      </Text>
      {/* <Divider p='sm' /> */}
      <Group justify='flex-end'>
        {trustLevel && trustLevel >= 2 && <HideContent classId={classReview.class.toString()} hidden={hidden} classReview={classReview} callback={(val: boolean) => { setHidden(val) }} />}
        {(trustLevel && trustLevel >= 2) ? <ReportField classReview={classReview} callback={(val: boolean) => { setHidden(val) }} /> : <ReportField classReview={classReview} callback={() => { }} />}
        <Group gap="xs">
          <ActionIcon
            onClick={() => handleVote(1)}
            variant="transparent"
            color={userVote === 1 ? 'green' : 'gray'}
          >
            <IconArrowUpCircle size={20} />
          </ActionIcon>
          <Text>{upvotes - downvotes}</Text>
          <ActionIcon
            onClick={() => handleVote(-1)}
            variant="transparent"
            color={userVote === -1 ? 'red' : 'gray'}
          >
            <IconArrowDownCircle size={20} />
          </ActionIcon>
        </Group>

        {/* {trustLevel && trustLevel >= 2 && <DeleteContent classReview={id} />} */}
      </Group>
    </Paper>
  )
}

function ReportField ({ contentSubmission, classReview, callback }: { contentSubmission?: IContentSubmission, classReview?: Partial<IClassReview>, callback: Function }) {
  const [opened, setOpened] = useState(false)
  const [reason, setReason] = useState('')

  async function report () {
    await fetch(`/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contentSubmission: contentSubmission?._id,
        classReview: classReview?._id,
        reason
      })
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Reported ${contentSubmission ? 'content submission' : 'class review'}`
        })
        callback()
        setOpened(false)
        setReason('')
      } else {
        showNotification({
          title: 'Failure!',
          message: body.message
        })
      }
    })
  }

  return (
    <>
      <ActionIcon variant='outline' radius='xl' color='red' onClick={() => setOpened(true)}>
        <Flag2 size={20} />
      </ActionIcon>
      <Modal title={`Report a problem with ${contentSubmission ? "content submission" : "class review"}`} size='lg' centered opened={opened} onClose={() => setOpened(false)}>
        <Stack>
          <Text className={styles.text} size='sm'> Please use this form to report any issues with this content submission. This includes incorrect information, broken link, missing information, academic dishonesty, or any other issues you may have found. </Text>
          <Text className={styles.text} size='sm'> Thank you for helping us improve MIT OpenGrades! </Text>
          <Input placeholder='Please describe the issue you found.' value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
          <Button variant='filled' radius='xl' size='sm' onClick={report}> Submit </Button>
        </Stack>
      </Modal>
    </>
  )
}


interface AddReviewProps {
  classData: IClass
  refreshData: () => void
  editData?: IClassReview
}

function AddReview ({ classData, refreshData, editData }: AddReviewProps) {
  const [opened, setOpened] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState('')

  const [active, setActive] = useState(0)
  const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current))
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current))
  const isMobile = useMediaQuery(`(max-width: ${em(750)})`)

  const schema = z.object({
    overallRating: z.number().min(1).max(7),
    conditions: z.array(z.enum(['firstYear', 'dropped', 'retaking'])),
    hoursPerWeek: z.enum(['0-2 hours', '3-5 hours', '6-8 hours', '9-11 hours', '12-14 hours', '15-17 hours', '18-20 hours', '21-23 hours', '24-26 hours', '37-30 hours'], { invalid_type_error: 'Please select a number of hours for this class.' }),
    recommendationLevel: z.enum(['1', '2', '3', '4', '5'], { invalid_type_error: 'Please select a recommendation level.' }),
    classComments: z.string().min(5, 'Please type some more words.'),
    backgroundComments: z.string(),
    numericGrade: z.number().min(0).max(100),
    letterGrade: z.enum(['A', 'B', 'C', 'D', 'F', 'P', 'DR']),
    methodOfGradeCalculation: z.enum(['Canvas', 'MIT OpenGrades Spreadsheet', 'Self', 'Other', ''])
  }).partial({
    conditions: true,
    numericGrade: true,
    backgroundComments: true,
    methodOfGradeCalculation: true
  })

  const form = useForm({
    initialValues: editData
      ? {
        overallRating: editData.overallRating,
        conditions: [editData.firstYear && 'firstYear', editData.droppedClass && 'dropped', editData.retaking && 'retaking'].filter((entry) => entry !== false),
        hoursPerWeek: editData.hoursPerWeek as TimeRange,
        classComments: editData.classComments,
        backgroundComments: editData.backgroundComments,
        recommendationLevel: String(editData.recommendationLevel),
        numericGrade: editData.numericGrade,
        methodOfGradeCalculation: editData.methodOfGradeCalculation,
        letterGrade: editData.letterGrade
      }
      : {
        overallRating: 0,
        conditions: [],
        hoursPerWeek: 'Unknown' as TimeRange,
        classComments: '',
        backgroundComments: '',
        recommendationLevel: '',
        numericGrade: NaN,
        methodOfGradeCalculation: '',
        letterGrade: '' as LetterGrade
      },

    validateInputOnBlur: true,
    validate: zodResolver(schema),

    transformValues: (values) => ({
      ...values,
      recommendationLevel: Number(values.recommendationLevel),
      firstYear: (values.conditions as string[]).includes('firstYear'),
      retaking: (values.conditions as string[]).includes('retaking'),
      droppedClass: (values.conditions as string[]).includes('dropped')
    })
  })

  const postReview = async (values: ClassReviewForm) => {
    setFormLoading(true)
    await fetch(`/api/classes/${classData._id}/reviews`, {
      method: editData ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...values
      })
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Posted your review for ${classData.subjectNumber}`
        })
        refreshData()
        setOpened(false)
      } else {
        setError(body.message)
        setFormLoading(false)
      }
    })
    setFormLoading(false)
  }

  return (
    <>
      <Modal
        opened={opened}
        centered
        onClose={() => setOpened(false)}
        title={`${editData ? 'Edit' : 'Add'} Review for ${classData.subjectNumber}${(classData.aliases && classData.aliases.length > 0) ? `/${classData.aliases.join('/')}` : ''}`}
        size='lg'
      >
        <LoadingOverlay visible={formLoading} overlayProps={{ blur: 2 }} />
        <Group>
          {error.length > 0 && <Alert icon={<IconAlertCircle size={16} />} title="Oops, look like there are some problems!" color="red" style={{ width: '100%' }}>
            {error}
          </Alert>}
          <form onSubmit={form.onSubmit((values) => postReview(values))} style={{ width: '100%' }} >
            <Stepper active={active} onStepClick={setActive} orientation={isMobile ? 'vertical' : 'horizontal'}>
              <Stepper.Step label="Grade Information" description="Upload grades">
                <Stack>
                  <Text size={'sm'}> The numeric grade entered below helps us calculate a number line for grade cutoffs for this class. This is especially helpful for classes where cutoff data is not readily available. Every effort will be made to keep this data anonymous including reporting grade totals in aggregate. </Text>
                  <NumberInput
                    placeholder="Calculated grade in the class"
                    label="Numeric Grade"
                    description="Enter your calculated grade (to the hundredths place, if applicable)"
                    decimalScale={2}
                    {...form.getInputProps('numericGrade')}
                  />
                  <Select key="methodOfGradeCalculation" {...form.getInputProps('methodOfGradeCalculation')} placeholder="Select method of grade calculation" description={'This helps us verify data accuracy and the need for more spreadsheets.'} label="Method of Numeric Grade Calculation" data={['Self', 'MIT OpenGrades Spreadsheet', 'Canvas', 'Other']} />
                  <Select key="letterGrade" required withAsterisk {...form.getInputProps('letterGrade')} placeholder="Select the letter grade you received" description={'Please select the grade that shows up on your internal transcript.'} label="Letter Grade" data={classData.units.includes('P/D/F') ? ['P', 'D', 'F', 'DR'] : ['A', 'B', 'C', 'D', 'F', 'DR']} />
                </Stack>
              </Stepper.Step>
              <Stepper.Step label="Class Review" description="Tell us more about the class!">
                <Stack>
                  <Text fw={500} fz={14}>
                    Overall Rating ({form.values.overallRating}/7) <Space h="xs" /> <Rating count={7} {...form.getInputProps('overallRating')} />
                    {form.errors?.overallRating && <Text c={'red'} fs='italic'> Please select a rating. </Text>}
                  </Text>
                  <Checkbox.Group
                    label="Do any of the following apply to you?"
                    description="Please only select conditions that applied for this specific year and semester."
                    {...form.getInputProps('conditions')}
                  >
                    <Checkbox value="firstYear" label="Freshman Year" />
                    <Checkbox value="dropped" label="Dropped Class" />
                    <Checkbox value="retaking" label="Retaking" />
                  </Checkbox.Group>
                  <Select key="hoursPerWeek" required withAsterisk {...form.getInputProps('hoursPerWeek')} placeholder="Select the number of hours" label="Hours/week spent on classwork outside of lecture/recitation " data={['0-2 hours', '3-5 hours', '6-8 hours', '9-11 hours', '12-14 hours', '15-17 hours', '18-20 hours', '21-23 hours', '24-26 hours', '37-30 hours']} />
                  <Select key="recommendationLevel" required withAsterisk {...form.getInputProps('recommendationLevel')} placeholder="Select a recommendation level" label="How likely are you to recommend this class? " data={[{ value: '1', label: 'Definitely not recommend' }, { value: '2', label: 'Unlikely to recommend' }, { value: '3', label: 'Recommend with reservations' }, { value: '4', label: 'Likely to recommend' }, { value: '5', label: 'Recommend with enthusiasm' }]} />
                  <Textarea withAsterisk {...form.getInputProps('classComments')} label="Class Comments" required placeholder="Workload, grading fairness, specific instructors, recommendations for future students, organization, reason for dropping (if applicable), and other details you think are worth noting about the class." autosize minRows={3} />
                  <Textarea withAsterisk {...form.getInputProps('backgroundComments')} label="Background Comments" required placeholder="Have you had exposure to this content before (including in high school)? Do you think your identity, background, or previous exposure influenced your performance and/or overall rating of this class in some way? If so, please elaborate." autosize minRows={3} />
                  <Text size='sm'> By submitting this form, I am affirming all the information above is accurate and truthful. I understand that malicious and deliberate entries of bad data can result in my removal from MIT OpenGrades.</Text>
                </Stack>
              </Stepper.Step>
            </Stepper>
            <Group justify="center" mt="xl">
              <Button variant="default" onClick={prevStep}>Back</Button>
              {active < 1 && <Button onClick={nextStep}>Next step</Button>}
              {active === 1 && <Button type='submit' variant="filled" disabled={!form.isValid()}>Submit</Button>}
            </Group>
          </form>
        </Group>

      </Modal>

      <Button style={{ verticalAlign: 'text-bottom' }} variant='outline' radius='xl' size='sm' onClick={() => setOpened(true)}> {editData ? (<><Pencil size={16} /> EDIT</>) : '+ ADD'} </Button>
    </>
  )
}

interface AddContentProps {
  classData: IClass
  refreshData: () => void
}

function AddContent ({ classData, refreshData }: AddContentProps) {
  const [opened, setOpened] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState('')

  const schema = z.object({
    contentURL: z.string().trim().url({ message: 'Please provide a valid URL.' }).refine((val) => !val.includes('canvas.mit.edu'), { message: 'Canvas is not a valid website for filehosting.' }),
    contentTitle: z.string(),
    type: z.enum(['Syllabus', 'Grade Calculation Spreadsheet', 'Course Schedule', 'Textbook Reading Assignments', 'Miscellaneous'])
  }).required()

  const form = useForm({
    initialValues: {
      contentURL: '',
      contentTitle: '',
      type: ''
    },

    validateInputOnBlur: true,
    validate: zodResolver(schema)
  })

  const postContent = async (values: ContentSubmissionForm) => {
    setFormLoading(true)
    await fetch(`/api/classes/${classData._id}/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...values
      })
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Posted your content for ${classData.subjectNumber}`
        })
        refreshData()
        setOpened(false)
      } else {
        setError(body.message)
        setFormLoading(false)
      }
    })
    setFormLoading(false)
  }

  return (
    <>
      <Modal
        opened={opened}
        centered
        onClose={() => setOpened(false)}
        title={`Add Content for ${classData.subjectNumber}${(classData.aliases && classData.aliases.length > 0) ? `/${classData.aliases.join('/')}` : ''}`}
        size='lg'
      >
        <LoadingOverlay visible={formLoading} overlayProps={{ blur: 2 }} />
        <Group>
          {error.length > 0 && <Alert icon={<IconAlertCircle size={16} />} title="Oops, look like there are some problems!" color="red" style={{ width: '100%' }}>
            {error}
          </Alert>}
          <form onSubmit={form.onSubmit((values) => postContent(values))} style={{ width: '100%' }} >
            <Stack>
              <Text size={'sm'}> Use this form to upload course content that you feel is helpful for people looking to take this class in the future. This includes syllabi, course schedules, and textbook reading assignments. Do not upload any copyrighted material or content that can result in academic integrity violations. </Text>
              <Select {...form.getInputProps('type')} placeholder="Select the type of content you are uploading." label="Content Type" data={['Syllabus', 'Grade Calculation Spreadsheet', 'Course Schedule', 'Textbook Reading Assignments', 'Miscellaneous']} />
              <TextInput withAsterisk {...form.getInputProps('contentTitle')} label="Content Title" required placeholder="Brief description of what you're uploading" />
              <TextInput withAsterisk {...form.getInputProps('contentURL')} label="Content URL" required placeholder="A publicly accessible URL to what you've uploaded." description={'Consider using a public file hosting platform like Google Drive to share your content.'} />
              <Text size='sm'> By submitting this form, I am affirming all the information above is not a violation of academic integrity policies and not copyrighted material. I understand that malicious and deliberate entries of bad data that jeopardize the platform can result in my removal from MIT OpenGrades.</Text>
              <Button type="submit" variant="filled" disabled={!form.isValid()}> Submit </Button>
            </Stack>
          </form>
        </Group>

      </Modal>

      <ActionIcon variant='outline' radius='xl' color='blue' onClick={() => setOpened(true)}>
        <Plus size={20} />
      </ActionIcon>
    </>
  )
}

interface ClassPageProps {
  userProp: IUser
  classProp: IClass
  classReviewsProp: IClassReview[]
  contentSubmissionProp: IContentSubmission[]
  gradePointsProp: IClassReview[]
  myReview: IClassReview
  reportsProp: IReport[]
}

const ContentSubmissionCard = ({ classId, contentSubmission, refreshData, reportsProp }: { classId: string, contentSubmission: IContentSubmission, refreshData: Function, reportsProp: IReport[] }) => {
  const [hidden, setHidden] = useState(!contentSubmission.approved)

  return <Card withBorder key={contentSubmission._id} shadow="sm" p='lg' >
    <Text td={hidden ? "line-through" : undefined} fw={500} className={styles.text} size='lg' c={reportsProp.find((report: IReport) => report.contentSubmission?._id === contentSubmission._id && !report.resolved) && 'red'}>
      {contentSubmission.contentTitle}
    </Text>
    {/* TODO: should be Ancchor */}
    <Text mt="xs" c='blue' size='sm' component={Link} href={contentSubmission.contentURL} target='_blank'>
      {new URL(contentSubmission.contentURL).hostname || 'N/A'}
    </Text>
    {/* Report content button */}
    <Group justify='flex-end' mt='sm'>
      <HideContent classId={classId} contentSubmission={contentSubmission} hidden={hidden} callback={(val: boolean) => { setHidden(val) }} />
      <ReportField contentSubmission={contentSubmission} callback={refreshData} />
    </Group>
  </Card>
}

const ClassPage: NextPage<ClassPageProps> = ({ userProp, classProp, classReviewsProp, contentSubmissionProp, gradePointsProp, myReview, reportsProp }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter()

  const refreshData = () => {
    router.replace(router.asPath)
  }

  const [reviews, setReviews] = useState(classReviewsProp)

  const handleVoteChange = (reviewId: string, newVote: number, previousVote: number) => {
    setReviews((prevReviews) => {
      return prevReviews.map((review) => {
        if (review._id === reviewId) {
          // Handle upvote or downvote logic based on previous vote
          let newUpvotes = review.upvotes
          let newDownvotes = review.downvotes

          // Adjust upvotes and downvotes depending on the vote change
          if (previousVote === 1) {
            newUpvotes--  // Decrement previous upvote
          } else if (previousVote === -1) {
            newDownvotes--  // Decrement previous downvote
          }

          // Now apply the new vote
          if (newVote === 1) {
            newUpvotes++  // Increment upvote
          } else if (newVote === -1) {
            newDownvotes++  // Increment downvote
          }

          return {
            ...review,
            upvotes: newUpvotes,
            downvotes: newDownvotes,
            userVote: newVote,  // Update user vote
          }
        }
        return review
      })
    })
  }

  const deleteClass = async () => {
    await fetch(`/api/classes/${classProp._id}`, {
      method: 'DELETE'
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Deleted ${classProp.subjectNumber}`
        })
        router.replace('/classes')
      } else {
        showNotification({
          title: 'Failure!',
          message: body.message
        })
      }
    })
  }

  useHotkeys([
    ['shift+X+K', () => {
      const confirmation = confirm(`Are you sure you want to delete ${classProp.subjectNumber}?`)
      if (confirmation) {
        deleteClass()
      }
    }]
  ])

  return (
    <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
      <Head>
        <title>{classProp.subjectNumber} - MIT OpenGrades</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <Title>
        ({classProp.subjectNumber}) {classProp.subjectTitle}
      </Title>

      <Title order={4}>
        {classProp.instructors.join(', ')} - {classProp.term}
      </Title>

      <Space h="sm" />

      {
        classProp.units.includes('P/D/F') && <Badge color='blue' variant='filled'> P/D/F </Badge>
      }

      {
        !classProp.offered && <Badge color='red' variant='filled'> Not Offered </Badge>
      }

      {
        !classProp.display && <Badge color='orange' variant='filled'> Hidden </Badge>
      }

      <Space h="lg" />
      <Card withBorder shadow="sm" p='lg' >
        {classProp.aliases && classProp.aliases.length > 0 && <><Text size='sm' c='dimmed'> Alias{classProp.aliases.length > 1 ? 'es' : ''}: {classProp.aliases.join(', ')} </Text><br /></>}
        <Text>
          {classProp.description}
        </Text>
      </Card>

      <Space h="lg" />
      <Stack>

        <GradeChart data={gradePointsProp.map(({ numericGrade, letterGrade, verified }: IClassReview) => ({ numericGrade, letterGrade, verified }))} />

        <Title order={3}> Content Submissions </Title>
        <Group>
          {
            contentSubmissionProp.map((contentSubmission: IContentSubmission) => <ContentSubmissionCard key={contentSubmission._id} contentSubmission={contentSubmission} refreshData={refreshData} reportsProp={reportsProp} classId={classProp._id || "None"} />)
          }
          <AddContent classData={classProp} refreshData={refreshData} />
        </Group>

        <Title order={3}> Reviews <AddReview classData={classProp} refreshData={refreshData} editData={myReview} /> </Title>

        {
          reviews.length > 0
            ? (reviews.map((classReview: IClassReview, index: number) =>
              <ClassReviewComment
                key={classReview?._id}
                classReview={classReview}
                author={{ name: `Anonymous Student #${index + 1}`, hiddenName: classReview.author ? classReview.author.name : `Anonymous Student #${index + 1}` }}
                reported={reportsProp.some((report: IReport) => report.classReview?._id === classReview._id && !report.resolved)}
                trustLevel={userProp.trustLevel}
                userVote={classReview.userVote}
                upvotes={classReview.upvotes}
                downvotes={classReview.downvotes}
                onVoteChange={(vote) => handleVoteChange(classReview._id, vote, classReview.userVote)}
              />
            ))
            : (<Box>  No class reviews yet. Please check back later or add one if you have taken this class. Thank you! </Box>)
        }
      </Stack>
    </Container>
  )
}

export const getServerSideProps = (async (context) => {
  const { id } = context.params as IParams

  function shuffleArray (array: unknown[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }

  await mongoConnection()
  console.log(id)
  const classData = await Class.findById(id).lean()
  const contentSubmissionData: IContentSubmission[] = await ContentSubmission.find({ class: id }).lean()

  const session: Session | null = await getServerSession(context.req, context.res, authOptions)
  let myReview = null

  if (session) {
    if (session.user && session.user?.email) {
      const user = await User.findOne({ email: session.user.email })
      myReview = await ClassReview.findOne({ class: id, user: user._id }).populate('class').lean()

      let reviewsData: IClassReview[] = []
      // if (user.trustLevel < 2) {
      //   reviewsData = await ClassReview.find({ class: id }).select(user.trustLevel < 2 ? ['-author', '-numericGrade', '-letterGrade'] : []).populate('author').lean()
      // } else {
      //   reviewsData = await ClassReview.find({ class: id }).populate('author').lean()
      // }

      // // Get the user's vote (if any) on each review
      // const reviewVotes = await ReviewVote.find({ user: user._id }).lean()
      // const reviewVotesMap = reviewVotes.reduce((map, vote) => {
      //   map[vote.classReview.toString()] = vote.vote
      //   return map
      // }, {})

      // reviewsData = reviewsData.map((review) => ({
      //   ...review,
      //   userVote: reviewVotesMap[review._id.toString()] || null, // User's vote: 1, -1, or null
      //   upvotes: review.upvotes || 0,
      //   downvotes: review.downvotes || 0,
      // }))

      if (user.trustLevel < 2) {
        // Fetch reviews with limited data based on trust level
        reviewsData = await ClassReview.aggregate([
          { $match: { class: new mongoose.Types.ObjectId(id) } },
          {
            $lookup: {
              from: 'reviewvotes',
              localField: '_id',
              foreignField: 'classReview',
              as: 'votes'
            }
          },
          {
            $addFields: {
              upvotes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.vote', 1] } } } },
              downvotes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.vote', -1] } } } }
            }
          },
          {
            $lookup: {
              from: 'reviewvotes',
              let: { reviewId: '$_id', userId: new mongoose.Types.ObjectId(user._id) },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$classReview', '$$reviewId'] }, { $eq: ['$user', '$$userId'] }] } } },
                { $project: { vote: 1 } }
              ],
              as: 'userVote'
            }
          },
          {
            $addFields: {
              userVote: { $ifNull: [{ $arrayElemAt: ['$userVote.vote', 0] }, null] }
            }
          },
          { $project: { 'votes': 0 } }
        ])
      } else {
        // Fetch full review data with votes
        reviewsData = await ClassReview.aggregate([
          { $match: { class: new mongoose.Types.ObjectId(id) } },
          {
            $lookup: {
              from: 'reviewvotes',
              localField: '_id',
              foreignField: 'classReview',
              as: 'votes'
            }
          },
          {
            $addFields: {
              upvotes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.vote', 1] } } } },
              downvotes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.vote', -1] } } } }
            }
          },
          {
            $lookup: {
              from: 'reviewvotes',
              let: { reviewId: '$_id', userId: new mongoose.Types.ObjectId(user._id) },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$classReview', '$$reviewId'] }, { $eq: ['$user', '$$userId'] }] } } },
                { $project: { vote: 1 } }
              ],
              as: 'userVote'
            }
          },
          {
            $addFields: {
              userVote: { $ifNull: [{ $arrayElemAt: ['$userVote.vote', 0] }, null] }
            }
          },
          { $project: { 'votes': 0 } }
        ])
      }


      const gradePointsData = await ClassReview.find({ class: id }).select(['letterGrade', 'numericGrade', 'verified']).lean()
      let reports: IReport[] = []

      if (user.trustLevel >= 2) {
        // find all reports for the reviews and content submissions
        reports = await Report.find({ $or: [{ contentSubmission: { $in: contentSubmissionData.map((contentSubmission: IContentSubmission) => contentSubmission._id) } }, { classReview: { $in: reviewsData.map((review: IClassReview) => review._id) } }] }).populate('reporter contentSubmission classReview').lean()
      }

      console.log('my session', session)
      // console.log('reviewsData', reviewsData)
      return {
        props: {
          userProp: JSON.parse(JSON.stringify(user)),
          classProp: JSON.parse(JSON.stringify(classData)),
          classReviewsProp: JSON.parse(JSON.stringify(reviewsData)),
          contentSubmissionProp: JSON.parse(JSON.stringify(contentSubmissionData)),
          gradePointsProp: JSON.parse(JSON.stringify(shuffleArray((gradePointsData.length > 3 || user.trustLevel >= 2) ? gradePointsData : []))),
          myReview: JSON.parse(JSON.stringify(myReview)),
          reportsProp: JSON.parse(JSON.stringify(reports))
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
})

export default ClassPage
