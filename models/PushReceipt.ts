import mongoose, { Model } from 'mongoose'

export interface IPushReceipt {
  _id?: string
  ticketId: string
  token: string
  checkAfter: Date
  attempts: number
  createdAt: Date
  updatedAt: Date
}

const PushReceiptSchema = new mongoose.Schema<IPushReceipt>({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  token: {
    type: String,
    required: true
  },
  checkAfter: {
    type: Date,
    required: true,
    index: true
  },
  attempts: {
    type: Number,
    default: 0
  }
}, { timestamps: true })

export default (mongoose.models.PushReceipt as Model<IPushReceipt> || mongoose.model<IPushReceipt>('PushReceipt', PushReceiptSchema))
