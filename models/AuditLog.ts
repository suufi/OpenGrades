import mongoose from 'mongoose'
import { IAuditLog } from '../types'

const { Schema } = mongoose

const AuditLogSchema = new mongoose.Schema<IAuditLog>({
  actor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    enum: [
      'DeleteClass',
      'FetchDepartment',
      'SubmitContent',
      'ApproveContent',
      'RemoveContent',
      'ReportContent',
      'AddReview',
      'EditReview',
      'HideReview',
      'JoinPlatform',
      'VerifyPlatform',
      'DeanonymizeReview',
    ],
    type: String
  },
  description: {
    type: String,
    required: true
  }
}, { timestamps: true })

export default (mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema))
