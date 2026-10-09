import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStorage } from '../auth/token-storage'
import { NotificationProvider } from '../components/NotificationProvider'
import { ColorModeProvider } from '../theme/ColorModeProvider'
import { App } from '../App'

/** Shows the current URL so tests can assert on navigation. */
function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

interface Options {
  route?: string
  loggedIn?: boolean
}

function providers(ui: ReactElement, route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return (
    <ColorModeProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <NotificationProvider>
            <AuthProvider>
              {ui}
              <LocationDisplay />
            </AuthProvider>
          </NotificationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ColorModeProvider>
  )
}

/** Renders the whole app (real routes + auth) at the given URL. */
export function renderApp({ route = '/', loggedIn = true }: Options = {}) {
  if (loggedIn) {
    tokenStorage.set('test-token', 3600)
  }
  return render(providers(<App />, route))
}
