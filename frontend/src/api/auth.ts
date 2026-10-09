import { api } from './client'

export interface User {
  id: string
  email: string
  fullname: string
}

export interface LoginResponse {
  accessToken: string
  expiresIn: number
  user: User
}

export async function login(email: string, password: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
  return data
}

export async function fetchMe() {
  const { data } = await api.get<User>('/auth/me')
  return data
}
