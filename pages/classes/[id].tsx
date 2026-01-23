// @ts-nocheck
import { ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Center, Checkbox, Container, Divider, Grid, Group, Input, LoadingOverlay, Modal, NumberInput, Paper, Progress, Rating, RingProgress, Select, Space, Stack, Stepper, Text, TextInput, Textarea, Title, Tooltip, UnstyledButton, em } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import type { InferGetServerSidePropsType, NextPage } from 'next'
// import {  } from 'next'
import { Dropzone, MIME_TYPES } from '@mantine/dropzone'
import { Spotlight, SpotlightActionData } from '@mantine/spotlight'

import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'


// eslint-disable-next-line camelcase

import { z } from 'zod'

import mongoConnection from '../../utils/mongoConnection'

import Class from '../../models/Class'
import ClassReview from '../../models/ClassReview'
import ContentSubmission from '../../models/ContentSubmission'
import Report from '../../models/Report'
import User from '../../models/User'
import CourseEmbedding from '../../models/CourseEmbedding'

import { IClass, IClassReview, IContentSubmission, IParams, IReport, IUser, LetterGrade, TimeRange } from '../../types'

import GradeChart from '../../components/GradeChart'
import RelatedClasses from '../../components/RelatedClasses'


import GradeReportModal from '@/components/GradeReportModal'
import { DonutChart } from '@mantine/charts'
import { IconAlertCircle, IconArrowDownCircle, IconArrowUpCircle, IconClock, IconGraph, IconMessage, IconPhoto, IconStar, IconThumbUp, IconTrash, IconUpload, IconX, IconDatabase } from '@tabler/icons'
import moment from 'moment-timezone'
import mongoose from 'mongoose'
import { Session, getServerSession } from 'next-auth'
import Link from 'next/link'
import authOptions from "pages/api/auth/[...nextauth]"
import { Eye, EyeOff, Flag2, Pencil, Plus } from 'tabler-icons-react'
import styles from '../../styles/ClassPage.module.css'
import { hasRecentGradeReport } from '@/utils/hasRecentGradeReport'
import { usePlausibleTracker } from '@/utils/plausible'
import { extractCourseNumbers } from '@/utils/prerequisiteGraph'

const RecommendationLevels: Record<number, string> = {
  1: 'Definitely not recommend',
  2: 'Unlikely to recommend',
  3: 'Recommend with reservations',
  4: 'Likely to recommend',
  5: 'Recommend with enthusiasm'
}

const letterGradeColors = {
  A: '#40C057',
  B: '#15AABF',
  C: '#4C6EF5',
  D: '#BE4BDB',
  F: '#FA5252'
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
  isEmbedded?: boolean // Whether this review has an embedding
}

interface ContentSubmissionForm extends Omit<IContentSubmission, 'class' | 'author' | 'approved' | 'createdAt' | 'updatedAt'> { }

interface ClassReviewForm extends Omit<IClassReview, 'class' | 'author' | 'createdAt' | 'updatedAt' | 'approved' | 'display' | 'verified'> { }

