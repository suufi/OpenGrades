import mongoose, { Model, Types } from 'mongoose'

export type NotificationCategory = 'feature_updates' | 'catalog_updates' | 'pe_updates' | 'academic_calendar'

export interface IScheduledNotification {
  _id?: string
  title: string
  body: string
  data?: Record<string, unknown>
  category: NotificationCategory
  scheduledAt: Date | null
  sentAt: Date | null
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
  claimedAt?: Date | null
  createdBy: Types.ObjectId
  recipientCount: number
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
}

const ScheduledNotificationSchema = new mongoose.Schema<IScheduledNotification>({
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  category: {
    type: String,
    enum: ['feature_updates', 'catalog_updates', 'pe_updates', 'academic_calendar'],
    required: true
  },
  scheduledAt: {
    type: Date,
    default: null
  },
  sentAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'pending'
  },
  claimedAt: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientCount: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String,
    default: null
  }
}, { timestamps: true })

ScheduledNotificationSchema.index({ status: 1, scheduledAt: 1 })

export default (mongoose.models.ScheduledNotification as Model<IScheduledNotification> || mongoose.model<IScheduledNotification>('ScheduledNotification', ScheduledNotificationSchema))
