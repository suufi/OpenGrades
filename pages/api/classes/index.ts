// @ts-nocheck

import Class from '@/models/Class'
import ClassReview from '@/models/ClassReview'
import { IClass } from '@/types'
import mongoConnection from '@/utils/mongoConnection'
import type { NextApiRequest, NextApiResponse } from 'next'

import { auth } from '@/utils/auth'

import AuditLog from '@/models/AuditLog'
import { Client } from '@elastic/elasticsearch'
import { decode } from 'html-entities'
import mongoose from 'mongoose'

const client = new Client({
  node: process.env.ELASTIC_SEARCH_URI
})

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

function parseClassName (subjectNumber: string) {
  if (subjectNumber.slice(-1) === 'J') {
    return subjectNumber.substring(0, subjectNumber.length - 1)
  } else {
    return subjectNumber
  }
}

function parseDepartment (subjectNumber) {
  return subjectNumber.split('.')[0]
}

const descriptionCache: Record<string, string> = {}

export default async function handler (
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
          useDescription = 'false'
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

        const cleanSearch = (search as string).replace(/[^a-zA-Z0-9.]/g, '')

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
            if (!cleanSearch) {
              sortQuery.userCount = -1
            }
          }
        }

        let highlights = {}
        let scores = {}

        if (cleanSearch) {

          let esQuery = {
            bool: {
              should: [
                {
                  term: {
                    "subjectNumber": {
                      value: cleanSearch,
                      boost: 3
                    }
                  }
                },
                {
                  term: {
                    "aliases": {
                      value: cleanSearch,
                      boost: 3
                    }
                  }
                },
                {
                  multi_match: {
                    query: cleanSearch,
                    fields: [
                      'subjectNumber^3',
                      'subjectTitle^3',
                      'aliases^3',
                      'instructors',
                      'description'
                    ],
                    type: 'phrase_prefix'
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

          // Map the review count to each class
          const reviewCountMap = new Map(reviewCounts.map(({ _id, count }) => [_id.toString(), count]))
          classes = classes.map((classEntry) => ({
            ...classEntry,
            classReviewCount: reviewCountMap.get(classEntry._id.toString()) || 0,
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

        // Map the review count to each class
        const reviewCountMap = new Map(reviewCounts.map(({ _id, count }) => [_id.toString(), count]))
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
        // console.log('actor', session.user)
        await AuditLog.create({
          actor: session.user._id,
          type: 'FetchDepartment',
          description: `Fetched ${body.selectedDepartments.join(', ')} departments for ${body.term} that are ${body.reviewable ? 'reviewable' : 'not reviewable'}.`
        })

        const requestHeaders = new Headers()
        requestHeaders.set('client_id', process.env.MIT_API_CLIENT_ID)
        requestHeaders.set('client_secret', process.env.MIT_API_CLIENT_SECRET)

        async function fetchDescription (description) {
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

        // for (const department of body.selectedDepartments) {
        //   let apiFetch
        //   try {
        //     apiFetch = await fetch(`https://mit-course-catalog-v2.cloudhub.io/coursecatalog/v2/terms/${body.term}/subjects?dept=${department}`, {
        //       headers: requestHeaders
        //     }).then(async (response) => {
        //       const res = await response.json()
        //       if (response.ok) {
        //         return res
        //       }
        //       throw new Error(res.errorDescription)
        //     })
        //   } catch (error: unknown) {
        //     console.log(error)
        //     if (error instanceof Error) {
        //       throw new Error(error.message)
        //     }
        //   }

        //   await Promise.all(
        //     apiFetch.items.map(async (apiClassEntry: APIClass) => {
        //       console.log('pushing', apiClassEntry.subjectId)
        //       const classMatchRegex = /(\w{1,3}\.[\w]{1,5})/g
        //       const aliases = [...apiClassEntry.cluster.matchAll(classMatchRegex)].map(match => parseClassName(match[0]))
        //       console.log(apiClassEntry.subjectId, "has aliases", aliases, "and department", department, "and cross-listed departments", aliases.map(parseDepartment))
        //       allClasses.push({
        //         term: apiClassEntry.termCode,
        //         subjectNumber: apiClassEntry.subjectId,
        //         aliases,
        //         subjectTitle: apiClassEntry.title,
        //         academicYear: parseInt(apiClassEntry.academicYear),
        //         department,
        //         crossListedDepartments: aliases.map(parseDepartment).filter(aliasDep => aliasDep !== department),
        //         units: apiClassEntry.units,
        //         description: await fetchDescription(apiClassEntry.description),
        //         offered: apiClassEntry.offered,
        //         display: apiClassEntry.offered,
        //         reviewable: body.reviewable,
        //         instructors: decode(apiClassEntry.instructors).split(',').map((name: string) => name.trim())
        //       })
        //     })
        //   )
        // }

        const departmentFetchPromises = body.selectedDepartments.map(async department => {
          const apiFetch = await fetch(`https://mit-course-catalog-v2.cloudhub.io/coursecatalog/v2/terms/${body.term}/subjects?dept=${department}`, {
            headers: requestHeaders
          }).then(async (response) => {
            const res = await response.json()
            if (response.ok) return res
            throw new Error(res.errorDescription)
          })

          // Return an object that has the department + items
          return { department, items: apiFetch.items }
        })

        let deptFetchResults
        try {
          deptFetchResults = await Promise.all(departmentFetchPromises)
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : String(err))
        }

        const classMatchRegex = /(\w{1,3}\.[\w]{1,5})/g

        for (const deptResult of deptFetchResults) {
          for (const apiClassEntry of deptResult.items) {
            const aliases = [...apiClassEntry.cluster.matchAll(classMatchRegex)].map(match => parseClassName(match[0]))
            allClasses.push({
              term: apiClassEntry.termCode,
              subjectNumber: apiClassEntry.subjectId,
              aliases,
              subjectTitle: apiClassEntry.title,
              academicYear: parseInt(apiClassEntry.academicYear),
              department: deptResult.department,
              crossListedDepartments: aliases.map(parseDepartment).filter(aliasDep => aliasDep !== deptResult.department),
              units: apiClassEntry.units,
              description: await fetchDescription(apiClassEntry.description),
              offered: apiClassEntry.offered,
              display: apiClassEntry.offered,
              reviewable: body.reviewable,
              instructors: decode(apiClassEntry.instructors).split(',').map((name: string) => name.trim())
            })
          }
        }

        // const bulkAddResult = await Class.insertMany(allClasses.filter(classEntry => !classEntry.aliases || classEntry.aliases.length === 0))
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

        // const aliasedClasses = allClasses.filter(classEntry => classEntry.aliases && classEntry.aliases.length > 0)

        // const aliasedClassesWriteOps = aliasedClasses.map((classEntry) => {
        //   // console.log({
        //   //   filter: {
        //   //     $or: [{ subjectNumber: classEntry.subjectNumber },
        //   //     { aliases: classEntry.subjectNumber }],
        //   //     term: classEntry.term
        //   //   }
        //   // })

        //   return ({
        //     updateOne: {
        //       filter: {
        //         $or: [{ subjectNumber: classEntry.subjectNumber },
        //         { aliases: classEntry.subjectNumber }],
        //         term: classEntry.term
        //       },
        //       update: {
        //         $setOnInsert: classEntry
        //       },
        //       upsert: true
        //     }
        //   })
        // })

        // const bulkWriteAliasResults = await Class.bulkWrite(aliasedClassesWriteOps)

        // console.log(bulkWriteAliasResults)
        // console.log(bulkAddResult)

        // If the classes already exist, update only description, instructors, and cross-listed departments
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

        return res.status(200).json({
          success: true,
          data: {
            newClasses: bulkAddResult.insertedCount,
            updatedClasses: bulkWriteUpdate.modifiedCount + bulkWriteCrossListedUpdate.modifiedCount,
          }
        })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
        }
      }
      break
    case 'DELETE':
      try {
        // const classExists = await Class.exists()
        console.log(body)
        console.log(typeof body)
        // console.log(session)

        if (session.user && session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        // console.log(allClasses)

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
        // const classExists = await Class.exists()
        console.log(body)
        console.log(typeof body)
        // console.log(session)

        if (session.user && session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        // console.log(allClasses)

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
