import { useContext } from 'react'
import { NotificationContext } from '../components/notification-context'

export function useNotify() {
  return useContext(NotificationContext)
}
