// @ts-nocheck
import { auth } from '@/utils/auth'
import type { NextApiRequest, NextApiResponse } from 'next'
import Class from '../../../models/Class'
import mongoConnection from '../../../utils/mongoConnection'

const parseGradeReport = (gradeReport) => {
    // Replace escaped characters to process correctly
    gradeReport = gradeReport.replace(/\\n/g, '\n').replace(/\\t/g, '\t')

    const sections = gradeReport.split(/\n\n/)
    const parsedClasses = []
    let currentTerm = null
    let currentYear = null

    sections.forEach((section) => {
        const lines = section.split('\n')

        // Check for the term and year in the section
        const termLine = lines.find((line) => line.includes('Term') && !line.includes('Units Earned'))
        if (termLine) {
            const academicYearMatch = termLine.match(/(\d{4})-(\d{4})/)
            currentYear = academicYearMatch ? parseInt(academicYearMatch[1]) + 1 : currentYear
            currentTerm = termLine.includes('Fall')
                ? 'Fall'
                : termLine.includes('Spring')
                    ? 'Spring'
                    : termLine.includes('January')
                        ? 'January'
                        : termLine.includes('Summer')
                            ? 'Summer'
                            : currentTerm
        }

        // Parse class information
        lines.forEach((line) => {
            if (!line.includes('Subject Number') && !line.includes('Units Earned') && !line.includes('Term GPA')) {
                const parts = line.split(/\t+/) // Use tab as the delimiter
                if (parts.length >= 5) {
                    const [subjectNumber, subjectTitle, units, level, grade] = parts
                    if (subjectNumber && !subjectNumber.startsWith('HA') && !['P&', 'S'].includes(grade)) { // Exclude Harvard classes
                        parsedClasses.push({
                            subjectNumber: subjectNumber.trim(),
                            subjectTitle: subjectTitle?.trim(),
                            units: parseInt(units) || 0,
                            level: level?.trim(),
                            grade: grade?.trim(),
                            academicYear: currentYear,
                            term: currentTerm,
                        })
                    }
                }
            }
        })
    })

    console.log(parsedClasses)
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

    // if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

    if (method === 'POST') {
        try {
            const { gradeReport } = body

            if (!gradeReport) {
                return res.status(400).json({ success: false, message: 'Grade report is required.' })
            }

            // Ensure the gradeReport is a string and parse it accordingly
            const reportContent = typeof gradeReport === 'string' ? gradeReport : JSON.stringify(gradeReport)

            // Parse the grade report
            const parsedClasses = parseGradeReport(reportContent)

            // Match the parsed classes against the MongoDB collection
            const matchedClasses = []

            for (const cls of parsedClasses) {
                const matchedClass = await Class.findOne({
                    $or: [
                        { subjectNumber: cls.subjectNumber },
                        { aliases: cls.subjectNumber },
                    ],
                    academicYear: cls.academicYear,
                    term: cls.academicYear.toString() + parseTerm(cls.term),
                })

                if (matchedClass) {
                    matchedClasses.push(matchedClass)
                }
            }

            return res.status(200).json({ success: true, data: matchedClasses })
        } catch (error) {
            return res.status(500).json({ success: false, message: error.toString() })
        }
    } else {
        res.status(405).json({ success: false, message: 'Method not allowed' })
    }
}
