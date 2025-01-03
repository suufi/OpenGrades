import mongoose from 'mongoose'
import { IClassReview } from '../types'

const { Schema } = mongoose

// interface ClassReview {
//     id?: string;
//     class: Class;
//     author: User;
//     approved: boolean;
//     overallRating: number;
//     firstYear: boolean;
//     retaking: boolean;
//     droppedClass: boolean;
//     hoursPerWeek: string;
//     recommendationLevel: number;
//     classComments: string;
//     numericGrade: number;
//     letterGrade: string;
// }

const ClassReviewSchema = new mongoose.Schema<IClassReview>({
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
  overallRating: {
    type: Number,
    min: 1,
    max: 7
  },
  firstYear: {
    type: Boolean,
  },
  retaking: {
    type: Boolean,
  },
  droppedClass: {
    type: Boolean,
  },
  hoursPerWeek: {
    type: String,
    enum: ['0-2 hours', '3-5 hours', '6-8 hours', '9-11 hours', '12-14 hours', '15-17 hours', '18-20 hours', '21-23 hours', '24-26 hours', '37-40 hours'],
  },
  recommendationLevel: {
    type: Number,
    min: 1,
    max: 5
  },
  classComments: {
    type: String,
  },
  backgroundComments: {
    type: String
  },
  numericGrade: {
    type: Number,
    min: 0,
    max: 100
  },
  letterGrade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'F', 'DR', 'P']
  },
  methodOfGradeCalculation: {
    type: String,
  },
  display: {
    type: Boolean,
    default: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  partial: {
    type: Boolean,
    default: false
  }
}, { timestamps: true })

export default (mongoose.models.ClassReview || mongoose.model('ClassReview', ClassReviewSchema))
