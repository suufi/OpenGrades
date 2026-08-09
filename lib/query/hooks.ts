import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  queryKeys,
  type ClassesParams,
  type GradeReportUploadResult,
  type OpenGradesUser,
} from '@opengrades/api-client'
import { openGradesApi, openGradesQueries } from './setup'

export { queryKeys, openGradesApi, openGradesQueries }

export function useMe(enabled = true) {
  return useQuery({ ...openGradesQueries.me(), enabled })
}

export function useSetMeCache() {
  const queryClient = useQueryClient()
  return (user: OpenGradesUser | Record<string, never>) => {
    if (!user || Object.keys(user).length === 0) {
      queryClient.removeQueries({ queryKey: queryKeys.me })
      return
    }
    queryClient.setQueryData(queryKeys.me, user)
  }
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => openGradesApi.updateMe(body),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me, user)
    },
  })
}

export function useUpdatePrivacy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => openGradesApi.updatePrivacy(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me })
    },
  })
}

export function useFavorites() {
  return useQuery(openGradesQueries.favorites())
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ subjectNumber, isFavorite }: { subjectNumber: string; isFavorite: boolean }) =>
      isFavorite ? openGradesApi.removeFavorite(subjectNumber) : openGradesApi.addFavorite(subjectNumber),
    onMutate: async ({ subjectNumber, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites })
      const previousFavorites = queryClient.getQueryData<string[]>(queryKeys.favorites) ?? []
      queryClient.setQueryData<string[]>(queryKeys.favorites, (old = []) =>
        isFavorite ? old.filter((id) => id !== subjectNumber) : [...old, subjectNumber]
      )
      return { previousFavorites }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(queryKeys.favorites, context.previousFavorites)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites })
      queryClient.invalidateQueries({ queryKey: ['classes'] })
    },
  })
}

export function useFilters() {
  return useQuery(openGradesQueries.filters())
}

export function useDiscover(enabled = true) {
  return useQuery({ ...openGradesQueries.discover(), enabled })
}

export function useRecommendations(limit = 5, enabled = true) {
  return useQuery({ ...openGradesQueries.recommendations(limit), enabled })
}

export function useUserClasses() {
  return useQuery(openGradesQueries.userClasses())
}

export function useUserReviews() {
  return useQuery(openGradesQueries.userReviews())
}

export function useClass(id: string) {
  return useQuery(openGradesQueries.class(id))
}

export function useAggregatedClass(subjectNumber: string) {
  return useQuery(openGradesQueries.classAggregate(subjectNumber))
}

export function useClassReviews(classId: string) {
  return useQuery(openGradesQueries.classReviews(classId))
}

export function useClassContentSubmissions(classId: string) {
  return useQuery(openGradesQueries.classContentSubmissions(classId))
}

export function useClassDependencies(classId: string) {
  return useQuery(openGradesQueries.classDependencies(classId))
}

export function useClasses(params: ClassesParams, enabled = true) {
  return useQuery({
    ...openGradesQueries.classes(params),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useClassesInfinite(params: Omit<ClassesParams, 'page'>) {
  return useInfiniteQuery(openGradesQueries.classesInfinite(params))
}

export function useQuestions(subjectNumber: string) {
  return useQuery(openGradesQueries.questions(subjectNumber))
}

export function useReviewsBySubject(subjectNumber: string, enabled = true) {
  return useQuery({ ...openGradesQueries.reviewsBySubject(subjectNumber), enabled })
}

export function useQaRecipientCount(subjectNumber: string, enabled = true) {
  return useQuery({ ...openGradesQueries.qaRecipientCount(subjectNumber), enabled })
}

export function useReferralKerb(kerb: string) {
  return useQuery(openGradesQueries.referralKerb(kerb))
}

export function useInvalidateMe() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.me })
}

export async function uploadGradeReportWeb(
  file: File,
  withPartialReviews = true
): Promise<GradeReportUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  return openGradesApi.uploadGradeReport(formData, withPartialReviews)
}

export async function saveGradeReportClassesWeb(result: GradeReportUploadResult) {
  return openGradesApi.saveGradeReportClasses(result)
}

export {
  type ClassesParams,
  type GradeReportUploadResult,
  type OpenGradesClass,
  type OpenGradesUser,
  type ClassReview,
  type ClassDependencyData,
  type ContentSubmissionData,
  type QaQuestion,
  type UserReview,
} from '@opengrades/api-client'