function HideContent({ classId, classReview, contentSubmission, callback, hidden }: { classId?: string, classReview?: IClassReview, contentSubmission?: IContentSubmission, callback: Function, hidden: boolean }) {
  const [opened, setOpened] = useState(false)

  const goal = hidden ? 'Unhide' : 'Hide'

  async function toggleHide() {
    const url = contentSubmission ? `/ api / classes / ${classId} /content/${contentSubmission._id} ` : ` / api / classes / ${classId} /reviews/${classReview?._id} `
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
          message: `${goal.substring(0, goal.length - 1)} ${contentSubmission ? 'content submission' : 'class review'} `
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
      <Modal title={`${goal} this post ? `} size='lg' centered opened={opened} onClose={() => setOpened(false)}>
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

function ClassReviewComment({ classReview,
  author,
  reported,
  trustLevel,
  userVote,
  upvotes,
  downvotes,
  onVoteChange,
  isEmbedded,
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
    const response = await fetch(`/ api / classes / ${classReview.class.toString()} /reviews/${classReview._id}/vote`, {
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


  async function deanon() {
    console.log("Denaonymizing user")
    if (!showName) {
      await fetch(`/api/auditlogs`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'DeanonymizeReview',
          description: `Deanonymized ${author}'s review for ${classReview.class.toString()}`
        })
      })
    }

    setShowName(!showName)
  }

  // Helper function to get workload label and color
  const getWorkloadInfo = (hours: number) => {
    if (hours <= 6) return { label: 'Light', color: 'green' }
    if (hours <= 12) return { label: 'Moderate', color: 'yellow' }
    if (hours <= 18) return { label: 'Heavy', color: 'orange' }
    return { label: 'Very Heavy', color: 'red' }
  }

  // Helper function to get recommendation color
  const getRecommendationColor = (level: number) => {
    if (level >= 6) return 'green'
    if (level >= 4) return 'yellow'
    return 'red'
  }

  const workloadInfo = getWorkloadInfo(classReview.hoursPerWeek || 0)
  const ratingPercent = ((classReview.overallRating || 0) / 7) * 100

  return (
    <Paper className={styles.comment} withBorder radius="md" p="md">
      {/* Header: Author info and badges */}
      <Group justify="space-between" mb="sm">
        <Group>
          <Avatar alt={author.name} radius="xl" />
          <div>
            {
              trustLevel && trustLevel >= 2
                ? <Text size="sm" fw={500} className={styles.text} style={{ cursor: 'pointer' }} onClick={() => deanon()}>{showName ? author.hiddenName : author.name}</Text>
                : <Text size="sm" fw={500} className={styles.text}>{author.name}</Text>
            }
            <Text size="xs" c="dimmed">
              {moment(classReview.createdAt).tz('America/New_York').format('MMMM DD, YYYY')}
            </Text>
          </div>
        </Group>
        <Group gap='xs'>
          {classReview.firstYear && <Badge size="sm" color='indigo' variant="light">First Year</Badge>}
          {classReview.retaking && <Badge size="sm" color='green' variant="light">Retake</Badge>}
          {classReview.droppedClass && <Badge size="sm" color='yellow' variant="light">Dropped</Badge>}
          {trustLevel && trustLevel >= 2 && reported && <Badge size="sm" color='red' variant="filled">Reported</Badge>}
          {trustLevel && trustLevel >= 2 && hidden && <Badge size="sm" color='orange' variant="filled">Hidden</Badge>}
          {trustLevel && trustLevel >= 2 && isEmbedded && (
            <Badge size="sm" color='cyan' variant="light" leftSection={<IconDatabase size={10} />}>Embedded</Badge>
          )}
        </Group>
      </Group>

      {/* Metrics Grid */}
      <Grid mb="md" gutter="md">
        {/* Overall Rating */}
        <Grid.Col span={{ base: 4, sm: 4 }}>
          <Group gap="xs" align="center">
            <Tooltip label={`${classReview.overallRating}/7 overall rating`}>
              <RingProgress
                size={50}
                thickness={5}
                roundCaps
                sections={[{ value: ratingPercent, color: ratingPercent >= 70 ? 'green' : ratingPercent >= 40 ? 'yellow' : 'red' }]}
                label={
                  <Text size="xs" ta="center" fw={700}>
                    {classReview.overallRating}
                  </Text>
                }
              />
            </Tooltip>
            <div>
              <Text size="xs" c="dimmed">Rating</Text>
              <Text size="sm" fw={500}>{classReview.overallRating}/7</Text>
            </div>
          </Group>
        </Grid.Col>

        {/* Hours Per Week */}
        <Grid.Col span={{ base: 4, sm: 4 }}>
          <Group gap="xs" align="center">
            <Tooltip label={`${classReview.hoursPerWeek} hours per week (${workloadInfo.label})`}>
              <RingProgress
                size={50}
                thickness={5}
                roundCaps
                sections={[{ value: Math.min((classReview.hoursPerWeek || 0) / 25 * 100, 100), color: workloadInfo.color }]}
                label={
                  <Center>
                    <IconClock size={16} />
                  </Center>
                }
              />
            </Tooltip>
            <div>
              <Text size="xs" c="dimmed">Hours/Week</Text>
              <Text size="sm" fw={500}>{classReview.hoursPerWeek} <Text component="span" size="xs" c="dimmed">({workloadInfo.label})</Text></Text>
            </div>
          </Group>
        </Grid.Col>

        {/* Recommendation */}
        <Grid.Col span={{ base: 4, sm: 4 }}>
          <Group gap="xs" align="center">
            <Tooltip label={RecommendationLevels[classReview.recommendationLevel]}>
              <RingProgress
                size={50}
                thickness={5}
                roundCaps
                sections={[{ value: (classReview.recommendationLevel / 7) * 100, color: getRecommendationColor(classReview.recommendationLevel) }]}
                label={
                  <Center>
                    <IconThumbUp size={16} />
                  </Center>
                }
              />
            </Tooltip>
            <div>
              <Text size="xs" c="dimmed">Would Recommend</Text>
              <Text size="sm" fw={500}>{classReview.recommendationLevel}/7</Text>
            </div>
          </Group>
        </Grid.Col>
      </Grid>

      {/* Comments Section - Only show if there's content */}
      {(classReview.classComments || classReview.backgroundComments) && (
        <Stack gap="xs">
          {classReview.classComments && (
            <Box>
              <Group gap="xs" mb={4}>
                <IconMessage size={14} color="gray" />
                <Text size="xs" fw={600} c="dimmed">Class Comments</Text>
              </Group>
              <Text size="sm" style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                "{classReview.classComments}"
              </Text>
            </Box>
          )}

          {classReview.backgroundComments && (
            <Box>
              <Group gap="xs" mb={4}>
                <IconMessage size={14} color="gray" />
                <Text size="xs" fw={600} c="dimmed">Background & Tips</Text>
              </Group>
              <Text size="sm" style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                "{classReview.backgroundComments}"
              </Text>
            </Box>
          )}
        </Stack>
      )}

      {/* Actions Footer */}
      <Divider my="sm" />
      <Group justify='space-between'>
        <Group gap="xs">
          {trustLevel && trustLevel >= 2 && <HideContent classId={classReview.class.toString()} hidden={hidden} classReview={classReview} callback={(val: boolean) => { setHidden(val) }} />}
          {(trustLevel && trustLevel >= 2) ? <ReportField classReview={classReview} callback={(val: boolean) => { setHidden(val) }} /> : <ReportField classReview={classReview} callback={() => { }} />}
        </Group>
        <Group gap="xs">
          <Tooltip label="Helpful">
            <ActionIcon
              onClick={() => handleVote(1)}
              variant={userVote === 1 ? "filled" : "light"}
              color={userVote === 1 ? 'green' : 'gray'}
              size="sm"
            >
              <IconArrowUpCircle size={16} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" fw={500} c={upvotes - downvotes > 0 ? 'green' : upvotes - downvotes < 0 ? 'red' : 'gray'}>
            {upvotes - downvotes}
          </Text>
          <Tooltip label="Not helpful">
            <ActionIcon
              onClick={() => handleVote(-1)}
              variant={userVote === -1 ? "filled" : "light"}
              color={userVote === -1 ? 'red' : 'gray'}
              size="sm"
            >
              <IconArrowDownCircle size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  )
}

function ReportField({ contentSubmission, classReview, callback }: { contentSubmission?: IContentSubmission, classReview?: Partial<IClassReview>, callback: Function }) {
  const [opened, setOpened] = useState(false)
  const [reason, setReason] = useState('')

  async function report() {
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

function AddReview({ classData, refreshData, editData }: AddReviewProps) {
  const plausible = usePlausibleTracker()
  const [opened, setOpened] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionForm, setSessionForm] = useLocalStorage({
    key: `classReviewForm-${classData._id}`,
    defaultValue: {
    },
    serialize: JSON.stringify,
    deserialize: JSON.parse
  })

  const [active, setActive] = useState(0)
  const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current))
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current))
  const router = useRouter()
  const isMobile = useMediaQuery(`(max-width: ${em(750)})`)

  const schema = z.object({
    overallRating: z.number().min(1).max(7),
    conditions: z.array(z.enum(['firstYear', 'droppedClass', 'retaking'])),
    hoursPerWeek: z.enum(['0-2 hours', '3-5 hours', '6-8 hours', '9-11 hours', '12-14 hours', '15-17 hours', '18-20 hours', '21-23 hours', '24-26 hours', '37-40 hours'], { invalid_type_error: 'Please select a number of hours for this class.' }),
    recommendationLevel: z.enum(['1', '2', '3', '4', '5'], { invalid_type_error: 'Please select a recommendation level.' }),
    classComments: z.string().min(5, 'Please type some more words.'),
    backgroundComments: z.string(),
    numericGrade: z.number().min(0).max(100).nullable(),
    letterGrade: z.enum(['A', 'B', 'C', 'D', 'F', 'P', 'DR']),
    methodOfGradeCalculation: z.enum(['Canvas', 'MIT OpenGrades Spreadsheet', 'Self', 'Other']).nullable()
  }).partial({
    conditions: true,
    numericGrade: true,
    backgroundComments: true,
    methodOfGradeCalculation: true
  }).refine((data) => {
    // If numericGrade is provided, methodOfGradeCalculation must not be null
    if (data.numericGrade !== null && data.numericGrade !== undefined && data.methodOfGradeCalculation === null) {
      return false
    }
    return true
  }, {
    message: "Method of grade calculation is required when numeric grade is provided.",
    path: ['methodOfGradeCalculation'],
  })

  const form = useForm({
    initialValues: editData
      ? {
        overallRating: editData.overallRating,
        conditions: [editData.firstYear ? 'firstYear' : false, editData.droppedClass ? 'droppedClass' : false, editData.retaking ? 'retaking' : false].filter((entry) => entry !== false),
        hoursPerWeek: editData.hoursPerWeek as TimeRange,
        classComments: editData.classComments || sessionForm.classComments,
        backgroundComments: editData.backgroundComments || sessionForm.backgroundComments,
        recommendationLevel: String(editData.recommendationLevel),
        numericGrade: editData.numericGrade || null,
        methodOfGradeCalculation: editData.methodOfGradeCalculation || null,
        letterGrade: editData.letterGrade
      }
      : {
        overallRating: 0,
        conditions: [],
        hoursPerWeek: 'Unknown' as TimeRange,
        classComments: sessionForm.classComments || '',
        backgroundComments: sessionForm.backgroundComments || '',
        recommendationLevel: '',
        numericGrade: null,
        methodOfGradeCalculation: null,
        letterGrade: '' as LetterGrade
      },

    validateInputOnBlur: true,
    validate: zod4Resolver(schema),

    transformValues: (values) => ({
      ...values,
      recommendationLevel: Number(values.recommendationLevel),
      firstYear: (values.conditions as string[]).includes('firstYear'),
      retaking: (values.conditions as string[]).includes('retaking'),
      droppedClass: (values.conditions as string[]).includes('dropped')
    })
  })

  form.watch('classComments', ({ value }) => {
    setSessionForm({ ...sessionForm, classComments: value })
  })

  form.watch('backgroundComments', ({ value }) => {
    setSessionForm({ ...sessionForm, backgroundComments: value })
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
          message: `${editData ? 'Edited' : 'Posted'} your review for ${classData.subjectNumber}`
        })
        if (!editData) {
          plausible('Review Submit', {
            props: {
              classNumber: classData.subjectNumber,
              hasNumericGrade: (values.numericGrade !== null && values.numericGrade !== undefined).toString()
            }
          })
        }
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
                    onChange={(value) => form.setFieldValue('numericGrade', value ?? null)}
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
                    <Checkbox value="droppedClass" label="Dropped Class" />
                    <Checkbox value="retaking" label="Retaking" />
                  </Checkbox.Group>
                  <Select key="hoursPerWeek" required withAsterisk {...form.getInputProps('hoursPerWeek')} placeholder="Select the number of hours" label="Hours/week spent on classwork outside of lecture/recitation " data={['0-2 hours', '3-5 hours', '6-8 hours', '9-11 hours', '12-14 hours', '15-17 hours', '18-20 hours', '21-23 hours', '24-26 hours', '37-40 hours']} />
                  <Select key="recommendationLevel" required withAsterisk {...form.getInputProps('recommendationLevel')} placeholder="Select a recommendation level" label="How likely are you to recommend this class? " data={[{ value: '1', label: 'Definitely not recommend' }, { value: '2', label: 'Unlikely to recommend' }, { value: '3', label: 'Recommend with reservations' }, { value: '4', label: 'Likely to recommend' }, { value: '5', label: 'Recommend with enthusiasm' }]} />
                  <Textarea withAsterisk {...form.getInputProps('classComments')} label="Class Comments" required placeholder="Workload, grading fairness, specific instructors, recommendations for future students, organization, reason for dropping (if applicable), and other details you think are worth noting about the class. If you took a class under a different number or level (e.g. CC.801 vs CC.8012, or for grad credit), please note it here." autosize minRows={3} defaultValue={sessionForm.classComments || ''} />
                  <Textarea withAsterisk {...form.getInputProps('backgroundComments')} label="Background Comments" required placeholder="Have you had exposure to this content before (including in high school)? Do you think your identity, background, or previous exposure influenced your performance and/or overall rating of this class in some way? If so, please elaborate." autosize minRows={3} defaultValue={sessionForm.backgroundComments || ''} />
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

      {/* <Button style={{ verticalAlign: 'text-bottom' }} variant='outline' radius='xl' size='sm' onClick={() => setOpened(true)}> {editData ? (<><Pencil size={16} /> EDIT</>) : '+ ADD'} </Button> */}

      <Button variant='light' style={{ width: '100%' }} onClick={() => setOpened(true)} color={editData ? 'violet' : 'green'} disabled={!classData.reviewable}>
        {
          !classData.reviewable ? 'Course reviews are disabled for this class.' : editData ? (<><Pencil size={16} /> EDIT</>) : '+ ADD'
        }
      </Button>
    </>
  )
}

