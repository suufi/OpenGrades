import { showNotification } from '@mantine/notifications'
import { createContext, useEffect, useState } from 'react'
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
  const [userProfile, setUserProfile] = useState({})
  const value = {
    userProfile, setUserProfile
  }

  useEffect(() => {
    (async () => {
      await fetch('/api/me').then(async (res) => {
        const body = await res.json()
        if (res.ok) {
          // showNotification({
          //   title: 'User Profile',
          //   message: JSON.stringify(body.data.user)
          // })
          setUserProfile(body.data.user)
        } else {
          showNotification({
            color: 'red',
            title: 'Error',
            message: body.message
          })
        }
      })
    })()
  }, [])

  return <UserContext.Provider value={value}> {children} </UserContext.Provider>
}
