import mongoose from 'mongoose'
import { IChangelogEntry } from '../types'

const { Schema } = mongoose

const ChangelogSchema = new mongoose.Schema<IChangelogEntry>({
  date: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: false
  },
  bullets: {
    type: [String],
    required: true,
    default: []
  },
  order: {
    type: Number,
    required: false
  }
}, { timestamps: true })

ChangelogSchema.index({ order: -1, date: -1 })

export default (mongoose.models.Changelog || mongoose.model('Changelog', ChangelogSchema))
