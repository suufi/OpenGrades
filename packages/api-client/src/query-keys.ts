/** Shared query keys used by web and mobile. */
export const queryKeys = {
  me: ['me'] as const,
  favorites: ['favorites'] as const,
  filters: ['filters'] as const,
  discover: ['discover'] as const,
  recommendations: (limit?: number) =>
    limit != null ? (['recommendations', limit] as const) : (['recommendations'] as const),
  userClasses: ['userClasses'] as const,
  userReviews: ['userReviews'] as const,
  classes: (params: Record<string, unknown>) => ['classes', params] as const,
  class: (id: string) => ['class', id] as const,
  classAggregate: (subjectNumber: string) => ['class', 'aggregate', subjectNumber] as const,
  reviews: (classId: string) => ['reviews', classId] as const,
  contentSubmissions: (classId: string) => ['contentSubmissions', classId] as const,
  dependencies: (classId: string) => ['dependencies', classId] as const,
  questions: (subjectNumber: string) => ['questions', subjectNumber] as const,
  reviewsBySubject: (subjectNumber: string) => ['reviewsBySubject', subjectNumber] as const,
  qaRecipientCount: (subjectNumber: string) => ['qaRecipientCount', subjectNumber] as const,
  referralKerb: (kerb: string) => ['referralKerb', kerb] as const,
}
