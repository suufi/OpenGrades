export interface IHarvardInstructor {
    name: string
    email: string
}

export interface IHarvardMeetingPattern {
    startTime: string
    endTime: string
    startDate: string
    endDate: string
    meetsOnMonday: boolean
    meetsOnTuesday: boolean
    meetsOnWednesday: boolean
    meetsOnThursday: boolean
    meetsOnFriday: boolean
    meetsOnSaturday: boolean
    meetsOnSunday: boolean
}

/** 1:1 with classes.wtf JSON — all keys present in scripts/courses-*.json */
export interface IHarvardCourse {
    id: string
    externalId: number
    qGuideId: number
    title: string
    subject: string
    subjectDescription: string
    catalogNumber: string
    level: string
    academicGroup: string
    semester: string
    academicYear: number
    classSection: string
    component: string
    description: string
    instructors: IHarvardInstructor[]
    meetingPatterns: IHarvardMeetingPattern[]
    genEdArea: string[]
    divisionalDist: string[]
}
