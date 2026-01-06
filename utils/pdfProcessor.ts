// @ts-ignore
const { PDFParse } = require('pdf-parse')
import * as Minio from 'minio'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    region: process.env.MINIO_REGION,
    accessKey: process.env.MINIO_ACCESS_KEY_ID!,
    secretKey: process.env.MINIO_SECRET_ACCESS_KEY!,
})

/**
 * Download PDF and extract text content
 */
export async function extractPDFText(bucketPath: string): Promise<string> {
    try {
        const bucketName = process.env.MINIO_BUCKET_NAME!
        console.log(`Fetching PDF from bucket: ${bucketName}, path: ${bucketPath}`)

        const stream = await minioClient.getObject(bucketName, bucketPath)

        const chunks: Buffer[] = []
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk))
        }
        const buffer = Buffer.concat(chunks as any)

        console.log(`Downloaded ${buffer.length} bytes from ${bucketPath}`)

        const header = buffer.slice(0, 5).toString('utf8')
        if (!header.startsWith('%PDF')) {
            console.error(`Invalid PDF header for ${bucketPath}: ${header}`)
            throw new Error(`Invalid PDF structure. Header: ${header}`)
        }

        const parser = new PDFParse({ data: buffer })
        const textResult = await parser.getText()

        console.log(`Extracted ${textResult.text.length} chars of text from ${bucketPath}`)
        return textResult.text
    } catch (error) {
        console.error(`Error extracting PDF text from ${bucketPath}:`, error)
        throw new Error(`Failed to extract PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

/**
 * Download PDF and return buffer
 */
export async function getPDFBuffer(bucketPath: string): Promise<Buffer> {
    const bucketName = process.env.MINIO_BUCKET_NAME!
    const stream = await minioClient.getObject(bucketName, bucketPath)

    const chunks: Buffer[] = []
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks as any)
}

/**
 * Generate a comprehensive summary of a PDF using Gemini
 */
export async function generatePDFSummary(
    pdfBuffer: Buffer,
    contentType: string,
    contentTitle: string
): Promise<string> {
    const prompt = `Analyze this ${contentType} document titled "${contentTitle}" and create a comprehensive summary for a course information database.

Extract and summarize ALL of the following that you can find:
- **Exam Policy**: format (open book, closed book, cheat sheet, notes allowed), number of midterms, whether there's a final
- **Grading**: component breakdown with weights, curve policy, pass/fail options, grade cutoffs if mentioned
- **Class Structure**: lecture frequency (e.g., "2x per week", "MWF"), recitations, labs, office hours frequency
- **Recording**: whether lectures are recorded or not
- **Prerequisites**: required courses or background knowledge
- **Assignments**: types (psets, projects, papers, quizzes), approximate frequency, collaboration policy
- **Late Policy**: penalties, extension policies, drop policies
- **Topics/Content**: main subjects covered throughout the course
- **Textbooks/Materials**: required or recommended readings
- **Attendance**: whether attendance is required or tracked
- **Other Policies**: any other policies that are relevant to the course

IMPORTANT: Focus on PATTERNS and POLICIES, not specific dates (these are historical documents).
For scheduling, use relative terms like "weekly", "biweekly", "midterm around week 8", not specific calendar dates.

Write in clear, searchable prose that would help students find this class when searching for specific policies or characteristics.
Keep the summary under 2000 characters.`

    try {
        const result = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'file', data: pdfBuffer, mediaType: 'application/pdf' }
                ]
            }]
        })
        return result.text
    } catch (error) {
        console.error('Error generating PDF summary:', error)
        return ''
    }
}

/**
 * Chunk large text into smaller pieces for embedding
 */
export function chunkText(text: string, maxLength: number = 6000, maxChunks: number = 5): string[] {
    // Clean up text
    const cleaned = text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim()

    if (cleaned.length <= maxLength) {
        return [cleaned]
    }

    const chunks: string[] = []
    const sentences = cleaned.split(/([.!?]+\s+)/)
    let currentChunk = ''

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]

        if ((currentChunk + sentence).length > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk.trim())
                currentChunk = sentence
            } else {
                // Sentence itself is too long, split by words
                const words = sentence.split(' ')
                let wordChunk = ''
                for (const word of words) {
                    if ((wordChunk + ' ' + word).length > maxLength) {
                        if (wordChunk) chunks.push(wordChunk.trim())
                        wordChunk = word
                    } else {
                        wordChunk += (wordChunk ? ' ' : '') + word
                    }
                }
                if (wordChunk) currentChunk = wordChunk
            }
        } else {
            currentChunk += sentence
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
    }

    return chunks.filter(chunk => chunk.length > 0).slice(0, maxChunks)
}