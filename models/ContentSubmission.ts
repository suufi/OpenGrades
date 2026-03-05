import mongoose, { Model } from 'mongoose'
import { IContentSubmission } from '../types'

const { Schema } = mongoose

const ContentSubmissionSchema = new mongoose.Schema<IContentSubmission>({
  class: {
    type: Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approved: {
    type: Boolean,
    default: true
  },
  contentURL: {
    type: String,
  },
  bucketPath: {
    type: String,
  },
  contentTitle: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  }
}, { timestamps: true })

export default (mongoose.models.ContentSubmission as Model<IContentSubmission> || mongoose.model<IContentSubmission>('ContentSubmission', ContentSubmissionSchema))