interface AddContentProps {
  classData: IClass
  refreshData: () => void
}

function AddContent({ classData, refreshData }: AddContentProps) {
  const plausible = usePlausibleTracker()
  const [opened, setOpened] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const schema = z.object({
    contentTitle: z.string().min(5, 'Title must be at least 5 characters long.'),
    type: z.enum(['Syllabus', 'Grade Calculation Spreadsheet', 'Course Schedule', 'Textbook Reading Assignments', 'Miscellaneous'])
  }).required()

  const form = useForm({
    initialValues: {
      contentTitle: '',
      type: ''
    },

    validateInputOnBlur: true,
    validate: zod4Resolver(schema)
  })

  useEffect(() => {
    if (form.values.type && ['Syllabus', 'Grade Calculation Spreadsheet', 'Course Schedule', 'Textbook Reading Assignments'].includes(form.values.type)) {
      form.setFieldValue('contentTitle', form.values.type)
    }
  }, [form.values.type])

  const postContent = async (values: ContentSubmissionForm) => {
    if (files.length !== 1) {
      setError('Please upload one file.')
      return
    }

    setFormLoading(true)
    setError('')

    try {
      const file = files[0]
      const formData = new FormData()
      formData.append('file', file)
      formData.append('contentTitle', values.contentTitle)
      formData.append('type', values.type)

      const res = await fetch(`/api/classes/${classData._id}/content`, {
        method: 'POST',
        body: formData
      })

      const body = await res.json()

      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: `Posted your content for ${classData.subjectNumber}`
        })
        plausible('Content Upload', {
          props: {
            contentType: values.type,
            classNumber: classData.subjectNumber
          }
        })
        setOpened(false)
        refreshData()
        form.reset()
        setFiles([])
      } else {
        setError(body.message || 'Failed to upload.')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <>
      <Modal
        opened={opened}
        centered
        onClose={() => setOpened(false)}
        title={`Add Content for ${classData.subjectNumber}${(classData.aliases?.length ? `/${classData.aliases.join('/')}` : '')}`}
        size='lg'
      >
        <LoadingOverlay visible={formLoading} overlayProps={{ blur: 2 }} />
        <Group>
          {error && (
            <Alert icon={<IconAlertCircle size={16} />} title="Upload failed" color="red" style={{ width: '100%' }}>
              {error}
            </Alert>
          )}
          <form onSubmit={form.onSubmit(postContent)} style={{ width: '100%' }}>
            <Stack>
              <Text size='sm'>
                Use this form to upload course content such as syllabi, schedules, or textbook reading lists. Do not upload copyrighted material or anything that could violate academic integrity.
              </Text>

              <Select
                {...form.getInputProps('type')}
                placeholder="Select the type of content"
                label="Content Type"
                required
                data={[
                  'Syllabus',
                  'Grade Calculation Spreadsheet',
                  'Course Schedule',
                  'Textbook Reading Assignments',
                  'Miscellaneous'
                ]}
              />

              <TextInput
                withAsterisk
                {...form.getInputProps('contentTitle')}
                label="Content Title"
                placeholder="Brief description of what you're uploading"
              />

              <Dropzone
                onDrop={(acceptedFiles) => setFiles(acceptedFiles)}
                onReject={() => setError('File too large or unsupported type')}
                maxSize={5 * 1024 ** 2}
                accept={[
                  MIME_TYPES.pdf,
                  MIME_TYPES.doc,
                  MIME_TYPES.docx,
                  MIME_TYPES.xls,
                  MIME_TYPES.xlsx,
                  MIME_TYPES.ppt,
                  MIME_TYPES.pptx
                ]}
                multiple={false}
              >
                <Group justify="center" gap="xl" mih={200} sx={{ pointerEvents: 'none' }}>
                  <Dropzone.Accept>
                    <IconUpload size={50} color="blue" stroke={1.5} />
                  </Dropzone.Accept>
                  <Dropzone.Reject>
                    <IconX size={50} color="red" stroke={1.5} />
                  </Dropzone.Reject>
                  <Dropzone.Idle>
                    <IconPhoto size={50} color="gray" stroke={1.5} />
                  </Dropzone.Idle>
                  <div>
                    <Text size="lg">Drag file here or click to upload</Text>
                    <Text size="sm" color="dimmed" mt={5}>
                      Only one file per upload. Max size: 5MB.
                    </Text>
                    {files.length > 0 && <Text size="sm" mt={10}>Selected: {files[0].name}</Text>}
                  </div>
                </Group>
              </Dropzone>

              <Text size='sm'>
                By submitting this form, you affirm that the material does not violate academic integrity policies.
              </Text>

              <Button type="submit" variant="filled" disabled={!form.isValid() || files.length !== 1}>
                Submit
              </Button>
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
  embeddingStatus?: {
    hasDescriptionEmbedding: boolean
    embeddedReviewIds: string[]
    embeddedContentIds: string[]
  }
  relatedClasses?: {
    prerequisites: { subjectNumber: string; subjectTitle: string }[]
    corequisites: { subjectNumber: string; subjectTitle: string }[]
    requiredBy: { subjectNumber: string; subjectTitle: string }[]
  }
}

