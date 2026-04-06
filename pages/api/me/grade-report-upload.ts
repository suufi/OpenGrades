import { withApiLogger } from '@/utils/apiLogger'
import type { NextApiRequest, NextApiResponse } from 'next'
import Class from '@/models/Class'
import User from '@/models/User'
import mongoConnection from '@/utils/mongoConnection'
import { getUserFromRequest } from '@/utils/authMiddleware'
import {
    createGradeReportTermHeaderRegex,
    getAcademicYearFromGradeReportHeader,
    getTermSuffixFromGradeReportHeader,
} from '@/utils/formatTerm'
import { isMitGradeReportSubjectNumber, matchMitGradeReportSubjectLinePrefix } from '@/utils/courseNumbers'
import formidable from 'formidable'
import fs from 'fs'

const parseGradeReport = (gradeReport) => {
    // Normalize all input formatting issues
    gradeReport = gradeReport
        .replace(/\\n/g, '\n').replace(/\\t/g, '\t') // escape cleanup
        .replace(/\u00a0/g, ' ') // Safari non-breaking space
        .replace(/\r\n|\r|\u2028|\u2029/g, '\n') // newline normalization
        .replace(/[ \t]{2,}/g, '\t') // multiple spaces/tabs to tab
        .replace(/\n[ \t]+/g, '\n') // remove leading whitespace on lines

    const parsedClasses = []
    const creditedSubjects: string[] = []

    let termMatches = [...gradeReport.matchAll(createGradeReportTermHeaderRegex())]

    for (let i = 0; i < termMatches.length; i++) {
        const termHeader = termMatches[i][0]
        const startIndex = termMatches[i].index
        const endIndex = i + 1 < termMatches.length ? termMatches[i + 1].index : gradeReport.length

        const section = gradeReport.slice(startIndex, endIndex).trim()
        const lines = section.split('\n')

        const currentYear = getAcademicYearFromGradeReportHeader(termHeader)
        const currentTermSuffix = getTermSuffixFromGradeReportHeader(termHeader)

        if (currentTermSuffix === 'SU' || !currentYear || !currentTermSuffix) continue

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
                    const trimmedSubject = subjectNumber?.trim()
                    const trimmedGrade = grade?.trim()

                    // Skip Harvard, general AP credit, and paid UROP credit
                    if (!trimmedSubject || trimmedSubject.startsWith('HA') || trimmedSubject === 'GEN.APCR') return
                    if (trimmedGrade === 'URN') return

                    // ASE credit: any grade ending in '&' (e.g. P&, A&, B&)
                    if (trimmedGrade?.endsWith('&')) {
                        if (!creditedSubjects.includes(trimmedSubject)) {
                            creditedSubjects.push(trimmedSubject)
                        }
                        return
                    }

                    // Transfer credit: grade is 'S'
                    if (trimmedGrade === 'S') {
                        if (!creditedSubjects.includes(trimmedSubject)) {
                            creditedSubjects.push(trimmedSubject)
                        }
                        return
                    }

                    parsedClasses.push({
                        subjectNumber: trimmedSubject,
                        subjectTitle: subjectTitle?.trim(),
                        units: parseInt(units) || 0,
                        level: level?.trim(),
                        grade: trimmedGrade?.replace("OX/", "").replace("I/", ""),
                        academicYear: currentYear,
                        term: `${currentYear}${currentTermSuffix}`,
                        freshman: isYear1,
                    })
                }
            }
        })
    }

    return { parsedClasses, creditedSubjects }
}

/** Fallback HTML to text when table walk does not apply. */
function extractTextFromHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|tr|li|h[1-6])[^>]*>/gi, '\n')
        .replace(/<\/?(td|th)[^>]*>/gi, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/[ \t]{2,}/g, '\t')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

const TERM_ROW_LABEL: Record<string, string> = {
    fall: 'Fall Term',
    spring: 'Spring Term',
    january: 'January Term',
    summer: 'Summer Term',
}

function htmlCellToPlain(raw: string): string {
    return raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\s+/g, ' ')
        .trim()
}

function extractCellsFromTrInner(inner: string): string[] {
    const cells: string[] = []
    const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
    let cm: RegExpExecArray | null
    while ((cm = tdRe.exec(inner)) !== null) {
        cells.push(htmlCellToPlain(cm[1]))
    }
    return cells
}

