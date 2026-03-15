import mongoose, { Model } from 'mongoose'
import { IKarma } from '../types'

const { Schema } = mongoose

const KarmaSchema = new mongoose.Schema<IKarma>({
    actor: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    }
}, { timestamps: true })

export default (mongoose.models.Karma as Model<IKarma> || mongoose.model<IKarma>('Karma', KarmaSchema))
