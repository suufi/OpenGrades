import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { OpenGradesApi } from './api'
import { ApiError } from './client'
import { queryKeys } from './query-keys'
import type { ClassesParams, ClassesResponse } from './types'

const retryUnlessClientError = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 3
}

export function createOpenGradesQueries(api: OpenGradesApi) {
  return {
    me: () =>
      queryOptions({
        queryKey: queryKeys.me,
        queryFn: () => api.getMe(),
      }),

    favorites: () =>
      queryOptions({
        queryKey: queryKeys.favorites,
        queryFn: () => api.getFavorites(),
      }),

    filters: () =>
      queryOptions({
        queryKey: queryKeys.filters,
        queryFn: () => api.getFilters(),
      }),

    discover: () =>
      queryOptions({
        queryKey: queryKeys.discover,
        queryFn: () => api.getDiscover(),
        retry: retryUnlessClientError,
      }),

    recommendations: (limit = 5) =>
      queryOptions({
        queryKey: queryKeys.recommendations(limit),
        queryFn: () => api.getRecommendations(limit),
      }),

    userClasses: () =>
      queryOptions({
        queryKey: queryKeys.userClasses,
        queryFn: async () => {
          const user = await api.getMe()
          const taken = user.classesTaken
          if (!Array.isArray(taken)) return []
          return taken.filter((c): c is NonNullable<typeof c> => typeof c === 'object' && c !== null)
        },
      }),

    userReviews: () =>
      queryOptions({
        queryKey: queryKeys.userReviews,
        queryFn: () => api.getUserReviews(),
      }),

    class: (id: string) =>
      queryOptions({
        queryKey: queryKeys.class(id),
        queryFn: () => api.getClass(id),
        enabled: !!id,
      }),

    classAggregate: (subjectNumber: string) =>
      queryOptions({
        queryKey: queryKeys.classAggregate(subjectNumber),
        queryFn: () => api.getAggregatedClass(subjectNumber),
        enabled: !!subjectNumber,
      }),

    classReviews: (classId: string) =>
      queryOptions({
        queryKey: queryKeys.reviews(classId),
        queryFn: () => api.getClassReviews(classId),
        enabled: !!classId,
      }),

    classContentSubmissions: (classId: string) =>
      queryOptions({
        queryKey: queryKeys.contentSubmissions(classId),
        queryFn: () => api.getClassContentSubmissions(classId),
        enabled: !!classId,
      }),

    classDependencies: (classId: string) =>
      queryOptions({
        queryKey: queryKeys.dependencies(classId),
        queryFn: () => api.getClassDependencies(classId),
        enabled: !!classId,
      }),

    classes: (params: ClassesParams) =>
      queryOptions({
        queryKey: queryKeys.classes(params as Record<string, unknown>),
        queryFn: () => api.getClasses(params),
      }),

    classesInfinite: (params: Omit<ClassesParams, 'page'>) =>
      infiniteQueryOptions({
        queryKey: queryKeys.classes({ ...params, infinite: true } as Record<string, unknown>),
        queryFn: ({ pageParam }: { pageParam: number }) => api.getClasses({ ...params, page: pageParam, limit: params.limit ?? 20 }),
        initialPageParam: 1,
        getNextPageParam: (lastPage: ClassesResponse) => {
          if (!lastPage.meta) return undefined
          const { currentPage, totalPages } = lastPage.meta
          return currentPage < totalPages ? currentPage + 1 : undefined
        },
      }),

    questions: (subjectNumber: string) =>
      queryOptions({
        queryKey: queryKeys.questions(subjectNumber),
        queryFn: () => api.getQuestions(subjectNumber),
        enabled: !!subjectNumber,
      }),

    reviewsBySubject: (subjectNumber: string) =>
      queryOptions({
        queryKey: queryKeys.reviewsBySubject(subjectNumber),
        queryFn: () => api.getReviewsBySubject(subjectNumber),
        enabled: !!subjectNumber,
      }),

    qaRecipientCount: (subjectNumber: string) =>
      queryOptions({
        queryKey: queryKeys.qaRecipientCount(subjectNumber),
        queryFn: () => api.getQaRecipientCount(subjectNumber),
        enabled: !!subjectNumber,
      }),

    referralKerb: (kerb: string) =>
      queryOptions({
        queryKey: queryKeys.referralKerb(kerb),
        queryFn: () => api.verifyReferralKerb(kerb),
        enabled: kerb.length > 0,
      }),
  }
}

export type OpenGradesQueries = ReturnType<typeof createOpenGradesQueries>
