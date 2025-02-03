import { ICourseOption } from '@/types'
import mongoose from 'mongoose'

const { Schema } = mongoose

const CourseOptionSchema = new mongoose.Schema<ICourseOption>({
    departmentCode: {
        type: String,
        required: true
    },
    departmentName: {
        type: String,
        required: true
    },
    courseDescription: {
        type: String,
        required: true
    },
    courseName: {
        type: String,
        required: true
    },
    courseLevel: {
        type: String,
        enum: ['U', 'G'],
        required: true
    },
    courseOption: {
        type: String,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true })

export default (mongoose.models.CourseOption || mongoose.model('CourseOption', CourseOptionSchema))