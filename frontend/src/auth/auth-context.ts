import { createContext } from 'react'
import type { User } from '../api/auth'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  /** True while we check a stored token on first load */
  isRestoring: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthState | null>(null)
