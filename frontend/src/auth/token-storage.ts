const KEY = 'simple-invoice.session'

interface StoredSession {
  token: string
  expiresAt: number
}

// The token lives in localStorage so a refresh doesn't log you out.
// Trade-offs vs. an httpOnly cookie are covered in the README.
export const tokenStorage = {
  get(): string | null {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null

    try {
      const session = JSON.parse(raw) as StoredSession
      if (Date.now() >= session.expiresAt) {
        localStorage.removeItem(KEY)
        return null
      }
      return session.token
    } catch {
      localStorage.removeItem(KEY)
      return null
    }
  },

  set(token: string, expiresInSeconds: number) {
    const session: StoredSession = {
      token,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    }
    localStorage.setItem(KEY, JSON.stringify(session))
  },

  clear() {
    localStorage.removeItem(KEY)
  },
}
