import { createContext, useCallback, useContext } from 'react'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@opengrades/api-client'
import { IUser } from '../types'
import { useMe } from '@/lib/query'

interface IUserContext {
  userProfile: IUser | Record<string, never>
  setUserProfile: React.Dispatch<React.SetStateAction<IUser | Record<string, never>>>
}

export const UserContext = createContext<IUserContext>({
  userProfile: {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setUserProfile: () => { }
})

export function UserContextProvider ({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const queryClient = useQueryClient()
  const { data: meData } = useMe(status === 'authenticated')

  const userProfile = (meData ?? {}) as IUser | Record<string, never>

  const setUserProfile = useCallback<React.Dispatch<React.SetStateAction<IUser | Record<string, never>>>>((updater) => {
    queryClient.setQueryData(queryKeys.me, (old: IUser | undefined) => {
      const current = (old ?? {}) as IUser | Record<string, never>
      return typeof updater === 'function' ? updater(current) : updater
    })
  }, [queryClient])

  return (
    <UserContext.Provider value={{ userProfile, setUserProfile }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUserContext() {
  return useContext(UserContext)
}
