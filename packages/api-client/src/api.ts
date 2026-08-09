import type { ApiClient } from './client'
import type {
  ClassesParams,
  ClassesResponse,
  ClassDependencyData,
  ClassReview,
  ContentSubmissionData,
  FiltersResponse,
  GradeReportUploadResult,
  OpenGradesClass,
  OpenGradesUser,
  QaQuestion,
  UserReview,
} from './types'

function buildSearchParams(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (value === '' && key !== 'institutions') continue
    searchParams.set(key, String(value))
  }
  return searchParams.toString()
}

function classesParamsToQuery(params: ClassesParams): string {
  return buildSearchParams({
    search: params.search,
    page: params.page,
    limit: params.limit,
    offered: params.offered === true || params.offered === 'true' ? 'true' : params.offered === false || params.offered === 'false' ? 'false' : params.offered as string | undefined,
    reviewable: params.reviewable === true || params.reviewable === 'true' ? 'true' : params.reviewable as string | undefined,
    reviewsOnly: params.reviewsOnly === true || params.reviewsOnly === 'true' ? 'true' : params.reviewsOnly as string | undefined,
    departments: params.departments,
    terms: params.terms,
    academicYears: params.academicYears,
    communicationRequirements: params.communicationRequirements,
    girAttributes: params.girAttributes,
    hassAttributes: params.hassAttributes,
    sortField: params.sortField,
    sortOrder: params.sortOrder,
    all: params.all === true || params.all === 'true' ? 'true' : params.all as string | undefined,
    term: params.term,
    institutions: params.institutions,
    useDescription: params.useDescription === true || params.useDescription === 'true' ? 'true' : params.useDescription as string | undefined,
    favoritesOnly:
      params.favoritesOnly === true || params.favoritesOnly === 'true'
        ? 'true'
        : params.favoritesOnly === false || params.favoritesOnly === 'false'
          ? 'false'
          : (params.favoritesOnly as string | undefined),
  })
}

