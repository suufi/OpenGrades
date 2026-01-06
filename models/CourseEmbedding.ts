import mongoose from 'mongoose'

export interface ICourseEmbedding {
    _id?: mongoose.Types.ObjectId
    class: mongoose.Types.ObjectId
    embeddingType: 'description' | 'reviews' | 'content'
    embedding: number[]
    embeddingModel: string           // e.g., 'qwen3-embedding:4b'
    embeddingDimensions: number      // e.g., 2560, 768
    sourceText: string
    sourceId?: mongoose.Types.ObjectId
    chunkIndex?: number    // 0 = AI summary, 1+ = text chunks
    totalChunks?: number
    lastUpdated: Date
}

const { Schema } = mongoose

const CourseEmbeddingSchema = new mongoose.Schema<ICourseEmbedding>({
    class: {
        type: Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
        index: true
    },
    embeddingType: {
        type: String,
        enum: ['description', 'reviews', 'content'],
        required: true,
        index: true
    },
    embedding: {
        type: [Number],
        required: true
    },
    embeddingModel: {
        type: String,
        required: true,
        index: true
    },
    embeddingDimensions: {
        type: Number,
        required: true
    },
    sourceText: {
        type: String,
        required: true
    },
    sourceId: {
        type: Schema.Types.ObjectId
    },
    chunkIndex: {
        type: Number
    },
    totalChunks: {
        type: Number
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
})

CourseEmbeddingSchema.index({ class: 1, embeddingType: 1 })

export default (mongoose.models.CourseEmbedding || mongoose.model('CourseEmbedding', CourseEmbeddingSchema))
