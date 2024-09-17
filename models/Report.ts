import mongoose from 'mongoose'

const { Schema } = mongoose

const ReportScheme = new mongoose.Schema({
    reporter: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    contentSubmission: {
        type: Schema.Types.ObjectId,
        ref: 'ContentSubmission',
    },
    classReview: {
        type: Schema.Types.ObjectId,
        ref: 'ClassReview',
    },
    reason: {
        type: String,
        required: true
    },
    resolved: {
        type: Boolean,
        default: false
    },
    outcome: {
        type: String,
    }
}, { timestamps: true })

ReportScheme.pre('validate', function (next) {
    if ((this.classReview && this.contentSubmission) || (!this.classReview && !this.contentSubmission))
        return next(new Error("At least and only one field (classReview, contentSubmission) should be populated"))
    next()
})

export default (mongoose.models.Report || mongoose.model('Report', ReportScheme))