/** Skip <tr> rows that duplicate a term header already found in a div. */
function rowToTermHeaderLine(cells: string[]): string | null {
    const j = cells.join(' ')
    const mm = j.match(/(Fall|Spring|January|Summer)\s+Term\s+(\d{4}-\d{4})/i)
    if (!mm) return null
    const label = TERM_ROW_LABEL[mm[1].toLowerCase()]
    if (!label) return null
    return `${label} ${mm[2]}`
}

/**
 * Grade report HTML puts term titles in <div><b>Fall Term YYYY-YYYY</b>, not in <tr>.
 * Summer appears as "Summer Term 2023" (one year) — normalize to YYYY-YYYY for regex parity.
 */
function extractTermHeaderPositions(html: string): { idx: number; line: string }[] {
    const out: { idx: number; line: string }[] = []
    const re = /\b(Fall|Spring|January|Summer)\s+Term\s+((\d{4})-(\d{4})|(\d{4}))\b/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
        const label = TERM_ROW_LABEL[m[1].toLowerCase()]
        if (!label) continue
        let line: string
        if (m[3] != null && m[4] != null) {
            line = `${label} ${m[3]}-${m[4]}`
        } else if (m[5] != null) {
            const y = parseInt(m[5], 10)
            if (!Number.isFinite(y)) continue
            line = `${label} ${y - 1}-${y}`
        } else {
            continue
        }
        out.push({ idx: m.index, line })
    }
    return out
}

type OrderedLine = { idx: number; line: string }

/** Merge div term headers with <tr> rows in document order; keeping first 5 columns of wide tables. */
function tryBuildGradeReportFromHtmlTables(html: string): string | null {
    const terms = extractTermHeaderPositions(html)
    const events: OrderedLine[] = [...terms]

    let classRows = 0
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    let m: RegExpExecArray | null
    while ((m = trRe.exec(html)) !== null) {
        const inner = m[1]
        if (/<\s*tr\b/i.test(inner)) continue
        const cells = extractCellsFromTrInner(inner)
        if (cells.length === 0) continue

        if (rowToTermHeaderLine(cells)) continue

        const c0 = cells[0].trim()
        let tabLine: string | null = null
        if (cells.length >= 5 && isMitGradeReportSubjectNumber(c0)) {
            tabLine = cells.map((c) => c.trim()).slice(0, 5).join('\t')
        } else if (cells.length === 4 && isMitGradeReportSubjectNumber(c0)) {
            const tab4 = cells.map((c) => c.trim()).join('\t')
            const repaired = repairHtmlDerivedGradeRows(tab4).split('\n')[0]
            const n = repaired.split(/\t+/).map((p) => p.trim()).filter((p) => p.length > 0).length
            if (n >= 5) {
                tabLine = repaired.split(/\t+/).map((p) => p.trim()).slice(0, 5).join('\t')
            }
        }

        if (tabLine) {
            events.push({ idx: m.index, line: tabLine })
            classRows++
        }
    }

    if (terms.length < 1 || classRows < 1) return null

    events.sort((a, b) => a.idx - b.idx)
    return events.map((e) => e.line).join('\n')
}

/** Repair 4-column tab lines from flattened HTML (merged level/grade, etc.). */
function repairHtmlDerivedGradeRows(text: string): string {
    const unitsCell = /^\d+(\.\d+)?$/
    const looksLikeGradeOnly = (s: string) =>
        s.length >= 1 &&
        s.length <= 24 &&
        !/[\s\r\n\t]/.test(s) &&
        /^[A-Z0-9/+&.()\-]+$/i.test(s)

    return text
        .split('\n')
        .map((line) => {
            let parts = line.split(/\t+/).map((p) => p.trim())
            while (parts.length && parts[0] === '') parts.shift()
            while (parts.length && parts[parts.length - 1] === '') parts.pop()

            if (parts.length !== 4) return line
            const [col0, col1, col2, col3] = parts
            if (!isMitGradeReportSubjectNumber(col0) || !unitsCell.test(col2)) return line

            const wordThenGrade = col3.match(/^([A-Za-z]{1,24})[\s\u00a0]+(.+)$/)
            if (wordThenGrade && looksLikeGradeOnly(wordThenGrade[2].trim())) {
                return [col0, col1, col2, wordThenGrade[1], wordThenGrade[2].trim()].join('\t')
            }

            if (!/[\s\u00a0]/.test(col3) && looksLikeGradeOnly(col3)) {
                return [col0, col1, col2, '', col3].join('\t')
            }

            return line
        })
        .join('\n')
}

