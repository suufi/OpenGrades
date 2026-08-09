import mongoose, { Model } from 'mongoose'
import { IClass } from '../types'

const HarvardInstructorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, default: '' }
}, { _id: false })

const HarvardMeetingPatternSchema = new mongoose.Schema({
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  meetsOnMonday: { type: Boolean, default: false },
  meetsOnTuesday: { type: Boolean, default: false },
  meetsOnWednesday: { type: Boolean, default: false },
  meetsOnThursday: { type: Boolean, default: false },
  meetsOnFriday: { type: Boolean, default: false },
  meetsOnSaturday: { type: Boolean, default: false },
  meetsOnSunday: { type: Boolean, default: false }
}, { _id: false })

const HarvardSourceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  externalId: { type: Number, required: true },
  qGuideId: { type: Number, default: 0 },
  title: { type: String, required: true },
  subject: { type: String, required: true },
  subjectDescription: { type: String, default: '' },
  catalogNumber: { type: String, required: true },
  level: { type: String, default: '' },
  academicGroup: { type: String, default: '' },
  semester: { type: String, required: true },
  academicYear: { type: Number, required: true },
  classSection: { type: String, default: '' },
  component: { type: String, default: '' },
  description: { type: String, default: '' },
  instructors: { type: [HarvardInstructorSchema], default: [] },
  meetingPatterns: { type: [HarvardMeetingPatternSchema], default: [] },
  genEdArea: { type: [String], default: [] },
  divisionalDist: { type: [String], default: [] }
}, { _id: false })

const ClassSchema = new mongoose.Schema<IClass>({
  subjectNumber: {
    type: String,
    required: true
  },
  aliases: [{
    type: String
  }],
  description: {
    type: String
  },
  subjectTitle: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  crossListedDepartments: [{
    type: String
  }],
  instructors: [{
    type: String,
    required: true
  }],
  instructorDetails: [{
    name: {
      type: String,
      required: true
    },
    kerbId: {
      type: String,
      required: true
    },
    instrType: {
      type: String,
      required: true
    }
  }],
  units: {
    type: String
  },
  unitHours: {
    type: String
  },
  communicationRequirement: {
    type: String,
    enum: ['CI-H', 'CI-HW', null],
    default: null
  },
  hassAttribute: {
    type: String,
    enum: ['HASS-A', 'HASS-E', 'HASS-H', 'HASS-S', null],
    default: null
  },
  girAttribute: [{
    type: String,
    enum: ['BIOL', 'CAL1', 'CAL2', 'CHEM', 'LAB', 'PLAB', 'PHY1', 'PHY2', 'REST']
  }],
  prerequisites: {
    type: String
  },
  corequisites: {
    type: String
  },
  has_final: {
    type: Boolean,
    default: null
  },
  academicYear: {
    type: Number,
    required: true
  },
  term: {
    type: String,
    required: true
  },
  display: {
    type: Boolean,
    default: true
  },
  reviewable: {
    type: Boolean,
    default: true
  },
  classTags: [{
    type: String
  }],
  offered: {
    type: Boolean,
    required: true
  },
  institution: {
    type: String,
    enum: ['mit', 'harvard']
  },
  harvardCatalogId: {
    type: String,
    sparse: true,
    index: true
  },
  harvardSource: {
    type: HarvardSourceSchema,
    default: undefined
  }
}, { timestamps: true })

ClassSchema.index({ term: 1, subjectNumber: 1 })
ClassSchema.index({ 'instructorDetails.kerbId': 1 })
ClassSchema.index({ department: 1, term: 1 })
ClassSchema.index({ hassAttribute: 1 })
ClassSchema.index({ girAttribute: 1 })
ClassSchema.index({ communicationRequirement: 1 })
ClassSchema.index({ classTags: 1 })
ClassSchema.index({ institution: 1, harvardCatalogId: 1 }, { unique: true, sparse: true })

export default (mongoose.models.Class as Model<IClass> || mongoose.model<IClass>('Class', ClassSchema))
