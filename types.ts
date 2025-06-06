import { type DefaultSession } from "next-auth"
import { ParsedUrlQuery } from 'querystring'

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
            NEXTAUTH_SECRET: string
            MIT_API_CLIENT_ID: string
            MIT_API_CLIENT_SECRET: string
            AUTH_TRUST_HOST: boolean
            ELASTIC_SEARCH_URI: string
        }
    }
}

export enum LetterGrade {
    A = 'A',
    B = 'B',
    C = 'C',
    D = 'D',
    F = 'F',
    DR = 'DR'
}

export enum IdentityFlags {
    FirstGeneration = 'First Gen',
    LowIncome = 'Low Income',
    BIL = 'BIL',
    International = 'International'
}

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

export interface IClass {
    _id?: string
    subjectNumber: string
    aliases?: string[]
    subjectTitle: string
    instructors: string[]
    term: string
    academicYear: number
    display?: boolean
    description: string
    department: string
    crossListedDepartments: string[]
    units: string
    reviewable: boolean
    offered: boolean
    createdAt?: Date
    updatedAt?: Date
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
    classesTaken: IClass[]
    flags: IdentityFlags[]
    referredBy: IUser,
    avatar: string,
    supportStatus: SupportStatus,
    courseAffiliation: ICourseOption[],
    lastGradeReportUpload: Date,
    createdAt: Date,
    updatedAt: Date,
}

export interface IClassReview {
    _id?: string
    class: IClass
    author: IUser
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
}

export interface IClassGrade {
    _id?: string
    class: IClass
    author: IUser
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
    RemoveContent = 'Removecontent',
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
    actor: IUser
    type: AuditLogType
    description: string
    createdAt: Date
    updatedAt: Date
}

export interface IContentSubmission {
    _id?: string
    class: IClass
    author: IUser
    approved: boolean
    contentURL: string
    bucketPath: string
    contentTitle: string
    type: string
    createdAt: Date
    updatedAt: Date
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
    actor: IUser
    amount: number
    description: string
    createdAt: Date
    updatedAt: Date
}

export interface IReport {
    _id?: string
    reporter: IUser
    contentSubmission: IContentSubmission
    classReview: IClassReview
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
    createdAt: Date
    updatedAt: Date
}

export interface ICourseOption {
    departmentCode: string,
    departmentName: string,
    courseDescription: string,
    courseName: string,
    courseLevel: string,
    courseOption: string,
    active: boolean
}