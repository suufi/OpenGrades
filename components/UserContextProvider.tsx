import { createContext, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { IUser } from '../types'

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
  const [userProfile, setUserProfile] = useState<IUser | Record<string, never>>({})
  const { status } = useSession()
  const value = {
    userProfile, setUserProfile
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    fetch('/api/me')
      .then(async (res) => {
        const body = await res.json()
        if (cancelled) return
        if (res.ok && body.data?.user) {
          setUserProfile(body.data.user)
        } else {
          console.error(body.message ?? 'Failed to load user profile')
        }
      })
      .catch((err) => {
        if (!cancelled) console.error(err)
      })
    return () => { cancelled = true }
  }, [status])

  return <UserContext.Provider value={value}> {children} </UserContext.Provider>
}
