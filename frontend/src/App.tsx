import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'

// Pages behind the login are loaded on demand, so the login page (the only
// public one) doesn't download the list, forms, dialogs and import screens.
const InvoiceListPage = lazy(() => import('./pages/InvoiceListPage').then((m) => ({ default: m.InvoiceListPage })))
const InvoiceDetailPage = lazy(() =>
  import('./pages/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })),
)
const CreateInvoicePage = lazy(() =>
  import('./pages/CreateInvoicePage').then((m) => ({ default: m.CreateInvoicePage })),
)
const EditInvoicePage = lazy(() => import('./pages/EditInvoicePage').then((m) => ({ default: m.EditInvoicePage })))
const ImportInvoicesPage = lazy(() =>
  import('./pages/ImportInvoicesPage').then((m) => ({ default: m.ImportInvoicesPage })),
)

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/invoices" element={<InvoiceListPage />} />
          <Route path="/invoices/new" element={<CreateInvoicePage />} />
          <Route path="/invoices/import" element={<ImportInvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/invoices/:id/edit" element={<EditInvoicePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/invoices" replace />} />
    </Routes>
  )
}
