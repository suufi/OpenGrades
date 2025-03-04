import mongoose from 'mongoose'

import { IUser } from '../types'

const { Schema } = mongoose

const UserSchema = new mongoose.Schema<IUser>({
  sub: {
    type: String,
    required: true,
    unique: true,
    // index: true
  },
  kerb: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  affiliation: {
    type: String
  },
  classOf: {
    type: Number
  },
  year: {
    type: String
  },
  verified: {
    type: Boolean,
    required: true,
    default: false
  },
  banned: {
    type: Boolean,
    default: false
  },
  flags: [{
    type: String,
    enum: ['First Gen', 'Low Income', 'BIL', 'International']
  }],
  classesTaken: [{
    type: Schema.Types.ObjectId,
    ref: 'Class'
  }],
  trustLevel: {
    type: Number,
    default: 0
  },
  referredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  avatar: {
    type: String,
    default: null
  },
  supportStatus: {
    type: String,
    enum: ['Maintainer', 'Supporter'],
    default: null
  },
  courseAffiliation: [{
    type: Schema.Types.ObjectId,
    ref: 'CourseOption'
  }],
  lastGradeReportUpload: {
    type: Date,
    default: null
  }
}, { timestamps: true })

export default (mongoose.models.User || mongoose.model('User', UserSchema))
