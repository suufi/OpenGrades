// @ts-nocheck
require('better-logging')(console)

import type { NextApiRequest, NextApiResponse } from 'next'
import Class from '../../../models/Class'
import { APIClass, IClass } from '../../../types'
import mongoConnection from '../../../utils/mongoConnection'

import { auth } from '@/utils/auth'

import Fuse from 'fuse.js'
import { decode } from 'html-entities'
import mongoose from 'mongoose'
import AuditLog from '../../../models/AuditLog'

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

function parseClassName (className: string) {
  if (className.slice(-1) === 'J') {
    return className.substring(0, className.length - 1)
  } else {
    return className
  }
}

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
        const extraQuery: ClassQuery = req.query
        delete extraQuery.subjectNumber

        let classes = await Class.find(extraQuery).lean()
        if (req.query.subjectNumber) {
          const fuse = new Fuse(classes, {
            location: 0,
            keys: ['subjectNumber']
          })

          classes = fuse.search(req.query.subjectNumber as string).map((result) => result.item)
        }

        return res.status(200).json({ success: true, data: classes })
      } catch (error: unknown) {
        if (error instanceof Error) {
          return res.status(400).json({ success: false, message: error.toString() })
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

        if (!session.user || session.user && session.user?.trustLevel < 2) {
          return res.status(403).json({ success: false, message: 'You\'re not allowed to do that.' })
        }

        if (!body.selectedDepartments || (body.selectedDepartments && body.selectedDepartments.length === 0)) {
          return res.status(400).json({ success: false, message: 'Provide at least one department.' })
        }
        console.log('actor', session.user)
        await AuditLog.create({
          actor: session.user._id,
          type: 'FetchDepartment',
          description: `Fetched ${body.selectedDepartments.join(', ')} departments for ${body.term}.`
        })

        const requestHeaders = new Headers()
        requestHeaders.set('client_id', process.env.MIT_API_CLIENT_ID)
        requestHeaders.set('client_secret', process.env.MIT_API_CLIENT_SECRET)

        const allClasses: IClass[] = []

        for (const department of body.selectedDepartments) {
          let apiFetch
          try {
            apiFetch = await fetch(`https://mit-course-catalog-v2.cloudhub.io/coursecatalog/v2/terms/${body.term}/subjects?dept=${department}`, {
              headers: requestHeaders
            }).then(async (response) => {
              const res = await response.json()
              console.log(res)
              if (response.ok) {
                return res
              }
              throw new Error(res.errorDescription)
            })
          } catch (error: unknown) {
            console.log(error)
            if (error instanceof Error) {
              throw new Error(error.message)
            }
          }

          apiFetch.items.forEach((apiClassEntry: APIClass) => {
            console.log('pushing', apiClassEntry.subjectId)
            const classMatchRegex = /(\w{1,3}\.[\w]{1,5})/g
            console.log('aliases', [...apiClassEntry.cluster.matchAll(classMatchRegex)].map(match => parseClassName(match[0])))
            allClasses.push({
              term: apiClassEntry.termCode,
              subjectNumber: apiClassEntry.subjectId,
              aliases: [...apiClassEntry.cluster.matchAll(classMatchRegex)].map(match => parseClassName(match[0])),
              subjectTitle: apiClassEntry.title,
              academicYear: parseInt(apiClassEntry.academicYear),
              department,
              units: apiClassEntry.units,
              description: apiClassEntry.description,
              offered: apiClassEntry.offered,
              display: apiClassEntry.offered,
              instructors: decode(apiClassEntry.instructors).split(',').map((name: string) => name.trim())
            })
          })
        }

        // console.log(allClasses)

        // const bulkAddResult = await Class.insertMany(allClasses.filter(classEntry => !classEntry.aliases || classEntry.aliases.length === 0))
        const bulkAddResult = await Class.bulkWrite(
          allClasses.filter(classEntry => !classEntry.aliases || classEntry.aliases.length === 0).map((classEntry) => ({
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

        const aliasedClasses = allClasses.filter(classEntry => classEntry.aliases && classEntry.aliases.length > 0)

        const aliasedClassesWriteOps = aliasedClasses.map((classEntry) => {
          console.log({
            filter: {
              $or: [{ subjectNumber: classEntry.subjectNumber },
              { aliases: classEntry.subjectNumber }],
              term: classEntry.term
            }
          })

          return ({
            updateOne: {
              filter: {
                $or: [{ subjectNumber: classEntry.subjectNumber },
                { aliases: classEntry.subjectNumber }],
                term: classEntry.term
              },
              update: {
                $setOnInsert: classEntry
              },
              upsert: true
            }
          })
        })

        const bulkWriteAliasResults = await Class.bulkWrite(aliasedClassesWriteOps)

        // const bulkWriteResult = await Class.bulkWrite(
        //   allClasses.filter(classEntry => classEntry.aliases classEntry.aliases.length === 0).map((classEntry) => ({
        //     updateOne: {
        //       filter: { $or: [{ subjectNumber: classEntry.subjectNumber }, { aliases: classEntry.subjectNumber }], term: classEntry.term },
        //       update: { $setOnInsert: classEntry },
        //       upsert: true
        //     }
        //   }))
        // )

        console.log(bulkWriteAliasResults)
        console.log(bulkAddResult)

        return res.status(200).json({
          success: true,
          data: {
            newClasses: bulkWriteAliasResults.upsertedCount + bulkAddResult.insertedCount,
            classes: await Class.find().lean()
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