// const ContentSubmissionCard = ({ classId, contentSubmission, refreshData, reportsProp }: { classId: string, contentSubmission: IContentSubmission, refreshData: Function, reportsProp: IReport[] }) => {
//   const [hidden, setHidden] = useState(!contentSubmission.approved)

//   return <Card withBorder key={contentSubmission._id} shadow="sm" p='lg' >
//     <Text td={hidden ? "line-through" : undefined} fw={500} className={styles.text} size='lg' c={reportsProp.find((report: IReport) => report.contentSubmission?._id === contentSubmission._id && !report.resolved) && 'red'}>
//       {contentSubmission.contentTitle}
//     </Text>
//     {/* TODO: should be Ancchor */}
//     <Text mt="xs" c='blue' size='sm' component={Link} href={contentSubmission.contentURL} target='_blank'>
//       {new URL(contentSubmission.contentURL).hostname || 'N/A'}
//     </Text>
//     {/* Report content button */}
//     <Group justify='flex-end' mt='sm'>
//       <HideContent classId={classId} contentSubmission={contentSubmission} hidden={hidden} callback={(val: boolean) => { setHidden(val) }} />
//       <ReportField contentSubmission={contentSubmission} callback={refreshData} />
//     </Group>
//   </Card>
// }

const ContentSubmissionCard = ({
  classId,
  subjectNumber,
  contentSubmission,
  refreshData,
  reportsProp,
  trustLevel = 0,
  isEmbedded = false
}: {
  classId: string
  subjectNumber: string
  contentSubmission: IContentSubmission
  refreshData: Function
  reportsProp: IReport[]
  trustLevel?: number
  isEmbedded?: boolean
}) => {
  const plausible = usePlausibleTracker()
  const [hidden, setHidden] = useState(!contentSubmission.approved)
  const [signedURL, setSignedURL] = useState<string | null>(null)

  useEffect(() => {
    const fetchSignedURL = async () => {
      try {
        const res = await fetch(`/api/classes/${classId}/content/${contentSubmission._id}`)
        const json = await res.json()
        if (json.success && json.data?.signedURL) {
          setSignedURL(json.data.signedURL)
        } else {
          setSignedURL(null)
        }
      } catch (err) {
        console.error('Error fetching signed URL:', err)
        setSignedURL(null)
      }
    }

    fetchSignedURL()
  }, [classId, contentSubmission._id])

  return (
    <Card withBorder key={contentSubmission._id} shadow="sm" p="lg">
      <Text
        td={hidden ? 'line-through' : undefined}
        fw={500}
        className={styles.text}
        size="lg"
        c={
          reportsProp.find(
            (report: IReport) =>
              report.contentSubmission?._id === contentSubmission._id && !report.resolved
          )
            ? 'red'
            : undefined
        }
      >
        {contentSubmission.contentTitle}
      </Text>

      {trustLevel && trustLevel >= 2 && isEmbedded && (
        <Badge color={'cyan'} variant="light" leftSection={<IconDatabase size={12} />} mt="xs" size="sm">Embedded</Badge>
      )}

      <Text
        mt="xs"
        c="blue"
        size="sm"
        component={Link}
        href={signedURL || '#'}
        target="_blank"
        onClick={() => {
          if (signedURL) {
            plausible('File Open', {
              props: {
                contentType: contentSubmission.type || 'Unknown',
                classNumber: subjectNumber,
                fileName: contentSubmission.contentTitle
              }
            })
          }
        }}
      >
        {signedURL ? new URL(signedURL).hostname : 'Unavailable'}
      </Text>

      <Group justify="flex-end" mt="sm">
        {
          trustLevel && trustLevel >= 2 && (
            <HideContent
              classId={classId}
              contentSubmission={contentSubmission}
              hidden={hidden}
              callback={(val: boolean) => setHidden(val)}
            />
          )
        }
        <ReportField contentSubmission={contentSubmission} callback={refreshData} />
      </Group>
    </Card>
  )
}


