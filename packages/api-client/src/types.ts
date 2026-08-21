export interface OpenGradesClass {
  _id: string
  subjectNumber: string
  subjectTitle: string
  description?: string
  department: string
  crossListedDepartments?: string[]
  instructors: string[]
  term: string
  academicYear: number
  units?: string
  unitHours?: string
  hassAttribute?: string | null
  girAttribute?: string[]
  communicationRequirement?: string | null
  prerequisites?: string
  corequisites?: string
  has_final?: boolean | null
  classTags?: string[]
  offered: boolean
  reviewable: boolean
  aliases?: string[]
  userCount?: number
  classReviewCount?: number
  contentSubmissionCount?: number
  highlight?: Record<string, string[]>
  score?: number
  institution?: 'mit' | 'harvard'
  // MIT Data Warehouse enrichment
  level?: 'U' | 'G' | null
  unitsBreakdown?: {
    lecture: number
    lab: number
    design: number
    preparation: number
    isVariable: boolean
  } | null
  gradeRule?: string | null
  gradeType?: string | null
  termDuration?: string | null
  quarterInformation?: string | null
  seasonsOffered?: {
    fall: boolean
    iap: boolean
    spring: boolean
    summer: boolean
  } | null
  notOfferedYear?: string | null
  jointSubjects?: string[]
  equivalentSubjects?: string[]
  meetsWithSubjects?: string[]
  oldSubjectNumber?: string | null
  schedule?: string | null
  responsibleFaculty?: { name: string } | null
  enrollment?: number | null
  catalogUrl?: string | null
  warehouseSyncedAt?: string | Date | null
}

export interface OpenGradesUser {
  _id: string
  name: string
  email: string
  kerb: string
  classOf?: number
  affiliation?: string
  trustLevel?: number
  year?: string
  programTerms?: string[]
  classesTaken?: OpenGradesClass[] | string[]
  reviewCount?: number
  karmaBalance?: number
  lastGradeReportUpload?: string | Date
  emailOptIn?: boolean | null
  aiEmbeddingOptOut?: boolean
  includeHarvardCourses?: boolean
  qaEmailOptOut?: boolean
  karmaDisplayKerb?: boolean
  supportStatus?: string
  courseAffiliation?: unknown[]
  banned?: boolean
  verified?: boolean
  flags?: string[]
  referredBy?: { kerb: string } | string
  notificationPreferences?: Record<string, boolean>
  [key: string]: unknown
}

export interface ClassesParams {
  search?: string
  page?: number
  limit?: number
  offered?: string | boolean
  reviewable?: string | boolean
  reviewsOnly?: string | boolean
  departments?: string
  terms?: string
  academicYears?: string
  communicationRequirements?: string
  girAttributes?: string
  hassAttributes?: string
  levels?: string
  seasons?: string
  halfTerm?: string | boolean
  sortField?: string
  sortOrder?: string
  all?: string | boolean
  term?: string
  institutions?: string
  useDescription?: string | boolean
  favoritesOnly?: string | boolean
}

export interface ClassesResponse {
  success: boolean
  data: OpenGradesClass[]
  meta?: {
    currentPage: number
    totalPages: number
    totalClasses: number
  }
}

export interface FiltersResponse {
  years: number[]
  departments: string[]
  mitDepartments?: string[]
  harvardDepartments?: string[]
}

export interface ClassReview {
  _id: string
  class: string | OpenGradesClass
  partial?: boolean
  author?: {
    name: string
    hiddenName?: string
    kerb?: string
  }
  letterGrade?: string
  numericGrade?: number | null
  methodOfGradeCalculation?: string | null
  overallRating?: number
  recommendationLevel?: number
  hoursPerWeek?: string
  classComments?: string
  backgroundComments?: string
  firstYear?: boolean
  retaking?: boolean
  droppedClass?: boolean
  display?: boolean
  createdAt?: string
  upvotes?: number
  downvotes?: number
  userVote?: number | null
  isOwnReview?: boolean
  [key: string]: unknown
}

export interface DiscoverResponse {
  hiddenGems?: unknown[]
  trending?: unknown[]
  newClasses?: unknown[]
  highestImprovement?: unknown[]
  popular?: unknown[]
}

export interface ClassDependencyData {
  _id: string
  subjectNumber: string
  subjectTitle: string
  term?: string
  academicYear?: number
}

export interface ContentSubmissionData {
  _id: string
  contentTitle: string
  type: string
  contentURL?: string
  createdAt?: string
  [key: string]: unknown
}

export interface QaAnswer {
  _id: string
  body: string
  termTaken?: string
  createdAt: string
  upvotes?: number
  downvotes?: number
  userVote?: number
  authorAnonymousId?: string
  isAuthor?: boolean
}

export interface QaQuestion {
  _id: string
  body: string
  createdAt: string
  solvedAt?: string | null
  blasted?: boolean
  isAuthor?: boolean
  authorAnonymousId?: string
  answers?: QaAnswer[]
}

export interface GradeReportUploadResult {
  matchedClasses: OpenGradesClass[]
  partialReviews: {
    class: string
    letterGrade: string
    partial: boolean
    display: boolean
    firstYear: boolean
    droppedClass: boolean
  }[]
  creditedSubjects: string[]
}

export interface UserReview {
  _id: string
  class: OpenGradesClass
  partial: boolean
  letterGrade?: string
  createdAt: string
}
