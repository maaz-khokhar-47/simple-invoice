import { Button } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { createInvoice } from '../api/invoices'
import { InvoiceForm } from '../components/invoices/InvoiceForm'
import type { InvoiceFormInput } from '../components/invoices/invoice-form-schema'
import { useNotify } from '../hooks/useNotify'
import type { CreateInvoicePayload } from '../types/invoice'
import { todayIso } from '../utils/format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const emptyInvoice = (): InvoiceFormInput => ({
  customer: { fullname: '', email: '', mobileNumber: '', address: '' },
  invoiceNumber: '',
  invoiceReference: '',
  invoiceDate: todayIso(),
  dueDate: '',
  currency: 'AUD',
  description: '',
  item: { name: '', quantity: 1, rate: '' },
  taxRate: 10,
  discount: 0,
})

export function CreateInvoicePage() {
  useDocumentTitle('New invoice')
  const navigate = useNavigate()
  const notify = useNotify()
  const queryClient = useQueryClient()

  const save = async (payload: CreateInvoicePayload) => {
    const invoice = await createInvoice(payload)
    await queryClient.invalidateQueries({ queryKey: ['invoices'] })
    notify(`Invoice ${invoice.invoiceNumber} created`)
    navigate('/invoices')
  }

  return (
    <>
      <Button component={RouterLink} to="/invoices" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        Back to invoices
      </Button>
      <InvoiceForm
        title="New invoice"
        subtitle="New invoices are saved as Draft."
        submitLabel="Create invoice"
        cancelTo="/invoices"
        defaultValues={emptyInvoice()}
        onSubmit={save}
      />
    </>
  )
}
