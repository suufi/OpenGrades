// @ts-nocheck

import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import { IClass } from '@/types'
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

import { auth } from '@/utils/auth'

import AuditLog from '@/models/AuditLog'
import ContentSubmission from '@/models/ContentSubmission'
import { getESClient } from '@/utils/esClient'
import { decode } from 'html-entities'
import mongoose from 'mongoose'
import { parseUnitsField, parseInstructors, determineHasFinal, parsePrerequisites } from '@/utils/courseParser'
import eecsRenumbering from '@/utils/eecs-renumbering.json'

const client = getESClient()

type Data = {
  success: boolean,
  data?: object,
  message?: string
}

type ClassQuery = {
  subjectTitle?: string,
  subjectNumber?: string,
  term?: string
}

function parseClassName(subjectNumber: string) {
  if (subjectNumber.slice(-1) === 'J') {
    return subjectNumber.substring(0, subjectNumber.length - 1)
  } else {
    return subjectNumber
  }
}

function parseDepartment(subjectNumber) {
  return subjectNumber.split('.')[0]
}

const descriptionCache: Record<string, string> = {}

export const config = {
  api: {
    responseLimit: false,
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  await mongoConnection()
  const { method, body } = req
  const session = await auth(req, res)

  if (!session) return res.status(403).json({ success: false, message: 'Please sign in.' })

  switch (method) {
    case 'GET':
      try {
        const {
          page = '1',
          limit = '20',
          search = '',
          offered = 'true',
          reviewable = 'false',
          departments = '',
          academicYears = '',
          terms = '',
          term = '',
          reviewsOnly = 'false',
          sortField = '',
          sortOrder = 'asc', // Default to ascending order
          all = 'false',
          useDescription = 'false',
          communicationRequirements = '', // CI-H, CI-HW
          girAttributes = '', // REST, LAB, etc.
          hassAttributes = '' // HASS-A, HASS-E, HASS-H, HASS-S
        } = req.query

        // Build the query object
        let query: Record<string, any> = {}

        if (offered === 'true') {
          query.offered = true
        }

        if (reviewable === 'true') {
          query.reviewable = true
        }

        if (reviewsOnly === 'true') {
          query._id = { $in: await ClassReview.distinct('class') } // Only classes with reviews
        }


        if (departments) {
          query.$or = [
            { department: { $in: (departments as string).split(',') } },
            { crossListedDepartments: { $in: (departments as string).split(',') } }
          ]
        }

        if (academicYears) {
          query.academicYear = { $in: (academicYears as string).split(',').map(Number) }
        }

        if (terms) {
          const endings = (terms as string).split(',')
          query.term = {
            $regex: `(${endings.join('|')})$`,
            $options: 'i'
          }
        } else if (term) {
          query.term = term
        }

        if (communicationRequirements) {
          const ciValues = (communicationRequirements as string).split(',')
          query.communicationRequirement = { $in: ciValues }
        }

        if (girAttributes) {
          const girValues = (girAttributes as string).split(',')
          query.girAttribute = { $in: girValues }
        }

        if (hassAttributes) {
          const hassValues = (hassAttributes as string).split(',')
          query.hassAttribute = { $in: hassValues }
        }

        const tokens = search.split(/\s+/).filter(Boolean)

        // Prepare for sorting
        let sortQuery = {}
        if (sortField) {
          if (sortField !== 'relevance') {
            if (sortField === 'alphabetical') {
              sortQuery.subjectTitle = 1
            } else if (sortField === 'users') {
              sortQuery.userCount = -1
            } else if (sortField === 'reviews') {
              sortQuery.classReviewCount = -1
            } else {
              sortQuery[sortField] = sortOrder === 'asc' ? 1 : -1
            }
          } else {
            if (!search) {
              sortQuery.userCount = -1
            }
          }
        }

        let highlights = {}
        let scores = {}

        if (search) {

          const mustClauses = tokens.map(token => ({
            multi_match: {
              query: token,
              fields: [
                'subjectNumber^3',
                'subjectTitle^3',
                'aliases^3',
                'instructors',
                'description'
              ],
              type: 'phrase_prefix'
            }
          }))


          let esQuery = {
            bool: {
              should: [
                {
                  term: {
                    "subjectNumber": {
                      value: search,
                      boost: 6
                    }
                  }
                },
                {
                  term: {
                    "aliases": {
                      value: search,
                      boost: 3
                    }
                  }
                },
                {
                  bool: {
                    must: mustClauses
                  }
                }
              ],
              minimum_should_match: 1
            }
          }

          const searchResults = await client.search({
            index: 'opengrades_prod.classes',
            query: esQuery,
            highlight: {
              fields: {
                description: {},
                subjectTitle: {},
                aliases: {},
                instructors: {},
              },
              pre_tags: ['<mark>'],
              post_tags: ['</mark>'],
              number_of_fragments: 3,
            },
            size: 1000
          }).catch((error) => {
            console.error("Error during ElasticSearch query", error)
            return res.status(400).json({ success: false, message: error.message })
          })

          const classIds = searchResults.hits.hits.map((hit) => new mongoose.Types.ObjectId(hit._id))
          query._id = { $in: classIds }

          highlights = searchResults.hits.hits.reduce((acc, hit) => {
            acc[hit._id] = hit.highlight
            return acc
          }, {})

          scores = searchResults.hits.hits.reduce((acc, hit) => {
            acc[hit._id] = hit._score
            return acc
          }, {})
        }


        const aggregationPipeline = [
          { $match: query },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: 'classesTaken',
              as: 'users',
            },
          },
          {
            $addFields: {
              userCount: { $size: '$users' },
            },
          },
          {
            $project: {
              users: 0,
            },
          }
        ]

        if (Object.keys(sortQuery).length !== 0) {

          if (sortField === 'reviews') {
            aggregationPipeline.push(
              {
                $lookup: {
                  from: 'classreviews',
                  localField: '_id',
                  foreignField: 'class',
                  as: 'reviews',
                }
              },
              {
                $addFields: {
                  classReviewCount: { $size: '$reviews' },
                }
              },
              {
                $project: {
                  reviews: 0,
                }
              }
            )
          }
          aggregationPipeline.push({ $sort: sortQuery })
        }

        let classes = await Class.aggregate(aggregationPipeline)

        // If `all` is set to true, return all classes without pagination
        if (all === 'true') {

          let classes = await Class.find(query).sort(sortQuery).lean()

          // Get the review count for each class
          const reviewCounts = await ClassReview.aggregate([
            { $group: { _id: '$class', count: { $sum: 1 } } }
          ])

          // Get the content submission count for each class
          const contentCounts = await ContentSubmission.aggregate([
            { $match: { approved: true } },
            { $group: { _id: '$class', count: { $sum: 1 } } }
          ])

          // Map the review count to each class
          const reviewCountMap = new Map(reviewCounts.map(({ _id, count }) => [_id.toString(), count]))
          const contentCountMap = new Map(contentCounts.map(({ _id, count }) => [_id.toString(), count]))
          classes = classes.map((classEntry) => ({
            ...classEntry,
            classReviewCount: reviewCountMap.get(classEntry._id.toString()) || 0,
            contentSubmissionCount: contentCountMap.get(classEntry._id.toString()) || 0,
          }))

          return res.status(200).json({
            success: true,
            data: classes,
          })
        }

        const pageNumber = parseInt(page as string, 10)
        const limitNumber = parseInt(limit as string, 10)
        const skip = (pageNumber - 1) * limitNumber

        const totalClasses = classes.length
        const totalPages = Math.ceil(totalClasses / limitNumber)

        // Paginate the filtered classes
        const paginatedClasses = classes.slice(skip, skip + limitNumber)

        const classIdsOnThisPage = paginatedClasses.map((c) => c._id)

        // Get the review count for each class in the current page
        const reviewCounts = await ClassReview.aggregate([
          { $match: { partial: false, class: { $in: classIdsOnThisPage } } },
          { $group: { _id: '$class', count: { $sum: 1 } } }
        ])

        // Get the content submission count for each class in the current page
        const contentCounts = await ContentSubmission.aggregate([
          { $match: { approved: true, class: { $in: classIdsOnThisPage } } },
          { $group: { _id: '$class', count: { $sum: 1 } } }
        ])

        // Map the review count to each class
        const reviewCountMap = new Map(reviewCounts.map(({ _id, count }) => [_id.toString(), count]))
        const contentCountMap = new Map(contentCounts.map(({ _id, count }) => [_id.toString(), count]))
        const classesWithReviews = paginatedClasses
          .sort((a, b) => {
            if (sortField === 'relevance') {
              return scores[b._id] - scores[a._id]
            } else {
              return 0
            }
          }).map((classEntry) => ({
            ...classEntry,
            classReviewCount: reviewCountMap.get(classEntry._id.toString()) || 0,
            contentSubmissionCount: contentCountMap.get(classEntry._id.toString()) || 0,
            highlight: highlights[classEntry._id.toString()] || {},
            score: scores[classEntry._id.toString()] || 0
          }))

        return res.status(200).json({
          success: true,
          data: classesWithReviews,
          meta: {
            currentPage: pageNumber,
            totalPages,
            totalClasses,
          },
        })
      } catch (error: unknown) {
        console.error("Error during GET request", error)
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.message })
        }
      }
      break

    case 'POST':
      try {
        // const classExists = await Class.exists()
        console.log(body)
        console.log(typeof body)
        // console.log(session)

        if (!session) {
          return res.status(403).json({ success: false, message: 'Please sign in.' })
        }

        if (!session.user || session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        if (!body.selectedDepartments?.length) {
          return res.status(400).json({ success: false, message: 'Provide at least one department.' })
        }

        // Set up streaming response
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.statusCode = 200

        const sendMessage = (data: any) => {
          res.write(JSON.stringify(data) + '\n')
          if (typeof (res as any).flush === 'function') {
            (res as any).flush()
          }
        }

        const sendProgress = (current: number, total: number, department: string) => {
          sendMessage({
            type: 'progress',
            current,
            total,
            department
          })
        }

        const sendComplete = (newClasses: number, updatedClasses: number, failedDeps: string[] = [], duration: number = 0) => {
          sendMessage({
            type: 'complete',
            newClasses,
            updatedClasses,
            failedDepartments: failedDeps,
            totalDuration: duration
          })
        }

        const sendError = (message: string) => {
          sendMessage({
            type: 'error',
            message
          })
        }

        const parseDepartment = (classNumber: string) => {
          const match = classNumber.match(/^([A-Z0-9]+)/)
          return match ? match[1] : ''
        }

        // Get EECS renumbering aliases for a subject number
        const getEecsRenumberingAliases = (subjectNumber: string): string[] => {
          const aliases: string[] = []
          const oldToNew = eecsRenumbering.oldToNew as Record<string, string>
          const newToOld = eecsRenumbering.newToOld as Record<string, string>

          if (oldToNew[subjectNumber]) {
            aliases.push(oldToNew[subjectNumber])
          }
          if (newToOld[subjectNumber]) {
            aliases.push(newToOld[subjectNumber])
          }
          return aliases
        }

        await AuditLog.create({
          actor: session.user._id,
          type: 'FetchDepartment',
          description: `Fetched ${body.selectedDepartments.join(', ')} departments for ${body.term} that are ${body.reviewable ? 'reviewable' : 'not reviewable'}.`
        })

        const requestHeaders = new Headers()
        requestHeaders.set('client_id', process.env.MIT_API_CLIENT_ID)
        requestHeaders.set('client_secret', process.env.MIT_API_CLIENT_SECRET)

        async function fetchDescription(description) {
          if (!description.includes("See description under subject")) {
            return description
          }

          const match = description.match(/See description under subject ([A-Z0-9.]+)./)

          if (!match) {
            return description
          }

          let [_, subjectNumber] = match
          subjectNumber = parseClassName(subjectNumber)

          const cacheKey = `${body.term}_${subjectNumber}`
          if (descriptionCache[cacheKey]) {
            return descriptionCache[cacheKey]
          }


          // attempt to look up the class description for this same term if we already have it
          const existingClass = await Class.findOne({ subjectNumber, term: body.term }).lean()

          if (existingClass) {
            return existingClass.description
          }

          const apiFetch = await fetch(`https://mit-course-catalog-v2.cloudhub.io/coursecatalog/v2/terms/${body.term}/subjects/${subjectNumber}`, {
            headers: requestHeaders
          }).then(async (response) => {
            const res = await response.json()
            if (response.ok) {
              return res
            }
          })

          descriptionCache[cacheKey] = apiFetch?.item?.description
          return apiFetch?.item?.description || description
        }

        const allClasses: IClass[] = []
        const totalDepartments = body.selectedDepartments.length
        const failedDepartments: Array<{ department: string, error: string }> = []
        const CONCURRENT_REQUESTS = 5
        const startTime = Date.now()

        sendProgress(0, totalDepartments, 'Starting fetch operation')

        const fetchDepartment = async (department: string, index: number) => {
          try {
            const apiFetch = await fetch(`https://mit-course-catalog-v2.cloudhub.io/coursecatalog/v2/terms/${body.term}/subjects?dept=${department}`, {
              headers: requestHeaders
            }).then(async (response) => {
              const res = await response.json()
              if (response.ok) return res
              throw new Error(res.errorDescription || 'Failed to fetch department')
            })

            const classMatchRegex = /((?:\d+[A-Z]?|[A-Z]+)\.\w+)/g
            const departmentClasses: IClass[] = []

            for (const apiClassEntry of apiFetch.items) {
              let aliases: string[] = []

              if (apiClassEntry.cluster) {
                const aliasPatterns = [
                  /\(Same subject as ([^)]+)\)/gi,
                  /\(Subject meets with ([^)]+)\)/gi
                ]

                const aliasTexts: string[] = []

                for (const pattern of aliasPatterns) {
                  const matches = [...apiClassEntry.cluster.matchAll(pattern)]
                  matches.forEach(match => {
                    if (match[1]) aliasTexts.push(match[1])
                  })
                }

                if (aliasTexts.length > 0) {
                  const allAliasNumbers = new Set<string>()
                  aliasTexts.forEach(text => {
                    const numbers = [...text.matchAll(classMatchRegex)].map(m => m[0])
                    numbers.forEach(num => {
                      const cleanNum = num.endsWith('J') ? num.slice(0, -1) : num
                      allAliasNumbers.add(cleanNum)
                    })
                  })
                  aliases = Array.from(allAliasNumbers)
                } else {
                  aliases = [...apiClassEntry.cluster.matchAll(classMatchRegex)]
                    .map(match => match[0])
                    .map(num => num.endsWith('J') ? num.slice(0, -1) : num)
                }
              }

              // Add EECS renumbering aliases (old to new and new to old)
              const subjectNumber = apiClassEntry.subjectId
              const eecsAliases = getEecsRenumberingAliases(subjectNumber)
              eecsAliases.forEach(alias => {
                if (!aliases.includes(alias)) {
                  aliases.push(alias)
                }
              })

              const parsedUnits = parseUnitsField(apiClassEntry.units)

              const instructorDetails = parseInstructors(
                apiClassEntry.instructors,
                apiClassEntry.instructorDetails
              )

              const instructorNames = instructorDetails.length > 0
                ? instructorDetails.map(i => i.name)
                : decode(apiClassEntry.instructors).split(',').map((name: string) => name.trim())

              const parsedPrereqs = parsePrerequisites(apiClassEntry.prerequisites || '')

              departmentClasses.push({
                term: apiClassEntry.termCode,
                subjectNumber: apiClassEntry.subjectId,
                aliases,
                subjectTitle: apiClassEntry.title,
                academicYear: parseInt(apiClassEntry.academicYear),
                department: department,
                crossListedDepartments: aliases.map(parseDepartment).filter(aliasDep => aliasDep !== department),
                units: apiClassEntry.units,
                unitHours: parsedUnits.unitHours,
                communicationRequirement: parsedUnits.communicationRequirement,
                hassAttribute: parsedUnits.hassAttribute,
                girAttribute: parsedUnits.girAttributes,
                prerequisites: parsedPrereqs.prerequisites,
                corequisites: parsedPrereqs.corequisites,
                description: await fetchDescription(apiClassEntry.description),
                offered: apiClassEntry.offered,
                display: apiClassEntry.offered,
                reviewable: body.reviewable,
                instructors: instructorNames,
                instructorDetails: instructorDetails.length > 0 ? instructorDetails : undefined,
                has_final: determineHasFinal(apiClassEntry)
              })
            }

            return { department, classes: departmentClasses, error: null }
          } catch (error) {
            console.error(`Error fetching department ${department}:`, error)
            return {
              department,
              classes: [],
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }
        }

        let completedCount = 0
        for (let i = 0; i < totalDepartments; i += CONCURRENT_REQUESTS) {
          const batch = body.selectedDepartments.slice(i, Math.min(i + CONCURRENT_REQUESTS, totalDepartments))

          const results = await Promise.allSettled(
            batch.map((dept, batchIndex) => fetchDepartment(dept, i + batchIndex))
          )

          results.forEach((result, batchIndex) => {
            completedCount++
            const department = batch[batchIndex]

            if (result.status === 'fulfilled') {
              const { department: dept, classes, error } = result.value

              if (error) {
                failedDepartments.push({ department: dept, error })
                sendMessage({
                  type: 'departmentError',
                  department: dept,
                  error,
                  canRetry: true
                })
              } else {
                allClasses.push(...classes)
              }

              const percentage = Math.round((completedCount / totalDepartments) * 100)
              const elapsed = Date.now() - startTime
              const estimatedTotal = (elapsed / completedCount) * totalDepartments
              const estimatedRemaining = Math.round((estimatedTotal - elapsed) / 1000)

              sendMessage({
                type: 'progress',
                current: completedCount,
                total: totalDepartments,
                percentage,
                department: dept,
                classCount: classes.length,
                estimatedTimeRemaining: estimatedRemaining
              })
            } else {
              failedDepartments.push({
                department,
                error: result.reason?.message || 'Unknown error'
              })
              completedCount++
            }
          })
        }

        const bulkAddResult = await Class.bulkWrite(
          allClasses.map((classEntry) => ({
            updateOne: {
              filter: {
                term: classEntry.term,
                $or: [{ subjectNumber: classEntry.subjectNumber },
                { aliases: classEntry.subjectNumber }]
              },
              update: {
                $setOnInsert: classEntry
              },
              upsert: true
            }
          }))
        )

        const bulkWriteUpdate = await Class.bulkWrite(
          allClasses.map((classEntry) => ({
            updateOne: {
              filter: {
                term: classEntry.term,
                $or: [{ subjectNumber: classEntry.subjectNumber },
                { aliases: classEntry.subjectNumber }]
              },
              update: {
                $set: {
                  description: classEntry.description,
                  instructors: classEntry.instructors,
                }
              }
            }
          }))
        )

        const bulkWriteCrossListedUpdate = await Class.bulkWrite(
          allClasses.map((classEntry) => ({
            updateOne: {
              filter: {
                term: classEntry.term,
                subjectNumber: classEntry.subjectNumber
              },
              update: {
                $addToSet: {
                  crossListedDepartments: {
                    $each: classEntry.crossListedDepartments
                  }
                }
              }
            }
          }))
        )

        const totalDuration = Math.round((Date.now() - startTime) / 1000)
        sendComplete(
          bulkAddResult.insertedCount,
          bulkWriteUpdate.modifiedCount + bulkWriteCrossListedUpdate.modifiedCount,
          failedDepartments.map(f => f.department),
          totalDuration
        )
        res.end()
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (!res.headersSent) {
            return res.status(400).json({ success: false, message: error.toString() })
          } else {
            res.write(JSON.stringify({ type: 'error', message: error.toString() }) + '\n')
            res.end()
          }
        }
      }
      break
    case 'DELETE':
      try {
        console.log(body)
        console.log(typeof body)

        if (session.user && session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }


        const bulkDeleteResults = await Class.deleteMany({
          _id: {
            $in: body.classes
          }
        })

        return res.status(200).json({
          success: true,
          data: {
            deletedCount: bulkDeleteResults.deletedCount,
            classes: await Class.find().lean()
          }
        })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'PUT':
      try {
        console.log(body)
        console.log(typeof body)

        if (session.user && session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        const bulkWriteUpdate = await Class.bulkWrite(
          body.classes.map((classId: string, index: number) => ({
            updateOne: {
              filter: { _id: new mongoose.Types.ObjectId(classId) },
              update: {
                display: body.display[index]
              }
            }
          }))
        )

        return res.status(200).json({
          success: true,
          data: {
            updatedCount: bulkWriteUpdate.modifiedCount,
            classes: await Class.find().lean()
          }
        })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    default:
      res.status(400).json({ success: false })
      break
  }
}
