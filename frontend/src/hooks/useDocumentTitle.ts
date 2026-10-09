import { useEffect } from 'react'

const APP_NAME = 'SimpleInvoice'

/**
 * "Invoices · SimpleInvoice" in the browser tab and history, and what screen
 * readers announce on navigation. Just the app name until there is a title.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])
}