/** Heuristic: space-separated class line to five tab fields (fallback path). */
function splitSpaceSeparatedGradeLineToTabs(line: string): string | null {
    const t = line.trim()
    if (!t) return null
    const head = matchMitGradeReportSubjectLinePrefix(t)
    if (!head) return null
    const { subject, rest } = head
    const tok = rest.trim().split(/\s+/).filter(Boolean)
    if (tok.length < 4) return null

    const gradeOk = (g: string) =>
        g.length >= 1 &&
        g.length <= 24 &&
        /^[A-Z0-9/+&.()\-]+$/i.test(g)
    const levelOk = (lv: string) =>
        lv.length >= 1 &&
        lv.length <= 24 &&
        /^[A-Za-z0-9/.\-]+$/.test(lv)

    for (let i = tok.length - 3; i >= 1; i--) {
        const unitsStr = tok[i]
        if (!/^\d+(\.\d+)?$/.test(unitsStr)) continue
        const u = parseFloat(unitsStr)
        if (u > 36 || u < 0) continue
        const level = tok[i + 1]
        const grade = tok[i + 2]
        if (!levelOk(level) || !gradeOk(grade)) continue
        const title = tok.slice(0, i).join(' ')
        if (title.length < 1) continue
        return `${subject}\t${title}\t${unitsStr}\t${level}\t${grade}`
    }

    if (tok.length >= 3) {
        const unitsStr = tok[tok.length - 2]
        const grade = tok[tok.length - 1]
        if (/^\d+(\.\d+)?$/.test(unitsStr)) {
            const u = parseFloat(unitsStr)
            if (u <= 36 && u >= 0 && gradeOk(grade)) {
                const title = tok.slice(0, tok.length - 2).join(' ')
                if (title.length >= 1) {
                    return `${subject}\t${title}\t${unitsStr}\t\t${grade}`
                }
            }
        }
    }
    return null
}

function normalizeSpaceSeparatedHtmlGradeRows(text: string): string {
    return text
        .split('\n')
        .map((line) => {
            const nonempty = line.split(/\t+/).map((p) => p.trim()).filter((p) => p.length > 0)
            if (nonempty.length >= 5) return line
            return splitSpaceSeparatedGradeLineToTabs(line) ?? line
        })
        .join('\n')
}

function htmlToGradeReportText(html: string): string {

    const fromTables = tryBuildGradeReportFromHtmlTables(html)
    if (fromTables) {
        return fromTables
    }

    const raw = extractTextFromHtml(html)

    const rest = normalizeSpaceSeparatedHtmlGradeRows(repairHtmlDerivedGradeRows(raw))
    return rest
}

/**
 * Parse a .webarchive file (Apple binary plist format) to extract HTML content.
 * Returns the extracted plain text.
 */
async function parseWebarchive(buffer: Buffer): Promise<string> {
    // bplist-parser is a CommonJS module
    const bplistParser = await import('bplist-parser')
    const parsed: any = (bplistParser as any).parseBuffer(buffer)

    if (!parsed || !Array.isArray(parsed) || (parsed as any[]).length === 0) {
        throw new Error('Invalid .webarchive file: could not parse binary plist')
    }

    const root = parsed[0]
    const mainResource = root?.WebMainResource
    if (!mainResource) {
        throw new Error('Invalid .webarchive file: no WebMainResource found')
    }

    const webResourceData = mainResource.WebResourceData
    if (!webResourceData) {
        throw new Error('Invalid .webarchive file: no WebResourceData found')
    }

    const html = Buffer.isBuffer(webResourceData)
        ? webResourceData.toString('utf-8')
        : String(webResourceData)

    return htmlToGradeReportText(html)
}

function parseMhtml(content: string): string {
    const boundaryMatch = content.match(/boundary="?([^"\r\n]+)"?/i)
    if (!boundaryMatch) return htmlToGradeReportText(content)

    const boundary = boundaryMatch[1]
    const parts = content.split(`--${boundary}`)

    for (const part of parts) {
        if (part.includes('Content-Type: text/html') || part.includes('content-type: text/html')) {
            const headerEnd = part.indexOf('\r\n\r\n') !== -1
                ? part.indexOf('\r\n\r\n') + 4
                : part.indexOf('\n\n') + 2
            if (headerEnd > 3) {
                let body = part.slice(headerEnd)

                if (part.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
                    body = body
                        .replace(/=\r?\n/g, '')
                        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
                            String.fromCharCode(parseInt(hex, 16))
                        )
                }

                if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
                    body = Buffer.from(body.trim(), 'base64').toString('utf-8')
                }

                return htmlToGradeReportText(body)
            }
        }
    }

    return htmlToGradeReportText(content)
}

