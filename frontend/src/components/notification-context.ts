import { createContext } from 'react'
import type { AlertColor } from '@mui/material'

export type Notify = (message: string, severity?: AlertColor) => void

export const NotificationContext = createContext<Notify>(() => {})
