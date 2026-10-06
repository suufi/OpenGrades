import { Button, Container, NumberFormatter, Text, Title } from '@mantine/core'
import { signIn } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'

import styles from '@/styles/Landing.module.css'
import ui from '@/styles/Interface.module.css'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/utils/appStoreLinks'

const FEEDBACK_URL = 'https://forms.gle/pyj7zY45AVnjX2Nc8'
const LAUNCH_ARTICLE_URL = 'https://thetech.com/2025/01/23/opengrades-debut'

export interface LandingStats {
  classCount: number
  userCount: number
  reviewCount: number
}

const STAT_LABELS: [keyof LandingStats, string][] = [
  ['classCount', 'Classes'],
  ['userCount', 'Users'],
  ['reviewCount', 'Data Points'],
]

export default function Landing({ stats }: { stats: LandingStats }) {
  return (
    <Container size="lg" px="md" className={ui.page}>
      <Head>
        <title>MIT OpenGrades</title>
        <meta name="description" content="Anonymous class reviews written by MIT students." />
        <link rel="icon" href="/static/images/favicon.ico" />
      </Head>

      <div className={styles.stack}>
        <header className={ui.hero}>
          <Title order={1} className={`${ui.heroTitle} ${styles.title}`}>
            Welcome to OpenGrades
          </Title>
          <Text className={ui.heroSubtitle}>
            A new way to review MIT classes, by MIT students for MIT students.
          </Text>
        </header>

        <div className={styles.stats}>
          {STAT_LABELS.map(([key, label]) => (
            <div key={key} className={ui.statCard}>
              <p className={ui.statLabel}>{label}</p>
              <p className={ui.statValue}>
                <NumberFormatter value={stats[key]} thousandSeparator />
              </p>
            </div>
          ))}
        </div>

        <div className={styles.columns}>
          <section className={`${ui.sectionCard} ${styles.card}`}>
            <h2 className={ui.sectionTitle}>Why it exists</h2>
            <p className={ui.sectionDescription}>
              MIT&apos;s subject evaluations publish scores on a 1–7 scale, but not the comments
              students write. OpenGrades started in 2022 as a student project to fill that gap, and
              launched with SIPB in December 2024.
            </p>
            <div className={styles.cardFoot}>
              <a className={styles.link} href={LAUNCH_ARTICLE_URL} target="_blank" rel="noopener noreferrer">
                Read The Tech&apos;s story on the launch
              </a>
            </div>
          </section>

          <section className={`${ui.sectionCard} ${styles.card}`}>
            <h2 className={ui.sectionTitle}>How reviews work</h2>
            <p className={ui.sectionDescription}>
              Sign in with your Kerberos, add the classes you&apos;ve taken, and write about them.
              Reviews are anonymous and only visible to MIT students, and readers can flag any that
              look wrong.
            </p>
            <div className={styles.cardFoot}>
              <Button variant="default" onClick={() => signIn('mit-oidc', { callbackUrl: '/' })}>
                Sign in with MIT
              </Button>
            </div>
          </section>

        </div>

        <section className={`${ui.sectionCard} ${styles.card}`}>
          <h2 className={ui.sectionTitle}>What you get</h2>
          <ul className={styles.featureList}>
            <li>Anonymous reviews and grade distributions</li>
            <li>MIT and Harvard course catalog, with search and filters</li>
            <li>AI search across descriptions, reviews, and uploaded materials</li>
            <li>Discover — hidden gems, trending classes, what&apos;s new</li>
            <li>Prerequisite graphs and the full class network</li>
            <li>Who&apos;s Taken What, by major and class year</li>
            <li>Shared syllabi, schedules, and other course files</li>
          </ul>
        </section>

        <footer className={styles.footer}>
          <span>
            Run by students at{' '}
            <a href="https://sipb.mit.edu" target="_blank" rel="noopener noreferrer">SIPB</a>.
            {' '}Also on{' '}
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">iOS</a> and{' '}
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Android</a>.
          </span>
          <nav className={styles.footerLinks} aria-label="About OpenGrades">
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Feedback</a>
          </nav>
        </footer>
      </div>
    </Container>
  )
}
