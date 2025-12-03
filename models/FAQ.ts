import mongoose from 'mongoose'
import { IFAQ } from '../types'

const { Schema } = mongoose

const FAQSchema = new mongoose.Schema<IFAQ>({
    question: {
        type: String,
        required: true
    },
    answer: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: false
    },
    order: {
        type: Number,
        required: false
    }
}, { timestamps: true })

export default (mongoose.models.FAQ || mongoose.model('FAQ', FAQSchema))
