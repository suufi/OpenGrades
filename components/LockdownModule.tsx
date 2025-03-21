
import { Button, Card, Container, Divider, em, Group, List, LoadingOverlay, MultiSelect, NumberInput, Select, Space, Stack, Stepper, Switch, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useForm, UseFormReturnType, zodResolver } from '@mantine/form'
import { showNotification } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import React, { useContext, useEffect, useState } from 'react'
import { z } from 'zod'
import { UserContext } from '../components/UserContextProvider'
// import Class from '../models/Class'
import { useDebouncedState, useMediaQuery } from '@mantine/hooks'
import { IconCheck } from '@tabler/icons'
import Link from 'next/link'
import { IClass, IdentityFlags } from '../types'
import ClassSearch from './ClassSearch'

type State = {
  data: string
  status: 'initial' | 'loading' | 'error' | 'success'
}

type FormValues = {
  classes: { [key: string]: string[] },
  flatClasses: string[]
}

type UserProfile = {
  kerb?: string,
  name?: string,
  classOf?: number,
  affiliation?: string,
  flags?: IdentityFlags[],
  classes: string[] | { [key: string]: string[] },
  flatClasses?: string[],
  referredBy?: string
}

function LockdownModule ({ academicYears }: { academicYears: string[] }) {
  const { status, update } = useSession()
  const router = useRouter()
  const [active, setActive] = useState(0)
  const [referredBy, setReferredBy] = useDebouncedState<string>('', 500)
  const [referredByState, setReferredByState] = useState<State>({ data: '', status: 'initial' })
  const [academicYearsTaken, setAcademicYearsTaken] = useState<string[]>([])
  const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current))
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current))
  const [formLoading, setFormLoading] = useState(false)
  const { userProfile, setUserProfile } = useContext(UserContext)
  const isMobile = useMediaQuery(`(max-width: ${em(750)})`)
  const [gradeReport, setGradeReport] = useDebouncedState<string>('', 1000)
  const [partialReviewsEnabled, setPartialReviewsEnabled] = useState(true)
  const [partialReviewsData, setPartialReviewsData] = useState<{ class: string, letterGrade: string, dropped: boolean, firstYear: boolean }[]>([])

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


  const schema = z.object({
    kerb: z.string(),
    name: z.string(),
    classOf: z.number().min(2000).max(new Date().getFullYear() + 7),
    identityFlags: z.nativeEnum(IdentityFlags).array(),
    affiliation: z.string(),
    classes: z.record(z.array(z.string())),
    referredBy: z.string().optional()
  }).partial({
    flags: true,
    identityFlags: true,
    classes: true
  })
  const form = useForm<UserProfile>({
    initialValues: {
      kerb: status === 'authenticated' ? userProfile?.kerb : '',
      name: status === 'authenticated' ? userProfile?.name : '',
      classOf: status === 'authenticated' ? (userProfile?.classOf) : new Date().getFullYear(),
      affiliation: status === 'authenticated' ? userProfile?.affiliation : '',
      referredBy: '',
      flags: [],
      classes: {}
    },
    // mode: 'uncontrolled',
    validateInputOnBlur: true,
    validate: zodResolver(schema),

    transformValues: (values) => ({
      ...values,
      flatClasses: Object.values(values.classes).flat()
    })
  })

  useEffect(() => {
    console.log('user profile changed')
    form.setInitialValues({
      kerb: userProfile?.kerb,
      name: userProfile?.name,
      classOf: userProfile?.classOf,
      affiliation: userProfile?.affiliation,
      flags: userProfile?.flags || [],
      classes: Array.isArray(userProfile?.classesTaken)
        ? userProfile?.classesTaken.reduce(
          (acc: { [key: string]: string[] }, c: IClass) => {
            const key = `${c.term}`
            if (acc[key]) {
              acc[key].push(c._id)
            } else {
              acc[key] = [c._id]
            }
            return acc
          },
          {} as { [key: string]: string[] }
        )
        : {},
    })
    form.reset()
  }, [userProfile])

  async function submitProfile (values: UserProfile) {
    console.log('submitting profile')
    setFormLoading(true)
    await fetch('/api/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...values,
        referredBy: referredByState.status === 'success' ? referredBy : undefined,
        partialReviews: partialReviewsEnabled ? partialReviewsData : []
      })
    }).then(async (res) => {
      const body = await res.json()
      if (res.ok) {
        showNotification({
          title: 'Success!',
          message: 'Your account is now active!'
        })
        update()
        setUserProfile(body.data)
        router.push('/classes')
      } else {
        showNotification({
          title: 'Error!',
          message: body.message
        })
        setFormLoading(false)
      }
    })
    setFormLoading(false)
  }

  useEffect(() => {
    form.setValues({
      kerb: userProfile?.kerb,
      name: userProfile?.name,
      classOf: userProfile?.classOf,
      affiliation: userProfile?.affiliation
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!gradeReport) return
    setFormLoading(true)

    fetch('/api/me/grade-report-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gradeReport,
        withPartialReviews: partialReviewsEnabled,
      }),
    })
      .then(async (res) => {
        const body = await res.json()
        if (res.ok) {
          console.log(body)
          const { matchedClasses, partialReviews } = body.data
          if (partialReviews) {
            setPartialReviewsData(partialReviews)
          }

          // Extract academic years
          const newAcademicYearsTaken = [
            ...new Set((matchedClasses as IClass[]).map((c: IClass) => `${c.academicYear - 1}-${c.academicYear}`)),
          ]
          setAcademicYearsTaken(newAcademicYearsTaken)

          // Add partial reviews to classes
          const classesWithPartialReviews = matchedClasses.map((cls: IClass & { partialReviewGrade?: string; isDropped?: boolean }) => {
            const matchingPR = partialReviews.find((pr: any) => pr.class === cls._id)
            if (matchingPR) {
              cls.partialReviewGrade = matchingPR.letterGrade
              cls.isDropped = matchingPR.dropped
            }
            return cls
          })

          // Create a new object with the classes grouped by term
          const newClasses = classesWithPartialReviews.reduce((acc: { [key: string]: string[] }, c: IClass) => {
            const key = `${c.term}`
            if (acc[key]) {
              acc[key].push(c._id)
            } else {
              acc[key] = [c._id]
            }
            return acc
          }, {})

          form.setValues((prevValues) => ({
            ...prevValues,
            classes: {
              ...prevValues.classes,
              ...newClasses,
            },
          }))
        } else {
          console.error(body)
        }
        setFormLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setFormLoading(false)
      })
  }, [gradeReport, partialReviewsEnabled])


  return (status === 'authenticated')
    ? (
      <Container style={{ height: '100%', marginTop: 'var(--mantine-spacing-xl)' }}>
        <Card shadow='lg' withBorder p={'xl'} w={'95%'}>
          <LoadingOverlay visible={formLoading} overlayProps={{ blur: 2 }} />
          {/* <Flex direction={'column'} wrap={'nowrap'} justify={'flex-end'} align={'center'} style={{ height: '100%' }} gap='xl'> */}
          {/* {JSON.stringify(userProfile)} */}
          {/* {status} */}
          <form onSubmit={form.onSubmit((values) => submitProfile(values))}>
            <Stepper active={active} onStepClick={setActive} orientation={isMobile ? 'vertical' : 'horizontal'}>
              <Stepper.Step label="Introduction" description="Find out what we're about!">
                <Group>
                  <Title order={3}> Welcome to MIT OpenGrades! </Title>
                  <Text> Thank you so much for joining us. Before we get started, we do need some more information. The information you provide remains secure with the administrators of MITOpenGrades and will not be sold to any entity. This is a website run by students for students, so feel free to be as candid as you like. While you&apos;re here, be sure to adhere to the following guidelines:</Text>
                  <List withPadding>
                    <List.Item> <b>Do not report bad data</b>, including, but not limited to, knowingly incorrect letter grades, numeric grades, and hours/week. This platform runs on student-sourced data and posting bad data puts the entirety of the platform in jeopardy. If you made a mistake, feel free to go back and edit your post. If you see something sketchy, be sure to report it. </List.Item>
                    <List.Item> <b>Do not upload any content that can be considered academic dishonesty</b>, including past assignments and exams. Violations of this rule may result in a permanent ban from the platform and possible referral to Committee on Discipline. </List.Item>
                    <List.Item> <b>Be respectful at all times.</b> Yes, some classes might be awful, but do not post hurtful or inappropriate comments that can jeopardize the platform. </List.Item>
                    <List.Item> <b>Do not share information with fellow students who aren&apos;t signed up for OpenGrades.</b> This website runs on a collective effort and, as such, requires participation from as many people we can get. By letting other students use your account, other students miss out on critical experiences and perspectives. </List.Item>
                    <List.Item> <b>Do not tell your professors or share with them what&apos;s on here.</b> Content posted here is posted in confidence. To avoid any scandals or incidents with MIT administration or faculty, please do not share the contents of this website. </List.Item>
                    <List.Item> <b>Disclaimer:</b> remember that grade cutoffs may vary from year to year and professor to professor. The data collected here is only for historical view purposes. </List.Item>
                  </List>
                </Group>
              </Stepper.Step>
              <Stepper.Step label="Information Verification" description="Tell us more about you!">
                <Group grow>
                  <TextInput disabled {...form.getInputProps('kerb')} label="Kerb" />
                  <TextInput disabled {...form.getInputProps('name')} label="Name" />
                  <NumberInput {...form.getInputProps('classOf')} label="Class of" min={2019} max={2029} />
                </Group>
                <Space h='md' />
                <Select {...form.getInputProps('affiliation')} label="Affiliation" disabled data={['staff', 'student', 'affiliate']} />
                <Space h={'md'} />
                <Text c='dimmed' fz='sm'> Were you referred by a friend? Type their kerb below. They won't know anything that you post, don't worry. </Text>
                <TextInput defaultValue={referredBy} disabled={referredByState.status == 'loading'} onChange={(e) => setReferredBy(e.target.value)} error={referredByState.status == 'error' && referredByState.data} rightSectionPointerEvents='none' rightSection={referredByState.status == 'success' && <IconCheck color='green' />} label="OpenGrades Referral" placeholder='kerb' />
                {/* <Select {...form.getInputProps('department')} label="Department(s)" disabled data={['']}/> */}
                {/* <Space h="md" /> */}
                <Divider m={'md'} />
                <Text c='dimmed' fz='sm'>
                  The following field is optional. Data collected from this field will only be used in aggregate form to observe trends in classes where students of a particular background consistently have a less favorable experience compared to the overall rating of the class. If we do observe such a trend, we may reach out to the Office of Minority Education, student groups, and/or committees to identify and address issues.
                  The following definitions are used in the options below:
                </Text>
                <List withPadding>
                  <List.Item> <Text c='dimmed' fz='sm'>First Generation: no parent in your household has received a Bachelor&apos;s degree or more in any country. </Text> </List.Item>
                  <List.Item> <Text c='dimmed' fz='sm'>Low Income: you are a Pell-eligible student and/or your family EFC at MIT is &le; $5,000 </Text> </List.Item>
                  <List.Item> <Text c='dimmed' fz='sm'>International: any student who does not hold United States citizenship or permanent residency, regardless of where they live or attend school.⁠ </Text> </List.Item>
                </List>
                <Space h="sm" />
                <MultiSelect {...form.getInputProps('identityFlags')} label='Identity Flags (optional)' description="Please select identities that you identify with." data={[
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
                    label: 'Black, Indigenous, or Latino'
                  }
                ]} />
              </Stepper.Step>
              <Stepper.Step label="Class History" description="Add classes you've taken">
                <Stack>
                  <Text> To maintain the platform, we depend on students providing reviews for classes they&apos;ve taken in the past. In the semesters fields below, please input the classes you&apos;ve taken (or dropped). You don&apos;t have to review every class, but please try to review as many as you can. By listing a class below, we may reach out to you to request a class review if there is interest in a class but little to no reviews. </Text>
                  <Text> You can manually search for classes below or copy and paste your <Link target="_blank" href='https://student.mit.edu/cgi-bin/shrwsgrd.sh'>grade report</Link> (entire page) from the MIT Registrar. </Text>
                  <Textarea variant='filled' defaultValue={gradeReport} onChange={(e) => setGradeReport(e.target.value)} label="Grade Report" placeholder="Copy and paste your grade report here" />
                  <Switch
                    label="Generate prefilled reviews with your grades from your grade report"
                    checked={partialReviewsEnabled}
                    onChange={(event) => setPartialReviewsEnabled(event.currentTarget.checked)}
                  />
                  <Stack>
                    <MultiSelect placeholder="Select the academic years for which you attempted a class for" label="Academic year(s) you've taken classes" data={academicYears} value={academicYearsTaken} onChange={setAcademicYearsTaken} />
                    {
                      academicYearsTaken.length > 0
                        ? academicYearsTaken.sort().map((yearRange) => {
                          const year = Number(yearRange.substring(0, 4))
                          return (
                            <React.Fragment key={year}>
                              <Divider h={'sm'} />
                              <Title order={3}> 🍁 Fall {year} </Title>
                              <ClassSearch term={`${year + 1}FA`} display={`Fall ${Number(year)}-${year + 1}`} form={form as unknown as UseFormReturnType<FormValues>} />
                              <Title order={3}> ❄️ IAP {year + 1} </Title>
                              <ClassSearch term={`${year + 1}JA`} display={`IAP ${Number(year)}-${year + 1}`} form={form as unknown as UseFormReturnType<FormValues>} />
                              <Title order={3}> 🌹 Spring {year + 1} </Title>
                              <ClassSearch term={`${year + 1}SP`} display={`Spring ${Number(year)}-${year + 1}`} form={form as unknown as UseFormReturnType<FormValues>} />
                            </React.Fragment>
                          )
                        })
                        : (
                          <Text ta='center'> Select some classes above to show class listings. </Text>
                        )
                    }
                  </Stack>
                </Stack>
              </Stepper.Step>
            </Stepper>
            <Group justify="center" mt="xl">
              <Button variant="default" onClick={prevStep}>Back</Button>
              {active < 2 && <Button onClick={nextStep}>Next step</Button>}
              {active === 2 && <Button type='submit'>Submit</Button>}
            </Group>
          </form>
          {/* </Flex> */}
        </Card>
      </Container >
    )
    : (
      <Container>
        <Title> Welcome to MIT OpenGrades! </Title>

      </Container>
    )
}

export default LockdownModule
