import { type DefaultSession } from "next-auth"
import { ParsedUrlQuery } from 'querystring'
import { Types } from 'mongoose'
import type { IHarvardCourse } from './types/harvardCourse'

export type { IHarvardCourse, IHarvardInstructor, IHarvardMeetingPattern } from './types/harvardCourse'

declare module 'next-auth' {
    interface Session {
        user: {
            _id: string
            trustLevel: number
            verified: boolean
            kerb: string
            name: string
            classOf: number
            affiliation: string
        } & DefaultSession["user"]
    }
}

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            MONGODB_CONNECTION_URI: string
            MIT_OIDC_WELLKNOWN: string
            MIT_OIDC_CLIENT_ID: string
            MIT_OIDC_CLIENT_SECRET: string
            MIT_OIDC_AUTHORIZATION_ENDPOINT: string
            MIT_OIDC_ISSUER: string
            NEXTAUTH_SECRET?: string
            MIT_API_CLIENT_ID: string
            MIT_API_CLIENT_SECRET: string
            AUTH_TRUST_HOST: boolean
            ELASTIC_SEARCH_URI: string
            ELASTICSEARCH_PUBLIC_EMBEDDINGS_INDEX?: string
            ELASTICSEARCH_PRIVATE_EMBEDDINGS_INDEX?: string
            OPENAI_API_KEY?: string
            OPENAI_PUBLIC_EMBEDDING_MODEL?: string
            OPENAI_PUBLIC_EMBEDDING_DIMENSIONS?: string
        }
    }
}

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F' | 'DR' | 'P'
export type IdentityFlags = 'First Gen' | 'Low Income' | 'BIL' | 'International'

export enum TimeRange {
    '0-2 hours' = '0-2 hours',
    '3-5 hours' = '3-5 hours',
    '6-8 hours' = '6-8 hours',
    '9-11 hours' = '9-11 hours',
    '12-14 hours' = '12-14 hours',
    '15-17 hours' = '15-17 hours',
    '18-20 hours' = '18-20 hours',
    '21-23 hours' = '21-23 hours',
    '24-26 hours' = '24-26 hours',
    '37-40 hours' = '37-40 hours',
    'Unknown' = 'Unknown'
}

export enum SupportStatus {
    Maintainer = 'Maintainer',
    Supporter = 'Supporter'
}

// Generic reference type for Mongoose relations (unpopulated = ObjectId, populated = T)
export type Ref<T> = T | Types.ObjectId

export interface IInstructorDetail {
    name: string
    kerbId: string
    instrType: string
}

export interface IClass {
    _id?: string
    subjectNumber: string
    aliases?: string[]
    subjectTitle: string
    instructors: string[]
    instructorDetails?: IInstructorDetail[]
    term: string
    academicYear: number
    display?: boolean
    description: string
    department: string
    crossListedDepartments: string[]
    units: string
    unitHours?: string
    communicationRequirement?: string | null
    hassAttribute?: string | null
    girAttribute?: string[]
    prerequisites?: string
    corequisites?: string
    has_final?: boolean | null
    classTags?: string[]
    reviewable: boolean
    offered: boolean
    institution?: 'mit' | 'harvard'
    harvardCatalogId?: string
    harvardSource?: IHarvardCourse
    createdAt?: Date
    updatedAt?: Date
}

/** Form values for the "Add Classes" form on the home page (used by index.tsx and ClassSearch). */
export interface AddClassesFormValues {
    classes: { [key: string]: string[] }
    flatClasses: string[]
}

