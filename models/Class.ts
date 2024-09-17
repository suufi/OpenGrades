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
  instructors: [{
    type: String,
    required: true
  }],
  units: {
    type: String
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
  offered: {
    type: Boolean,
    required: true
  }
}, { timestamps: true })

export default (mongoose.models.Class || mongoose.model('Class', ClassSchema))
