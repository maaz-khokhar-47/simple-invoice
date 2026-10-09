import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import { App } from './App'
import { AuthProvider } from './auth/AuthProvider'
import { NotificationProvider } from './components/NotificationProvider'
import { ColorModeProvider } from './theme/ColorModeProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorModeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <NotificationProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </NotificationProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ColorModeProvider>
  </StrictMode>,
)
