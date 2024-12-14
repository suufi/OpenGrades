import mongoose from 'mongoose'
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
        type: Number, // 1 for upvote, -1 for downvote
        required: true,
        min: -1,
        max: 1
    }
}, { timestamps: true })

export default (mongoose.models.ReviewVote || mongoose.model('ReviewVote', ReviewVoteSchema))
