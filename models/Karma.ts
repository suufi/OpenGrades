import mongoose from 'mongoose'
import { IKarma } from '../types'

const { Schema } = mongoose

const KarmaScehma = new mongoose.Schema<IKarma>({
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

export default (mongoose.models.Karma || mongoose.model('Karma', KarmaScehma))
