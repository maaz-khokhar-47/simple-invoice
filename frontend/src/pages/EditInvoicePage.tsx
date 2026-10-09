import { Alert, Button } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { fetchInvoice, updateInvoice } from '../api/invoices'
import { getErrorMessage, getErrorStatus } from '../api/client'
import { InvoiceForm } from '../components/invoices/InvoiceForm'
import { PageSkeleton } from '../components/PageSkeleton'
import { toFormValues } from '../components/invoices/invoice-form-schema'
import { useNotify } from '../hooks/useNotify'
import type { CreateInvoicePayload } from '../types/invoice'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function EditInvoicePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const notify = useNotify()
  const queryClient = useQueryClient()

  const { data: invoice, isPending, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id),
    retry: (count, err) => getErrorStatus(err) !== 404 && getErrorStatus(err) !== 400 && count < 2,
  })
  useDocumentTitle(invoice ? `Edit ${invoice.invoiceNumber}` : 'Edit invoice')

  const backLink = (
    <Button component={RouterLink} to={`/invoices/${id}`} startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
      Back to invoice
    </Button>
  )

  if (isPending) {
    return (
      <PageSkeleton />
    )
  }

  if (error) {
    const notFound = [400, 404].includes(getErrorStatus(error) ?? 0)
    return (
      <>
        {backLink}
        <Alert severity={notFound ? 'warning' : 'error'}>
          {notFound ? 'This invoice does not exist.' : getErrorMessage(error)}
        </Alert>
      </>
    )
  }

  // Someone may open the edit URL directly for an invoice that has already been sent
  if (invoice.storedStatus !== 'Draft') {
    return (
      <>
        {backLink}
        <Alert severity="info">
          Invoice {invoice.invoiceNumber} has been sent ({invoice.storedStatus}), so it can no longer be edited.
        </Alert>
      </>
    )
  }

  const save = async (payload: CreateInvoicePayload) => {
    const updated = await updateInvoice(id, payload)
    queryClient.setQueryData(['invoice', id], updated)
    await queryClient.invalidateQueries({ queryKey: ['invoices'] })
    notify(`Invoice ${updated.invoiceNumber} updated`)
    navigate(`/invoices/${id}`)
  }

  return (
    <>
      {backLink}
      <InvoiceForm
        title={`Edit ${invoice.invoiceNumber}`}
        subtitle="Only Draft invoices can be edited. Totals are recalculated when you save."
        submitLabel="Save changes"
        cancelTo={`/invoices/${id}`}
        defaultValues={toFormValues(invoice)}
        onSubmit={save}
      />
    </>
  )
}