const ClassPage: NextPage<ClassPageProps> = ({ userProp, classProp, classReviewsProp, contentSubmissionProp, gradePointsProp, myReview, reportsProp, lastGradeReportUpload, embeddingStatus, relatedClasses }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter()

  const refreshData = () => {
    router.replace(router.asPath)
  }

  const [reviews, setReviews] = useState(classReviewsProp)
  const [gradeReportModalOpened, setGradeReportModalOpened] = useState(false)
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

  const handleAddClassesFromModal = async (classes: { [key: string]: IClass[] }, partialReviews: { class: string; letterGrade: string; droppedClass: boolean, firstYear: boolean }[]) => {
    const flatClasses = Object.values(classes).flat().map((c: IClass) => ({ _id: c._id }))

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
      router.replace(router.asPath) // Refresh data
    }
  }

  const actions: SpotlightActionData[] = [
    {
      id: 'aggregate',
      label: 'View Aggregated Data',
      description: 'View the aggregated data for this class',
      onClick: () => {
        router.push(`/classes/aggregate/${classProp.subjectNumber}`)
      },
      leftSection: <IconGraph size={20} />,
    }
  ]

  if (userProp.trustLevel && userProp.trustLevel >= 2) {
    actions.push({
      id: 'delete',
      label: 'Delete Class',
      description: 'Delete this class from the database',
      onClick: deleteClass,
      leftSection: (<IconTrash size={20} />)
    })
  }

  return (
    <Container style={{ padding: 'var(--mantine-spacing-lg)' }}>
      <Head>
        <title>{classProp.subjectNumber} - MIT OpenGrades</title>
        <meta name="description" content={classProp.description} />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <Title>
        ({classProp.subjectNumber}) {classProp.subjectTitle}
      </Title>

      <Title order={4}>
        {classProp.instructors.join(', ')} - {classProp.term}
      </Title>

      <Space h="sm" />
      <Group>
        {
          classProp.units.includes('P/D/F') && <Badge color='blue' variant='filled'> P/D/F </Badge>
        }

        {
          !classProp.offered && <Badge color='red' variant='filled'> Not Offered </Badge>
        }

        {
          !classProp.display && <Badge color='orange' variant='filled'> Hidden </Badge>
        }

        {/* GIR Attributes */}
        {
          classProp.girAttribute && classProp.girAttribute.length > 0 && classProp.girAttribute.map((gir: string) => (
            <Badge key={gir} color='grape' variant='light'> GIR: {gir} </Badge>
          ))
        }

        {/* HASS Attribute */}
        {
          classProp.hassAttribute && (
            <Badge color='teal' variant='light'> {classProp.hassAttribute} </Badge>
          )
        }

        {/* Communication Requirement */}
        {
          classProp.communicationRequirement && (
            <Badge color='violet' variant='light'> {classProp.communicationRequirement} </Badge>
          )
        }

        {
          userProp.trustLevel && userProp.trustLevel >= 2 && embeddingStatus?.hasDescriptionEmbedding && (
            <Badge color='cyan' variant='light' leftSection={<IconDatabase size={12} />}> Description Embedded </Badge>
          )
        }
      </Group>

      <Space h="lg" />
      <Card withBorder shadow="sm" p='lg' >
        {classProp.aliases && classProp.aliases.length > 0 && <><Text size='sm' c='dimmed'> Alias{classProp.aliases.length > 1 ? 'es' : ''}: {classProp.aliases.join(', ')} </Text><br /></>}
        <Text>
          {classProp.description}
        </Text>
      </Card>

      <Group justify='end'>
        <Button variant='transparent' onClick={() => router.push(`/classes/aggregate/${classProp.subjectNumber}`)}>
          See Aggregated Data
        </Button>
      </Group>

      <Space h="lg" />
      <Stack>
        {
          gradePointsProp.length > 0 ?

            <Grid>
              <Grid.Col span={{ xs: 12, md: 3 }}>
                <Title order={3}> Grade Distribution </Title>
                {/* <Card withBorder shadow="sm" p='lg'> */}
                <Center>
                  <DonutChart
                    size={120}
                    labelsType='value'
                    withLabels
                    withTooltip
                    data={gradePointsProp.reduce((acc, { letterGrade }) => {
                      const existing = acc.find((entry) => entry.name === letterGrade)
                      if (existing) {
                        existing.value++
                      } else {
                        acc.push({ name: letterGrade, value: 1, color: letterGradeColors[letterGrade] })
                      }
                      return acc
                    }, [] as { name: string, value: number, color: string }[]
                    )}
                  />
                </Center>
                {/* </Card> */}
              </Grid.Col>
              <Grid.Col span={{ xs: 12, md: 9 }}>
                <GradeChart data={gradePointsProp.map(({ numericGrade, letterGrade, verified }: IClassReview) => ({ numericGrade, letterGrade, verified }))} />
              </Grid.Col>
            </Grid>
            : <Text> No grade data available for this class. {
              lastGradeReportUpload ? "A minimum of 4 reviews is required to display grade data." :
                <>
                  You must <UnstyledButton style={{ textDecoration: "underline", color: "blue" }} onClick={() => setGradeReportModalOpened(true)}>upload</UnstyledButton> a grade report with partial reviews in the past four months to display grade data.
                </>
            }
            </Text>
        }
        <GradeReportModal opened={gradeReportModalOpened} onClose={() => setGradeReportModalOpened(false)} onAddClasses={handleAddClassesFromModal} />



        <Title order={3}> Content Submissions </Title>
        <Group>
          {
            contentSubmissionProp.map((contentSubmission: IContentSubmission) => <ContentSubmissionCard
              key={contentSubmission._id}
              contentSubmission={contentSubmission}
              refreshData={refreshData}
              reportsProp={reportsProp}
              classId={classProp._id || "None"}
              subjectNumber={classProp.subjectNumber}
              trustLevel={userProp.trustLevel}
              isEmbedded={embeddingStatus?.embeddedContentIds?.includes(contentSubmission._id?.toString() || '')}
            />)
          }
          <AddContent classData={classProp} refreshData={refreshData} />
        </Group>

        {relatedClasses && (
          <RelatedClasses
            subjectNumber={classProp.subjectNumber}
            prerequisites={relatedClasses.prerequisites}
            corequisites={relatedClasses.corequisites}
            requiredBy={relatedClasses.requiredBy}
          />
        )}

        <Title order={3}> Reviews </Title>

        <AddReview classData={classProp} refreshData={refreshData} editData={myReview} />

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
                isEmbedded={embeddingStatus?.embeddedReviewIds?.includes(classReview._id?.toString() || '')}
              />
            ))
            : (<Box>  No class reviews yet. Please check back later or be the first one if you have taken this class. Thank you! </Box>)
        }
      </Stack>

      <Spotlight actions={actions} shortcut="mod + K" />
    </Container >
  )
}

