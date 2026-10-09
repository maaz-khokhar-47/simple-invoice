import { useCallback, useState, type ReactNode } from 'react'
import { Alert, Snackbar, type AlertColor } from '@mui/material'
import { NotificationContext, type Notify } from './notification-context'

interface Notification {
  key: number
  message: string
  severity: AlertColor
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Notification | null>(null)

  const notify = useCallback<Notify>((message, severity = 'success') => {
    setCurrent({ key: Date.now(), message, severity })
  }, [])

  const close = () => setCurrent(null)

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <Snackbar
        key={current?.key}
        open={current !== null}
        autoHideDuration={4000}
        onClose={(_, reason) => reason !== 'clickaway' && close()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {current ? (
          <Alert onClose={close} severity={current.severity} variant="filled" sx={{ width: '100%' }}>
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  )
}
