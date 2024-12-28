
import { Text, Title, Tooltip, useMantineColorScheme, useMantineTheme } from '@mantine/core'

import styles from '../styles/components/GradeChart.module.css'
import { LetterGrade } from '../types'

const colorMap: Record<LetterGrade | string, string> = {
  A: '#40C057',
  B: '#15AABF',
  C: '#4C6EF5',
  D: '#BE4BDB',
  F: '#FA5252'
}

interface GradePoint {
  letterGrade: LetterGrade
  numericGrade: number
  verified: boolean
}

interface GradeChartProps {
  data: GradePoint[]
}

import classes from '../styles/components/GradeChart.module.css'

const GradeChart = ({ data }: GradeChartProps) => {
  // Declare state variables to store the data for the points and regions
  const { colorScheme } = useMantineColorScheme()

  const theme = useMantineTheme()

  // const { classes } = useStyles()

  function processPoints (points: GradePoint[]) {
    const reportedGradeCutoffs: Record<LetterGrade, number[]> = {
      A: [-1, -1],
      B: [-1, -1],
      C: [-1, -1],
      D: [-1, -1],
      F: [-1, -1],
      DR: [NaN, NaN]
    }

    points.forEach((point) => {
      console.log('point', point)
      console.log('reported cutfoff', reportedGradeCutoffs)
      console.log(point.numericGrade, reportedGradeCutoffs[point.letterGrade][0])

      if (reportedGradeCutoffs[point.letterGrade][0] === -1 || reportedGradeCutoffs[point.letterGrade][1] === -1) {
        if (point.letterGrade === LetterGrade.A) {
          reportedGradeCutoffs[point.letterGrade][0] = point.numericGrade
          reportedGradeCutoffs[point.letterGrade][1] = 100
        } else if (point.letterGrade === LetterGrade.F) {
          reportedGradeCutoffs[point.letterGrade][1] = point.numericGrade
          reportedGradeCutoffs[point.letterGrade][0] = 0
        } else {
          reportedGradeCutoffs[point.letterGrade][0] = point.numericGrade
          reportedGradeCutoffs[point.letterGrade][1] = point.numericGrade
        }
      } else {
        if (point.numericGrade < reportedGradeCutoffs[point.letterGrade][0]) {
          if (point.letterGrade !== LetterGrade.F) {
            reportedGradeCutoffs[point.letterGrade][0] = point.numericGrade
          } else {
            reportedGradeCutoffs[point.letterGrade][1] = point.numericGrade
          }
        } else if (point.numericGrade > reportedGradeCutoffs[point.letterGrade][1]) {
          if (point.letterGrade !== LetterGrade.F) {
            reportedGradeCutoffs[point.letterGrade][1] = point.numericGrade
          } else {
            reportedGradeCutoffs[point.letterGrade][0] = point.numericGrade
          }
        }
        // if (point.numericGrade < reportedGradeCutoffs[point.letterGrade][0]) {
        //   console.log('adjusting', point.numericGrade < reportedGradeCutoffs[point.letterGrade][0])
        //   reportedGradeCutoffs[point.letterGrade][0] = point.numericGrade
        //   if (point.letterGrade !== Grade.F) {
        //     reportedGradeCutoffs[downgradeLetter(point.letterGrade)][1] = point.numericGrade
        //   }
        // } else if (point.numericGrade > reportedGradeCutoffs[point.letterGrade][1]) {
        //   reportedGradeCutoffs[point.letterGrade][1] = point.numericGrade
        //   if (point.letterGrade !== Grade.A) {
        //     reportedGradeCutoffs[downgradeLetter(point.letterGrade)][0] = point.numericGrade
        //   }
        // }
      }

      console.log(reportedGradeCutoffs)
    })

    return Object.fromEntries(Object.entries(reportedGradeCutoffs).filter(([, boundaries]) => !boundaries.includes(-1)))
  }

  const gradePoints = data.filter((entry) => entry.letterGrade !== "DR" && entry?.numericGrade).map((entry) => ({ numericGrade: entry.numericGrade, letterGrade: entry.letterGrade, verified: entry.verified }))
  // const gradePoints = [{
  //   numericGrade: 80,
  //   letterGrade: 'A',
  //   verified: true
  // }, {
  //   numericGrade: 70,
  //   letterGrade: 'B',
  //   verified: true
  // }, {
  //   numericGrade: 78,
  //   letterGrade: 'B',
  //   verified: true
  // }, {
  //   numericGrade: 60,
  //   letterGrade: 'C',
  //   verified: true
  // }, {
  //   numericGrade: 50,
  //   letterGrade: 'C',
  //   verified: true
  // }, {
  //   numericGrade: 40,
  //   letterGrade: 'D',
  //   verified: true
  // }, {
  //   numericGrade: 45,
  //   letterGrade: 'D',
  //   verified: true
  // }, {
  //   numericGrade: 30,
  //   letterGrade: 'F',
  //   verified: true
  // }, {
  //   numericGrade: 90,
  //   letterGrade: 'A',
  //   verified: true
  // }, {
  //   numericGrade: 0,
  //   letterGrade: 'F',
  //   verified: true
  // }]

  const processedPoints = processPoints(gradePoints)
  const keyPoints = Object.values(processedPoints).flat()

  const regions = [{ start: 0, end: 100, color: colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[2], letter: 'Unknown' }, ...Object.entries(processedPoints).map(entry => {
    console.log(entry)
    return {
      start: entry[1][0],
      end: entry[1][1],
      color: colorMap[entry[0]],
      letter: entry[0]
    }
  })]

  return (
    <>
      <Title order={3}> Grade Line </Title>
      <div className={classes.numberLine}>
        {regions.map(region => (
          <Tooltip key={region.start} multiline w={220} position="bottom" label={region.letter !== 'Unknown' ? `Letter region: ${region.letter}` : 'More data is required to fill this region.'}>
            <div
              className={`${styles.region} ${region.start === 0 && styles.regionLeft} ${region.end === 100 && styles.regionRight}`}
              style={{
                left: `${region.start - 0.02}%`,
                right: `${100 - region.end}%`,
                backgroundColor: region.color
              }}
            />
          </Tooltip>
        ))}
        {gradePoints.map((point, index) => (
          // <div className={styles.pointContainer} key={index}>
          <Tooltip key={index} multiline w={100} position="bottom" label={`Numeric grade: ${point.numericGrade}\nLetter grade: ${point.letterGrade}`}>
            <div className={styles.pointContainer} style={{ left: `${point.numericGrade}%`, opacity: `${keyPoints.includes(point.numericGrade) ? '100%' : '50%'}` }}>
              <div
                className={point.numericGrade === 100 ? classes.lastPoint : point.numericGrade === 0 ? classes.firstPoint : classes.point}
              />
              {
                keyPoints.includes(point.numericGrade) && <Text className={classes.pointLabel}>
                  {point.numericGrade}
                </Text>
              }
            </div>
          </Tooltip>
        ))}
      </div>
    </>
  )
}

export default GradeChart
