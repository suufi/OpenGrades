import { IReviewVote } from '@/types'
import mongoose, { Model } from 'mongoose'
const { Schema } = mongoose

const ReviewVoteSchema = new mongoose.Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    classReview: {
        type: Schema.Types.ObjectId,
        ref: 'ClassReview',
        required: true
    },
    classReviewAuthor: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    vote: {
        type: Number, // 1 for upvote, -1 for downvote, 0 for removed/unvoted (kept to avoid re-granting karma on re-upvote)
        required: true,
        min: -1,
        max: 1
    },
    karmaGranted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true })

export default (mongoose.models.ReviewVote as Model<IReviewVote> || mongoose.model<IReviewVote>('ReviewVote', ReviewVoteSchema))
