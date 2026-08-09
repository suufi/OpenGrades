import mongoose, { Model, Types } from 'mongoose'

export type AISearchCourseReference = {
    id: string
    number: string
    title: string
    institution?: string
}

export type AISearchMessage = {
    role: 'user' | 'assistant'
    content: string
    reasoning?: string
    courses?: AISearchCourseReference[]
    createdAt: Date
}

export interface IAISearchConversation {
    _id: Types.ObjectId
    user: Types.ObjectId
    title: string
    messages: AISearchMessage[]
    createdAt: Date
    updatedAt: Date
}

const CourseReferenceSchema = new mongoose.Schema<AISearchCourseReference>({
    id: { type: String, required: true },
    number: { type: String, required: true },
    title: { type: String, required: true },
    institution: { type: String, enum: ['mit', 'harvard'], default: 'mit' }
}, { _id: false })

const MessageSchema = new mongoose.Schema<AISearchMessage>({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 50000 },
    reasoning: { type: String, maxlength: 50000 },
    courses: { type: [CourseReferenceSchema], default: undefined },
    createdAt: { type: Date, default: Date.now }
}, { _id: false })

const AISearchConversationSchema = new mongoose.Schema<IAISearchConversation>({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        default: 'New course search',
        maxlength: 120
    },
    messages: {
        type: [MessageSchema],
        default: []
    }
}, { timestamps: true })

AISearchConversationSchema.index({ user: 1, updatedAt: -1 })

export default (
    mongoose.models.AISearchConversation as Model<IAISearchConversation> ||
    mongoose.model<IAISearchConversation>('AISearchConversation', AISearchConversationSchema)
)
