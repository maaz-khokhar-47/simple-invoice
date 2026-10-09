import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchMe, login as loginRequest, type User } from '../api/auth'
import { setUnauthorizedHandler } from '../api/client'
import { AuthContext } from './auth-context'
import { tokenStorage } from './token-storage'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [hasToken, setHasToken] = useState(() => tokenStorage.get() !== null)
  const [isRestoring, setIsRestoring] = useState(hasToken)

  const logout = useCallback(() => {
    tokenStorage.clear()
    setUser(null)
    setHasToken(false)
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(undefined)
  }, [logout])

  // If a token survived a page refresh, make sure it's still good and load the user
  useEffect(() => {
    if (!isRestoring) return
    fetchMe()
      .then(setUser)
      .catch(logout)
      .finally(() => setIsRestoring(false))
  }, [isRestoring, logout])

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginRequest(email, password)
    tokenStorage.set(res.accessToken, res.expiresIn)
    setUser(res.user)
    setHasToken(true)
  }, [])

  const value = useMemo(
    () => ({ user, isAuthenticated: hasToken, isRestoring, login, logout }),
    [user, hasToken, isRestoring, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
