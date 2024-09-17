import mongoose from 'mongoose'
import { IClassGrade } from '../types'

const { Schema } = mongoose

const ClassGradeSchema = new mongoose.Schema<IClassGrade>({
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
    numericGrade: {
        type: Number,
        min: 0,
        max: 100
    },
    letterGrade: {
        type: String,
        enum: ['A', 'B', 'C', 'D', 'F', 'P', 'DR']
    },
    methodOfGradeCalculation: {
        type: String,
        required: true
    },
    verified: {
        type: Boolean,
        required: true
    }
}, { timestamps: true })

export default (mongoose.models.ClassGrade || mongoose.model('ClassGrade', ClassGradeSchema))
