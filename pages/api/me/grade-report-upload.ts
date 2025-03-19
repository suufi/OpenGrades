// @ts-nocheck
import { auth } from '@/utils/auth'
import type { NextApiRequest, NextApiResponse } from 'next'
import Class from '../../../models/Class'
import mongoConnection from '../../../utils/mongoConnection'

const parseGradeReport = (gradeReport) => {
    // Normalize all input formatting issues
    gradeReport = gradeReport
        .replace(/\\n/g, '\n').replace(/\\t/g, '\t') // escape cleanup
        .replace(/\u00a0/g, ' ') // Safari non-breaking space
        .replace(/\r\n|\r|\u2028|\u2029/g, '\n') // newline normalization
        .replace(/[ \t]{2,}/g, '\t') // multiple spaces/tabs to tab
        .replace(/\n[ \t]+/g, '\n') // remove leading whitespace on lines

    const termRegex = /(Fall Term|Spring Term|January Term|Summer Term) \d{4}-\d{4}/g

    const parsedClasses = []

    let termMatches = [...gradeReport.matchAll(termRegex)]

    for (let i = 0; i < termMatches.length; i++) {
        const termHeader = termMatches[i][0]
        const startIndex = termMatches[i].index
        const endIndex = i + 1 < termMatches.length ? termMatches[i + 1].index : gradeReport.length

        const section = gradeReport.slice(startIndex, endIndex).trim()
        const lines = section.split('\n')

        // Skip summer terms
        if (termHeader.includes('Summer Term')) continue

        // Get academic year and term name
        const academicYearMatch = termHeader.match(/(\d{4})-(\d{4})/)
        const currentYear = academicYearMatch ? parseInt(academicYearMatch[1]) + 1 : null
        const currentTerm = termHeader.includes('Fall') ? 'Fall'
            : termHeader.includes('Spring') ? 'Spring'
                : termHeader.includes('January') ? 'January'
                    : 'Unknown'

        // Check if it's freshman year
        const isYear1 = section.includes('Year: 1 R')

        // Parse class lines
        lines.forEach((line) => {
            if (
                !line.includes('Subject Number') &&
                !line.includes('Units Earned') &&
                !line.includes('Term GPA') &&
                !line.includes('Academic:')
            ) {
                let parts = line.split(/\t+/)
                if (parts.length === 1) parts = line.split(/ {4,}/)

                if (parts.length >= 5) {
                    const [subjectNumber, subjectTitle, units, level, grade] = parts
                    if (
                        subjectNumber &&
                        !subjectNumber.startsWith('HA') &&
                        !['P&', 'S', 'URN'].includes(grade) &&
                        currentTerm
                    ) {
                        parsedClasses.push({
                            subjectNumber: subjectNumber.trim(),
                            subjectTitle: subjectTitle?.trim(),
                            units: parseInt(units) || 0,
                            level: level?.trim(),
                            grade: grade?.trim().replace("OX/", "").replace("I/", ""),
                            academicYear: currentYear,
                            term: currentTerm,
                            freshman: isYear1,
                        })
                    }
                }
            }
        })
    }

    return parsedClasses
}


const parseTerm = (term) => {
    switch (term) {
        case 'Fall':
            return 'FA'
        case 'Spring':
            return 'SP'
        case 'January':
            return 'JA'
        default:
            return 'UNKNOWN'
    }
}

type Data = {
    success: boolean
    data?: object
    message?: string
}

export default async function handler (req: NextApiRequest, res: NextApiResponse<Data>) {
    await mongoConnection()
    const { method, body } = req

    const session = await auth(req, res)

    if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    if (method === 'POST') {

        try {
            const { gradeReport, withPartialReviews } = body

            if (!gradeReport) {
                return res.status(400).json({ success: false, message: 'Grade report is required.' })
            }

            // Ensure the gradeReport is a string and parse it accordingly
            const reportContent = typeof gradeReport === 'string' ? gradeReport : JSON.stringify(gradeReport)

            // Parse the grade report
            const parsedClasses = parseGradeReport(reportContent)

            // Match the parsed classes against the MongoDB collection
            const matchedClasses = []
            const partialReviews = []

            for (const cls of parsedClasses) {
                const matchedClass = await Class.findOne({
                    $or: [
                        { subjectNumber: cls.subjectNumber },
                        { aliases: cls.subjectNumber },
                    ],
                    academicYear: cls.academicYear,
                    term: cls.academicYear.toString() + parseTerm(cls.term),
                    reviewable: true
                })

                if (matchedClass) {
                    matchedClasses.push(matchedClass)
                    if (withPartialReviews && ['A', 'B', 'C', 'D', 'F', 'P'].includes(cls.grade[0])) {
                        // only include P grades if the class is P/D/F
                        if (cls.grade === 'P' && !matchedClass.units.includes('P/D/F')) {
                            continue
                        }
                        // do not include ASE grades
                        if (cls.grade === 'P&') {
                            continue
                        }
                        const partialReview = {
                            class: matchedClass._id,
                            letterGrade: cls.grade,
                            partial: true,
                            display: false,
                            firstYear: cls.freshman,
                            dropped: cls.grade == 'DR'
                        }

                        partialReviews.push(partialReview)
                    }
                }
            }

            return res.status(200).json({ success: true, data: { matchedClasses, partialReviews } })
        } catch (error) {
            return res.status(500).json({ success: false, message: error.toString() })
        }
    } else {
        res.status(405).json({ success: false, message: 'Method not allowed' })
    }
}
