import mongoose, { Model, Types } from 'mongoose'

export interface IPushToken {
  _id?: string
  user: Types.ObjectId
  token: string
  platform: 'ios' | 'android'
  createdAt: Date
  updatedAt: Date
}

const PushTokenSchema = new mongoose.Schema<IPushToken>({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  platform: {
    type: String,
    enum: ['ios', 'android'],
    required: true
  }
}, { timestamps: true })

PushTokenSchema.index({ user: 1, token: 1 })

export default (mongoose.models.PushToken as Model<IPushToken> || mongoose.model<IPushToken>('PushToken', PushTokenSchema))
