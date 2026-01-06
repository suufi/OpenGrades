import mongoose from 'mongoose'
import { IClass } from '../types'

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
    enum: ['BIOL', 'CAL1', 'CAL2', 'CHEM', 'LAB', 'LAB2', 'PHY1', 'PHY2', 'REST']
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
  }
}, { timestamps: true })

ClassSchema.index({ term: 1, subjectNumber: 1 })
ClassSchema.index({ 'instructorDetails.kerbId': 1 })
ClassSchema.index({ department: 1, term: 1 })
ClassSchema.index({ hassAttribute: 1 })
ClassSchema.index({ girAttribute: 1 })
ClassSchema.index({ communicationRequirement: 1 })
ClassSchema.index({ classTags: 1 })

export default (mongoose.models.Class || mongoose.model('Class', ClassSchema))
