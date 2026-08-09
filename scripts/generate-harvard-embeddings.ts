/**
 * Generate local embeddings for Harvard course listings.
 *
 * Input:
 * - scripts/courses-2025.json
 * - scripts/courses-2026.json
 * - scripts/courses-2027.json
 *
 * Output:
 * - scripts/harvard-course-embeddings.jsonl
 * - scripts/harvard-course-embeddings.meta.json
 *
 * Run:
 *   npx tsx scripts/generate-harvard-embeddings.ts
 *   npx tsx scripts/generate-harvard-embeddings.ts --batch 16
 */
import * as fs from 'fs/promises'
import * as path from 'path'
import dotenv from 'dotenv'
import type { IHarvardCourse } from '../types/harvardCourse'
import { harvardSubjectNumber } from '../utils/harvardCourseMapper'
import { buildHarvardEmbeddingText } from '../utils/harvardEmbeddingText'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

type EmbeddedCourseRecord = {
    key: string
    subjectNumber: string
    title: string
    semester: string
    academicYear: string
    source: 'courses-2025' | 'courses-2026' | 'courses-2027'
    embeddingModel: string
    embeddingDimensions: number
    embedding: number[]
    text: string
    rawCourse: IHarvardCourse
}

type EmbeddingProvider = 'public' | 'private'

