import axios, { AxiosError } from 'axios'
import { tokenStorage } from '../auth/token-storage'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

api.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// AuthProvider registers this so a 401 anywhere logs the user out
let onUnauthorized: (() => void) | undefined
export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  onUnauthorized = handler
}

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const isLogin = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLogin) {
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)

interface ApiErrorBody {
  statusCode: number
  message: string | string[]
  error: string
}

/** Pulls a readable message out of an API error. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (message) return message
    if (!error.response) return 'Could not reach the server. Check your connection.'
  }
  return fallback
}

export function getErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}
