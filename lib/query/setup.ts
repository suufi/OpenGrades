import {
  createApiClient,
  createOpenGradesApi,
  createOpenGradesQueries,
} from '@opengrades/api-client'

export const apiClient = createApiClient({
  baseUrl: '',
  credentials: 'include',
})

export const openGradesApi = createOpenGradesApi(apiClient)
export const openGradesQueries = createOpenGradesQueries(openGradesApi)