export function createOpenGradesApi(client: ApiClient) {
  const { requestJson } = client

  return {
    async getMe(): Promise<OpenGradesUser> {
      const res = await requestJson<{ user: OpenGradesUser }>('/api/me')
      if (!res.data?.user) throw new Error('User not found')
      return res.data.user
    },

    async updateMe(body: Record<string, unknown>): Promise<OpenGradesUser> {
      const res = await requestJson<OpenGradesUser>('/api/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.data) throw new Error(res.message || 'Failed to update profile')
      return res.data
    },

    async updatePrivacy(body: Record<string, unknown>): Promise<{ message?: string }> {
      const res = await requestJson<{ message?: string }>('/api/me/privacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.data ?? { message: res.message }
    },

    async getClasses(params: ClassesParams): Promise<ClassesResponse> {
      const qs = classesParamsToQuery(params)
      const res = await requestJson<OpenGradesClass[]>(`/api/classes?${qs}`)
      return {
        success: res.success,
        data: res.data ?? [],
        meta: res.meta as ClassesResponse['meta'],
      }
    },

    async getClass(id: string): Promise<OpenGradesClass> {
      const res = await requestJson<OpenGradesClass>(`/api/classes/${id}`)
      if (!res.data) throw new Error('Class not found')
      return res.data
    },

    async getAggregatedClass(subjectNumber: string): Promise<{ classes: OpenGradesClass[]; reviews: ClassReview[] }> {
      const res = await requestJson<{ classes: OpenGradesClass[]; reviews: ClassReview[] }>(
        `/api/classes/aggregate/${encodeURIComponent(subjectNumber)}`
      )
      if (!res.data) throw new Error('Aggregated class not found')
      return res.data
    },

    async getClassReviews(classId: string): Promise<{ reviews: ClassReview[]; grades: { letterGrade: string; numericGrade?: number }[] }> {
      const res = await requestJson<{ reviews: ClassReview[]; grades: { letterGrade: string; numericGrade?: number }[] }>(
        `/api/classes/${classId}/reviews`
      )
      return res.data ?? { reviews: [], grades: [] }
    },

    async getClassContentSubmissions(classId: string): Promise<ContentSubmissionData[]> {
      const res = await requestJson<ContentSubmissionData[] | { items?: ContentSubmissionData[] }>(
        `/api/classes/${classId}/content`
      )
      const data = res.data
      if (Array.isArray(data)) return data
      if (data && typeof data === 'object' && Array.isArray((data as { items?: ContentSubmissionData[] }).items)) {
        return (data as { items: ContentSubmissionData[] }).items
      }
      return []
    },

    async getClassDependencies(classId: string): Promise<{
      prerequisites: ClassDependencyData[]
      corequisites: ClassDependencyData[]
      requiredBy: ClassDependencyData[]
      nextCourses: ClassDependencyData[]
    }> {
      const res = await requestJson<{
        prerequisites?: ClassDependencyData[]
        corequisites?: ClassDependencyData[]
        requiredBy?: ClassDependencyData[]
        nextCourses?: ClassDependencyData[]
      }>(`/api/classes/${encodeURIComponent(classId)}/dependencies`)
      const data = res.data ?? {}
      return {
        prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites : [],
        corequisites: Array.isArray(data.corequisites) ? data.corequisites : [],
        requiredBy: Array.isArray(data.requiredBy) ? data.requiredBy : [],
        nextCourses: Array.isArray(data.nextCourses) ? data.nextCourses : [],
      }
    },

    async getClassContentDownloadUrl(classId: string, contentSubmissionId: string): Promise<string> {
      const res = await requestJson<{ signedURL?: string; contentURL?: string }>(
        `/api/classes/${classId}/content/${contentSubmissionId}`
      )
      const data = res.data as { signedURL?: string; contentURL?: string } | undefined
      const url = data?.signedURL || data?.contentURL
      if (!url) throw new Error('No downloadable URL returned')
      return url
    },

    async getFilters(): Promise<FiltersResponse> {
      const res = await requestJson<FiltersResponse>('/api/classes/filters')
      return res.data ?? { years: [], departments: [] }
    },

    async getUserReviews(): Promise<UserReview[]> {
      const res = await requestJson<UserReview[]>('/api/me/reviews')
      return res.data ?? []
    },

    async getRecommendations(limit = 5): Promise<unknown> {
      const res = await requestJson<unknown>(`/api/recommendations/for-user?limit=${limit}`)
      return res.data
    },

    async getDiscover(): Promise<unknown> {
      const res = await requestJson<unknown>('/api/discover')
      return res.data ?? res
    },

    async getFavorites(): Promise<string[]> {
      const res = await requestJson<{ favorites: string[] }>('/api/me/favorites')
      return res.data?.favorites ?? []
    },

    async addFavorite(subjectNumber: string): Promise<string[]> {
      const res = await requestJson<{ favorites: string[] }>('/api/me/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectNumber }),
      })
      return res.data?.favorites ?? []
    },

    async removeFavorite(subjectNumber: string): Promise<string[]> {
      const res = await requestJson<{ favorites: string[] }>('/api/me/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectNumber }),
      })
      return res.data?.favorites ?? []
    },

    async voteOnReview(
      classId: string,
      reviewId: string,
      vote: 1 | -1 | 0
    ): Promise<void> {
      await requestJson(
        `/api/classes/${encodeURIComponent(classId)}/reviews/${encodeURIComponent(reviewId)}/vote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vote }),
        }
      )
    },

    async getSimilarCourses(classId: string, limit = 6): Promise<unknown[]> {
      const res = await requestJson<unknown[]>(
        `/api/classes/${encodeURIComponent(classId)}/similar-courses?limit=${limit}`
      )
      return res.data ?? []
    },

    async getQuestions(subjectNumber: string): Promise<QaQuestion[]> {
      const res = await requestJson<QaQuestion[]>(
        `/api/questions?subjectNumber=${encodeURIComponent(subjectNumber)}`
      )
      return res.data ?? []
    },

    async getReviewsBySubject(subjectNumber: string): Promise<{ term: string; label: string }[]> {
      const res = await requestJson<{ term: string; label: string }[]>(
        `/api/me/reviews-by-subject?subjectNumber=${encodeURIComponent(subjectNumber)}`
      )
      return res.data ?? []
    },

    async getQaRecipientCount(subjectNumber: string): Promise<{ count: number | null; cost: number | null }> {
      const res = await requestJson<{ count: number | null; cost: number | null }>(
        `/api/questions/qa-recipient-count?subjectNumber=${encodeURIComponent(subjectNumber)}`
      )
      return res.data ?? { count: null, cost: null }
    },

    async verifyReferralKerb(kerb: string): Promise<string> {
      const res = await requestJson<string>(`/api/me/referral-kerb?kerb=${encodeURIComponent(kerb)}`)
      if (!res.data) throw new Error(res.message || 'Invalid kerb')
      return res.data as string
    },

    async reportContent(params: {
      reason: string
      classReview?: string
      contentSubmission?: string
    }): Promise<unknown> {
      const res = await requestJson<unknown>('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      return res.data ?? res
    },

    async uploadGradeReport(
      formData: FormData,
      withPartialReviews = true
    ): Promise<GradeReportUploadResult> {
      formData.set('withPartialReviews', withPartialReviews ? 'true' : 'false')
      const res = await requestJson<GradeReportUploadResult>('/api/me/grade-report-upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.data) throw new Error(res.message || 'Upload failed')
      return res.data
    },

    async saveGradeReportClasses(result: GradeReportUploadResult): Promise<void> {
      const classesTaken = result.matchedClasses.map((cls) => cls._id)
      await requestJson('/api/me/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classesTaken,
          partialReviews: result.partialReviews,
        }),
      })
    },

    async uploadClassContent(classId: string, formData: FormData): Promise<{ contentSubmissionId: string; fileKey: string }> {
      const res = await requestJson<{ contentSubmissionId: string; fileKey: string }>(
        `/api/classes/${classId}/content`,
        { method: 'POST', body: formData }
      )
      if (!res.data) throw new Error(res.message || 'Upload failed')
      return res.data
    },
  }
}

export type OpenGradesApi = ReturnType<typeof createOpenGradesApi>
