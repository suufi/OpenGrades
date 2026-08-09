/**
 * Download Harvard FAS courses from My.Harvard and optionally upsert into MongoDB.
 *
 *   npx tsx scripts/import-harvard-courses.ts --year 2027
 *   npx tsx scripts/import-harvard-courses.ts --year 2027 --db
 *   npx tsx scripts/import-harvard-courses.ts --year 2027 --from-json scripts/courses-2027.json --db
 *   npx tsx scripts/import-harvard-courses.ts --year 2027 --dry-run
 */
import * as fs from 'fs/promises'
import * as path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import Class from '../models/Class'
import type { IHarvardCourse } from '../types/harvardCourse'
import { fetchHarvardCourses } from '../utils/myHarvardClient'
import {
    assertHarvardCourseShape,
    harvardCourseToClassDoc,
    normalizeHarvardCourse
} from '../utils/harvardCourseMapper'
import { supportedHarvardYears } from '../utils/harvardYearFilters'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function parseArgs(argv: string[]) {
    const getArg = (name: string): string | undefined => {
        const flag = `--${name}`
        const idx = argv.indexOf(flag)
        if (idx === -1) return undefined
        return argv[idx + 1]
    }
    const hasFlag = (name: string) => argv.includes(`--${name}`)

    const yearRaw = getArg('year')
    const year = yearRaw ? Number(yearRaw) : 0
    const fromJson = getArg('from-json')
    const out = getArg('out')
    const concurrency = Number(getArg('concurrency') ?? '8')
    const dryRun = hasFlag('dry-run')
    const db = hasFlag('db')

    return { year, fromJson, out, concurrency, dryRun, db }
}

async function loadFromJson(filePath: string): Promise<IHarvardCourse[]> {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as IHarvardCourse[]
    if (!Array.isArray(parsed)) {
        throw new Error(`${filePath} must contain a JSON array`)
    }
    return parsed.map(c => normalizeHarvardCourse(c))
}

async function upsertCourses(courses: IHarvardCourse[], dryRun: boolean): Promise<{ upserted: number; errors: number }> {
    const BATCH = 500
    let upserted = 0
    let errors = 0

    for (let i = 0; i < courses.length; i += BATCH) {
        const batch = courses.slice(i, i + BATCH)
        const ops = batch.map(course => {
            const doc = harvardCourseToClassDoc(course)
            return {
                updateOne: {
                    filter: {
                        institution: 'harvard',
                        harvardCatalogId: doc.harvardCatalogId
                    },
                    update: { $set: doc },
                    upsert: true
                }
            }
        })

        if (dryRun) {
            upserted += batch.length
            continue
        }

        try {
            const result = await Class.bulkWrite(ops, { ordered: false })
            upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0) + (result.matchedCount ?? 0)
        } catch (err) {
            console.error(`Bulk write error at batch ${i}:`, err)
            errors += batch.length
        }

        console.log(`  DB progress: ${Math.min(i + BATCH, courses.length)} / ${courses.length}`)
    }

    return { upserted, errors }
}

async function main() {
    const { year, fromJson, out, concurrency, dryRun, db } = parseArgs(process.argv.slice(2))

    if (!year || !Number.isInteger(year)) {
        console.error(`--year is required (supported: ${supportedHarvardYears().join(', ')})`)
        process.exit(1)
    }

    const outPath = out
        ? path.resolve(out)
        : path.resolve(process.cwd(), 'scripts', `courses-${year}.json`)

    let courses: IHarvardCourse[]

    if (fromJson) {
        console.log(`Loading from ${fromJson}...`)
        courses = await loadFromJson(path.resolve(fromJson))
    } else {
        console.log(`Fetching My.Harvard courses for academic year ${year}...`)
        courses = await fetchHarvardCourses(year, {
            concurrency,
            onProgress: msg => console.log(msg)
        })
    }

    console.log(`Total courses: ${courses.length}`)

    if (courses.length > 0) {
        assertHarvardCourseShape(courses[0])
        const sample = courses[0]
        const normalized = normalizeHarvardCourse(sample)
        if (JSON.stringify(normalized) !== JSON.stringify(normalizeHarvardCourse(JSON.parse(JSON.stringify(sample))))) {
            console.warn('Warning: normalization round-trip mismatch on sample row')
        }
    }

    if (!dryRun) {
        await fs.writeFile(outPath, JSON.stringify(courses), 'utf8')
        console.log(`Wrote ${outPath}`)
    } else {
        console.log(`[dry-run] Would write ${outPath}`)
    }

    if (db) {
        const uri = process.env.MONGODB_CONNECTION_URI
        if (!uri) {
            throw new Error('MONGODB_CONNECTION_URI is not set')
        }
        if (!dryRun) {
            await mongoose.connect(uri)
            console.log('Connected to MongoDB')
        }
        console.log(dryRun ? '[dry-run] Would upsert to MongoDB' : 'Upserting to MongoDB...')
        const { upserted, errors } = await upsertCourses(courses, dryRun)
        console.log(`Upsert complete: ${upserted} operations, ${errors} errors`)
        if (!dryRun) {
            await mongoose.disconnect()
        }
    }

    console.log('Done.')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