export interface IUser {
    _id: string
    sub: string
    name: string
    kerb: string
    email: string
    classOf?: number
    year: string
    verified: boolean
    affiliation: string
    banned: boolean
    trustLevel: number
    classesTaken: Ref<IClass>[]
    flags: IdentityFlags[]
    referredBy: Ref<IUser> | null,
    avatar: string,
    supportStatus: SupportStatus,
    courseAffiliation: Ref<ICourseOption>[],
    lastGradeReportUpload: Date,
    emailOptIn?: boolean | null,
    programTerms?: Array<{
        program: Ref<ICourseOption> | string,
        terms: string[]
    }>,
    aiEmbeddingOptOut?: boolean,
    qaEmailOptOut?: boolean,
    includeHarvardCourses?: boolean,
    creditedSubjects?: string[],
    favoriteClasses?: string[],
    karmaDisplayKerb?: boolean,
    notificationPreferences?: INotificationPreferences,
    createdAt: Date,
    updatedAt: Date,
}

export type NotificationCategory = 'feature_updates' | 'catalog_updates' | 'pe_updates' | 'academic_calendar'

export interface INotificationPreferences {
    feature_updates: boolean
    catalog_updates: boolean
    pe_updates: boolean
    academic_calendar: boolean
}

export interface IPushToken {
    _id?: string
    user: Ref<IUser>
    token: string
    platform: 'ios' | 'android'
    createdAt: Date
    updatedAt: Date
}

export interface IScheduledNotification {
    _id?: string
    title: string
    body: string
    data?: Record<string, unknown>
    category: NotificationCategory
    scheduledAt: Date | null
    sentAt: Date | null
    status: 'pending' | 'sent' | 'failed' | 'cancelled'
    createdBy: Ref<IUser>
    recipientCount: number
    errorMessage?: string
    createdAt: Date
    updatedAt: Date
}

export interface IClassReview {
    _id?: string
    class: Ref<IClass>
    author: Ref<IUser>
    approved: boolean
    overallRating: number
    firstYear: boolean
    retaking: boolean
    droppedClass: boolean
    hoursPerWeek: TimeRange
    recommendationLevel: number
    classComments: string
    backgroundComments: string
    display: boolean
    createdAt: Date
    updatedAt: Date
    numericGrade: number
    letterGrade: LetterGrade
    methodOfGradeCalculation: string
    verified: boolean,
    partial: boolean
    userVote?: number | null
    upvotes?: number
    downvotes?: number
}

export interface IClassGrade {
    _id?: string
    class: Ref<IClass>
    author: Ref<IUser>
    numericGrade: number
    letterGrade: LetterGrade
    methodOfGradeCalculation: string
    verified: boolean
}

export enum AuditLogType {
    DeleteClass = 'DeleteClass',
    FetchDepartment = 'FetchDepartment',
    SubmitContent = 'SubmitContent',
    ApproveContent = 'ApproveContent',
    RemoveContent = 'RemoveContent',
    ReportContent = 'ReportContent',
    AddReview = 'AddReview',
    EditReview = 'EditReview',
    HideReview = 'HideReview',
    JoinPlatform = 'JoinPlatform',
    VerifyPlatform = 'VerifyPlatform',
    DeanonymizeReview = 'DeanonymizeReview',
    PreserveAlumni = 'PreserveAlumni'
}

export interface IAuditLog {
    _id?: string
    actor: Ref<IUser>
    type: AuditLogType
    description: string
    createdAt: Date
    updatedAt: Date
}

export interface IContentSubmission {
    _id?: string
    class: Ref<IClass>
    author: Ref<IUser>
    approved: boolean
    contentURL: string
    bucketPath: string
    contentTitle: string
    type: string
    createdAt: Date
    updatedAt: Date
    signedURL?: string | null
}

export interface APIClass {
    termCode: string
    subjectId: string
    academicYear: string
    title: string
    cluster: string
    prerequisites: string
    units: string
    optional: string
    description: string
    offered: boolean
    instructors: string
}

export interface IParams extends ParsedUrlQuery {
    id: string
}

export interface IKarma {
    _id?: string
    actor: Ref<IUser>
    amount: number
    description: string
    createdAt: Date
    updatedAt: Date
}

export interface IClassQuestion {
    _id?: string
    subjectNumber: string
    author: IUser
    body: string
    solvedAt?: Date
    createdAt: Date
    updatedAt: Date
}