type Data = {
    success: boolean
    data?: object
    message?: string
}

async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
    await mongoConnection()
    const { method } = req

    const user = await getUserFromRequest(req, res)
    if (!user) return res.status(403).json({ success: false, message: 'Please sign in.' })

    if (method === 'POST') {

        try {
            let reportText: string | null = null
            let withPartialReviews = false

            const contentType = req.headers['content-type'] || ''

            if (contentType.includes('multipart/form-data')) {
                const form = formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024 })

                const { fields, files } = await new Promise<{
                    fields: Record<string, any>
                    files: Record<string, any>
                }>((resolve, reject) => {
                    form.parse(req, (err, fields, files) => {
                        if (err) reject(err)
                        else resolve({ fields, files })
                    })
                })

                withPartialReviews = fields.withPartialReviews?.[0] === 'true' || fields.withPartialReviews === 'true'

                const file = Array.isArray(files.file) ? files.file[0] : files.file
                if (!file) {
                    return res.status(400).json({ success: false, message: 'No file uploaded.' })
                }

                const originalName = (file.originalFilename || '').toLowerCase()
                const fileBuffer = fs.readFileSync(file.filepath)

                if (originalName.endsWith('.webarchive')) {
                    reportText = await parseWebarchive(fileBuffer)
                } else if (originalName.endsWith('.mhtml') || originalName.endsWith('.mht')) {
                    reportText = parseMhtml(fileBuffer.toString('utf-8'))
                } else if (originalName.endsWith('.html') || originalName.endsWith('.htm')) {
                    reportText = htmlToGradeReportText(fileBuffer.toString('utf-8'))
                } else {
                    const firstBytes = fileBuffer.slice(0, 8).toString('latin1')
                    if (firstBytes === 'bplist00') {
                        reportText = await parseWebarchive(fileBuffer)
                    } else {
                        const text = fileBuffer.toString('utf-8')
                        if (text.includes('<html') || text.includes('<HTML') || text.includes('<!DOCTYPE')) {
                            reportText = htmlToGradeReportText(text)
                        } else {
                            reportText = text
                        }
                    }
                }

                // Clean up temp file
                try { fs.unlinkSync(file.filepath) } catch { }

            } else {
                // Original JSON body path (web app sends text)
                // bodyParser is disabled so read the body manually
                const rawBody = await new Promise<string>((resolve, reject) => {
                    let data = ''
                    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
                    req.on('end', () => resolve(data))
                    req.on('error', reject)
                })
                const body = JSON.parse(rawBody)
                const { gradeReport, withPartialReviews: wpr } = body
                withPartialReviews = !!wpr

                if (!gradeReport) {
                    return res.status(400).json({ success: false, message: 'Grade report is required.' })
                }

                reportText = typeof gradeReport === 'string' ? gradeReport : JSON.stringify(gradeReport)
            }

            if (!reportText || reportText.trim().length === 0) {
                return res.status(400).json({ success: false, message: 'Could not extract text from the uploaded file.' })
            }

            // Parse the grade report
            const { parsedClasses, creditedSubjects } = parseGradeReport(reportText)

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
                    term: cls.term,
                    reviewable: true
                })

                if (matchedClass) {
                    matchedClasses.push(matchedClass)
                    if (withPartialReviews && cls.grade && cls.grade.length > 0 && ['A', 'B', 'C', 'D', 'F', 'P'].includes(cls.grade[0])) {
                        if (cls.grade === 'P' && !matchedClass.units.includes('P/D/F')) {
                            continue
                        }
                        const partialReview = {
                            class: matchedClass._id,
                            letterGrade: cls.grade,
                            partial: true,
                            display: false,
                            firstYear: cls.freshman,
                            droppedClass: cls.grade == 'DR'
                        }

                        partialReviews.push(partialReview)
                    }
                }
            }

            if (creditedSubjects.length > 0) {
                await User.updateOne(
                    { email: user.email.toLowerCase() },
                    { $addToSet: { creditedSubjects: { $each: creditedSubjects } } }
                )
            }

            return res.status(200).json({ success: true, data: { matchedClasses, partialReviews, creditedSubjects } })
        } catch (error) {
            console.error('Grade report upload error:', error)
            return res.status(500).json({ success: false, message: error.toString() })
        }
    } else {
        res.status(405).json({ success: false, message: 'Method not allowed' })
    }
}

export default withApiLogger(handler)

export const config = {
    api: {
        bodyParser: false,
    },
}