function parseArgs(argv: string[]): {
    batch: number
    root?: string
    provider: EmbeddingProvider
    force: boolean
} {
    const getArg = (name: string): string | undefined => {
        const flag = `--${name}`
        const idx = argv.indexOf(flag)
        if (idx === -1) return undefined
        return argv[idx + 1]
    }

    const providerRaw = (getArg('provider') ?? 'private').toLowerCase()
    if (providerRaw !== 'public' && providerRaw !== 'private') {
        throw new Error(`Invalid --provider "${providerRaw}". Expected "public" or "private".`)
    }
    const provider = providerRaw as EmbeddingProvider

    const batchDefault = provider === 'public' ? '32' : '12'
    const batchRaw = getArg('batch') ?? batchDefault
    const batch = Number(batchRaw)
    if (!Number.isInteger(batch) || batch <= 0) {
        throw new Error(`Invalid --batch "${batchRaw}". Expected a positive integer.`)
    }

    const rootArg = getArg('root')
    const root = rootArg ? path.resolve(rootArg) : undefined
    const force = (getArg('force') ?? 'false').toLowerCase() === 'true'

    return { batch, root, provider, force }
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function courseKey(course: IHarvardCourse): string {
    if (course.externalId) return String(course.externalId)
    if (course.id) return course.id
    const subject = course.subject.trim().toUpperCase()
    const catalog = course.catalogNumber.trim().toUpperCase()
    const year = String(course.academicYear)
    const semester = course.semester.trim().toUpperCase()
    return `${subject}|${catalog}|${year}|${semester}`.replace(/\s+/g, ' ')
}

function buildEmbeddingText(course: IHarvardCourse): string {
    return buildHarvardEmbeddingText(course)
}

async function loadCourses(root: string): Promise<Array<{ source: 'courses-2025' | 'courses-2026' | 'courses-2027'; course: IHarvardCourse }>> {
    const path2025 = path.join(root, 'scripts', 'courses-2025.json')
    const path2026 = path.join(root, 'scripts', 'courses-2026.json')
    const path2027 = path.join(root, 'scripts', 'courses-2027.json')

    const [raw2025, raw2026, raw2027] = await Promise.all([
        fs.readFile(path2025, 'utf8'),
        fs.readFile(path2026, 'utf8'),
        fs.readFile(path2027, 'utf8')
    ])

    const courses2025 = JSON.parse(raw2025) as IHarvardCourse[]
    const courses2026 = JSON.parse(raw2026) as IHarvardCourse[]
    const courses2027 = JSON.parse(raw2027) as IHarvardCourse[]

    if (!Array.isArray(courses2025) || !Array.isArray(courses2026) || !Array.isArray(courses2027)) {
        throw new Error('Both course files must contain JSON arrays.')
    }

    return [
        ...courses2025.map(course => ({ source: 'courses-2025' as const, course })),
        ...courses2026.map(course => ({ source: 'courses-2026' as const, course })),
        ...courses2027.map(course => ({ source: 'courses-2027' as const, course }))
    ]
}

async function loadCompletedKeys(jsonlPath: string): Promise<Set<string>> {
    try {
        const content = await fs.readFile(jsonlPath, 'utf8')
        const done = new Set<string>()
        content.split('\n').forEach(line => {
            const trimmed = line.trim()
            if (!trimmed) return
            try {
                const parsed = JSON.parse(trimmed) as EmbeddedCourseRecord
                if (parsed.key) done.add(parsed.key)
            } catch {
            }
        })
        return done
    } catch {
        return new Set<string>()
    }
}

async function main() {
    const { batch, root: rootOverride, provider, force } = parseArgs(process.argv.slice(2))
    const root = rootOverride || process.cwd()
    const outJsonl = path.join(root, 'scripts', `harvard-course-embeddings.${provider}.jsonl`)
    const outMeta = path.join(root, 'scripts', `harvard-course-embeddings.meta.${provider}.json`)

    let embeddingModel = ''
    let embeddingDimensions = 0
    const generateBatch = async (texts: string[]): Promise<number[][]> => {
        if (provider === 'public') {
            const {
                generateOpenAIEmbeddingsBatch,
                OPENAI_PUBLIC_EMBEDDING_MODEL,
                OPENAI_PUBLIC_EMBEDDING_DIMENSIONS
            } = await import('../utils/openaiEmbeddings')
            embeddingModel = OPENAI_PUBLIC_EMBEDDING_MODEL
            embeddingDimensions = OPENAI_PUBLIC_EMBEDDING_DIMENSIONS
            return generateOpenAIEmbeddingsBatch(texts, { batchSize: batch, retries: 3 })
        }

        const { generateEmbeddingsBatch, OLLAMA_EMBEDDING_DIMENSIONS, OLLAMA_EMBEDDING_MODEL } = await import('../utils/ollama')
        embeddingModel = OLLAMA_EMBEDDING_MODEL
        embeddingDimensions = OLLAMA_EMBEDDING_DIMENSIONS
        return generateEmbeddingsBatch(texts, Math.min(batch, 8))
    }

    console.log('Loading Harvard course listings...')
    const combined = await loadCourses(root)
    console.log(`Loaded ${combined.length} total rows (2025 + 2026 + 2027).`)

    const bestByKey = new Map<string, { source: 'courses-2025' | 'courses-2026' | 'courses-2027'; course: IHarvardCourse }>()
    for (const item of combined) {
        const key = courseKey(item.course)
        if (!key) continue
        const existing = bestByKey.get(key)
        if (!existing) {
            bestByKey.set(key, item)
            continue
        }

        const existingDesc = normalizeString(existing.course.description)
        const currentDesc = normalizeString(item.course.description)
        if (currentDesc.length > existingDesc.length) {
            bestByKey.set(key, item)
        }
    }

    const uniqueCourses = [...bestByKey.entries()].map(([key, item]) => ({
        key,
        source: item.source,
        course: item.course
    }))

    console.log(`Unique courses after dedupe: ${uniqueCourses.length}`)

    const completedKeys = force ? new Set<string>() : await loadCompletedKeys(outJsonl)
    if (force) {
        console.log('Force mode enabled: regenerating all embeddings.')
        await fs.writeFile(outJsonl, '', 'utf8')
    }
    console.log(`Already embedded (from local cache): ${completedKeys.size}`)

    const pending = uniqueCourses.filter(item => !completedKeys.has(item.key))
    console.log(`Pending embeddings to generate: ${pending.length}`)

    if (pending.length === 0) {
        console.log('No pending courses. Writing fresh metadata only.')
        const meta = {
            generatedAt: new Date().toISOString(),
            provider,
            model: embeddingModel || (provider === 'public' ? 'openai-public' : 'ollama-private'),
            dimensions: embeddingDimensions || (provider === 'public' ? Number(process.env.OPENAI_PUBLIC_EMBEDDING_DIMENSIONS || 3072) : 2560),
            totalRows: combined.length,
            uniqueCourses: uniqueCourses.length,
            cachedCount: completedKeys.size,
            newlyGenerated: 0,
            output: {
                jsonl: path.relative(root, outJsonl)
            }
        }
        await fs.writeFile(outMeta, JSON.stringify(meta, null, 2))
        return
    }

    let generatedNow = 0
    const startedAt = Date.now()

    for (let i = 0; i < pending.length; i += batch) {
        const chunk = pending.slice(i, i + batch)
        const chunkTexts = chunk.map(item => buildEmbeddingText(item.course))

        const from = i + 1
        const to = i + chunk.length
        console.log(`Embedding batch ${Math.floor(i / batch) + 1}: courses ${from}-${to} of ${pending.length} (${provider})`)

        const embeddings = await generateBatch(chunkTexts)
        const lines: string[] = []

        chunk.forEach((item, idx) => {
            const emb = embeddings[idx]
            if (!Array.isArray(emb) || emb.length === 0) return

            const record: EmbeddedCourseRecord = {
                key: item.key,
                subjectNumber: harvardSubjectNumber(item.course),
                title: normalizeString(item.course.title),
                semester: normalizeString(item.course.semester),
                academicYear: String(item.course.academicYear ?? '').trim(),
                source: item.source,
                embeddingModel: embeddingModel,
                embeddingDimensions: embeddingDimensions,
                embedding: emb,
                text: chunkTexts[idx],
                rawCourse: item.course
            }
            lines.push(JSON.stringify(record))
            generatedNow += 1
        })

        if (lines.length > 0) {
            await fs.appendFile(outJsonl, `${lines.join('\n')}\n`, 'utf8')
        }

        const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
        const rate = (generatedNow / elapsedSec * 60).toFixed(1)
        console.log(`  -> Wrote ${lines.length} embeddings this batch (${generatedNow}/${pending.length} total, ${rate}/min)`)
    }

    const totalEmbedded = completedKeys.size + generatedNow
    const meta = {
        generatedAt: new Date().toISOString(),
        provider,
        model: embeddingModel || (provider === 'public' ? 'openai-public' : 'ollama-private'),
        dimensions: embeddingDimensions || (provider === 'public' ? Number(process.env.OPENAI_PUBLIC_EMBEDDING_DIMENSIONS || 3072) : 2560),
        totalRows: combined.length,
        uniqueCourses: uniqueCourses.length,
        cachedCount: completedKeys.size,
        newlyGenerated: generatedNow,
        totalEmbedded,
        output: {
            jsonl: path.relative(root, outJsonl)
        }
    }

    await fs.writeFile(outMeta, JSON.stringify(meta, null, 2))
    console.log('Done generating Harvard embeddings.')
    console.log(`Output JSONL: ${path.relative(root, outJsonl)}`)
    console.log(`Output meta:  ${path.relative(root, outMeta)}`)
}

main().catch((error) => {
    console.error('\nFailed to generate Harvard embeddings:', error?.message || error)
    process.exit(1)
})