export interface IClassQuestionAnswer {
    _id?: string
    question: IClassQuestion | string
    author: IUser
    body: string
    termTaken?: string
    upvotes?: number
    downvotes?: number
    createdAt: Date
    updatedAt: Date
}

export interface IQaBlast {
    _id?: string
    subjectNumber: string
    author: IUser | string
    body: string
    karmaSpent: number
    recipientCount: number
    question?: IClassQuestion | string
    createdAt: Date
    updatedAt: Date
}

export interface IReport {
    _id?: string
    reporter: Ref<IUser>
    contentSubmission: Ref<IContentSubmission>
    classReview: Ref<IClassReview>
    reason: string
    resolved: boolean
    outcome: string
    createdAt: Date
    updatedAt: Date
}

export interface IFAQ {
    _id?: string
    question: string
    answer: string
    category: string
    order: number
    createdAt: Date
    updatedAt: Date
}

export interface IChangelogEntry {
    _id?: string
    /** Release date (YYYY-MM-DD) or display label */
    date: string
    /** Optional title for this release (e.g. "March 2025") */
    title?: string
    /** Bullet points for this release */
    bullets: string[]
    /** Sort order (newest first: higher = newer) */
    order?: number
    createdAt?: Date
    updatedAt?: Date
}

export interface ICourseOption {
    _id?: string,
    departmentCode: string,
    departmentName: string,
    courseDescription: string,
    courseName: string,
    courseLevel: string,
    courseOption: string,
    active: boolean
}

export interface IReviewVote {
    _id?: string,
    user: IUser,
    classReview: IClassReview,
    classReviewAuthor: IUser,
    vote: number,
    karmaGranted?: boolean,
    createdAt: Date,
    updatedAt: Date
}

export type EmbeddingScope = 'public' | 'private'
export type EmbeddingSourceKind = 'class_catalog' | 'class_review' | 'content_submission'
export type EmbeddingProvider = 'openai' | 'ollama'

export interface RagRecommendationValidationResult {
    isValid: boolean
    failures: string[]
    selectedCourseIds: string[]
}

export interface RagEvalCase {
    id: string
    query: string
    studentProfile: {
        totalTaken: number
        takenSubjectNumbers: string[]
        takenByDepartment?: Record<string, number>
    }
    weakLabels?: {
        preferredSubjectNumbers?: string[]
        discouragedSubjectNumbers?: string[]
        topicalTerms?: string[]
    }
}

export interface RagEvalResult {
    caseId: string
    query: string
    variant: string
    selectedCourseIds: string[]
    metrics: {
        parseSuccess: number
        validity: number
        relevance: number
        progression: number
        diversity: number
        combined: number
    }
    scopeMetrics?: {
        publicCandidates: number
        privateEvidenceAttached: number
        privateOutsidePublic: number
    }
    failures: string[]
}

export interface EmbeddingHealthReport {
    generatedAt: string
    modelDistribution: Record<string, number>
    scopeDistribution?: Record<string, number>
    dimensionConsistency: {
        byRecordedDimensions: Record<string, number>
        byActualVectorLength: Record<string, number>
        mismatchCount: number
    }
    missingDescriptionEmbeddings: {
        offeredClasses: number
        missingCount: number
        sampleSubjectNumbers: string[]
    }
    staleDescriptionEmbeddings: {
        staleCount: number
        sampleSubjectNumbers: string[]
    }
    mongoEsCoverage: {
        mongoCount: number
        esCount: number
        difference: number
        sampleMissingInEs: string[]
    }
    scopeCoverage?: {
        public: {
            mongoCount: number
            esCount: number
            difference: number
            sampleMissingInEs: string[]
        }
        private: {
            mongoCount: number
            esCount: number
            difference: number
            sampleMissingInEs: string[]
        }
    }
    criticalAliasChecks: Array<{
        subjectNumber: string
        aliases: string[]
        hasDescriptionEmbedding: boolean
    }>
}