export const getServerSideProps = (async (context) => {
  const { id } = context.params as IParams

  function shuffleArray(array: unknown[]) {
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
      const user: IUser = await User.findOne({ email: session.user.email })
      myReview = await ClassReview.findOne({ class: id, author: user._id }).populate('class').lean()

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
          { $match: { class: new mongoose.Types.ObjectId(id), display: true } },
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
          { $project: { 'votes': 0, 'author': 0, 'numericGrade': 0, 'letterGrade': 0 } }
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

      // check if last grade report upload was made in last 4 months
      const lastGradeReportUpload = hasRecentGradeReport(user.lastGradeReportUpload, 4)

      // Query embedding status for trust level >= 2 users
      let embeddingStatus = null
      if (user.trustLevel >= 2) {
        const embeddings = await CourseEmbedding.find({ class: id }).select('embeddingType sourceId').lean()

        const hasDescriptionEmbedding = embeddings.some((e: any) => e.embeddingType === 'description')
        const embeddedReviewIds = embeddings
          .filter((e: any) => e.embeddingType === 'reviews' && e.sourceId)
          .map((e: any) => e.sourceId.toString())
        const embeddedContentIds = embeddings
          .filter((e: any) => e.embeddingType === 'content' && e.sourceId)
          .map((e: any) => e.sourceId.toString())

        embeddingStatus = {
          hasDescriptionEmbedding,
          embeddedReviewIds: [...new Set(embeddedReviewIds)], // Dedupe
          embeddedContentIds: [...new Set(embeddedContentIds)] // Dedupe
        }
      }

      // Fetch related classes data
      const prereqNumbers = extractCourseNumbers(classData.prerequisites || '')
      const coreqNumbers = extractCourseNumbers(classData.corequisites || '')

      const [prerequisiteClasses, corequisiteClasses, requiredByClasses] = await Promise.all([
        Class.find({
          subjectNumber: { $in: prereqNumbers },
          offered: true,
          academicYear: classData.academicYear
        }).select('subjectNumber subjectTitle department academicYear').lean(),

        Class.find({
          subjectNumber: { $in: coreqNumbers },
          offered: true,
          academicYear: classData.academicYear
        }).select('subjectNumber subjectTitle department academicYear').lean(),

        Class.find({
          offered: true,
          academicYear: classData.academicYear,
          $or: [
            { prerequisites: { $regex: new RegExp(`\\b${classData.subjectNumber}\\b`, 'i') } },
            { corequisites: { $regex: new RegExp(`\\b${classData.subjectNumber}\\b`, 'i') } }
          ]
        }).select('subjectNumber subjectTitle department academicYear').lean()
      ])

      // Helper to deduplicate by subjectNumber within each related list
      const dedupeBySubjectNumber = (items: any[]) => {
        const seen = new Set<string>()
        return items.filter((c) => {
          if (!c?.subjectNumber) return false
          if (seen.has(c.subjectNumber)) return false
          seen.add(c.subjectNumber)
          return true
        })
      }

      const relatedClasses = {
        prerequisites: dedupeBySubjectNumber(prerequisiteClasses).map((c: any) => ({
          subjectNumber: c.subjectNumber,
          subjectTitle: c.subjectTitle,
          department: c.department
        })),
        corequisites: dedupeBySubjectNumber(corequisiteClasses).map((c: any) => ({
          subjectNumber: c.subjectNumber,
          subjectTitle: c.subjectTitle,
          department: c.department
        })),
        requiredBy: dedupeBySubjectNumber(requiredByClasses).map((c: any) => ({
          subjectNumber: c.subjectNumber,
          subjectTitle: c.subjectTitle,
          department: c.department
        }))
      }

      return {
        props: {
          userProp: JSON.parse(JSON.stringify(user)),
          classProp: JSON.parse(JSON.stringify(classData)),
          classReviewsProp: JSON.parse(JSON.stringify(reviewsData)),
          contentSubmissionProp: JSON.parse(JSON.stringify(contentSubmissionData)),
          gradePointsProp: lastGradeReportUpload ? JSON.parse(JSON.stringify(shuffleArray((gradePointsData.length > 3 || user.trustLevel >= 2) ? gradePointsData : []))) : [],
          myReview: JSON.parse(JSON.stringify(myReview)),
          reportsProp: JSON.parse(JSON.stringify(reports)),
          lastGradeReportUpload,
          embeddingStatus,
          relatedClasses: JSON.parse(JSON.stringify(relatedClasses))
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
