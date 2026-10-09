import { useState } from 'react'
import { Button, Stack } from '@mui/material'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import SendIcon from '@mui/icons-material/Send'
import PaymentsIcon from '@mui/icons-material/Payments'
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined'
import MoneyOffIcon from '@mui/icons-material/MoneyOff'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteInvoice,
  downloadInvoicePdf,
  recordPayment,
  updateInvoiceStatus,
  writeOffInvoice,
} from '../../api/invoices'
import { getErrorMessage, getErrorStatus } from '../../api/client'
import { useNotify } from '../../hooks/useNotify'
import type { CreatePaymentPayload, InvoiceDetail, WriteOffPayload } from '../../types/invoice'
import { ConfirmDialog } from '../ConfirmDialog'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { WriteOffDialog } from './WriteOffDialog'

/**
 * Next step for an invoice, based on its stored status (not the displayed one -
 * an Overdue invoice can be either a Draft or Pending underneath):
 *   Draft   -> "Mark as sent"   (becomes Pending), or edit / delete it
 *   Pending -> "Record payment" (becomes Paid once the balance is 0),
 *              or "Write off" the rest of the balance (becomes WrittenOff)
 *   Paid    -> download it as a PDF
 *   WrittenOff -> nothing left to do
 */
export function InvoiceActions({ invoice }: { invoice: InvoiceDetail }) {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const navigate = useNavigate()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [writeOffOpen, setWriteOffOpen] = useState(false)

  const onUpdated = (updated: InvoiceDetail) => {
    queryClient.setQueryData(['invoice', updated.invoiceId], updated)
    return queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  // 409 means the invoice changed under us (another tab, another user): reload it
  const onError = (err: unknown) => {
    notify(getErrorMessage(err), 'error')
    if (getErrorStatus(err) === 409) {
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoice.invoiceId] })
    }
  }

  const markAsSent = useMutation({
    mutationFn: () => updateInvoiceStatus(invoice.invoiceId, 'Pending'),
    onSuccess: async (updated) => {
      await onUpdated(updated)
      notify(`Invoice ${updated.invoiceNumber} marked as sent`)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: () => deleteInvoice(invoice.invoiceId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['invoice', invoice.invoiceId] })
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      notify(`Invoice ${invoice.invoiceNumber} deleted`)
      navigate('/invoices', { replace: true })
    },
    onError: (err) => {
      setDeleteOpen(false)
      onError(err)
    },
  })

  const payment = useMutation({
    mutationFn: (payload: CreatePaymentPayload) => recordPayment(invoice.invoiceId, payload),
    onSuccess: async (updated) => {
      await onUpdated(updated)
      setPaymentOpen(false)
      notify(updated.storedStatus === 'Paid' ? `Invoice ${updated.invoiceNumber} is now paid` : 'Payment recorded')
    },
    onError: (err) => {
      // Amount problems are shown inside the dialog; state problems close it
      if (getErrorStatus(err) === 409) {
        setPaymentOpen(false)
        onError(err)
      }
    },
  })

  const writeOff = useMutation({
    mutationFn: (payload: WriteOffPayload) => writeOffInvoice(invoice.invoiceId, payload),
    onSuccess: async (updated) => {
      await onUpdated(updated)
      setWriteOffOpen(false)
      notify(`Invoice ${updated.invoiceNumber} written off`)
    },
    onError: (err) => {
      if (getErrorStatus(err) === 409) {
        setWriteOffOpen(false)
        onError(err)
      }
    },
  })

  const pdf = useMutation({
    mutationFn: () => downloadInvoicePdf(invoice.invoiceId, invoice.invoiceNumber),
    onError: (err) => notify(getErrorMessage(err, 'Could not download the PDF'), 'error'),
  })

  if (invoice.storedStatus === 'WrittenOff') {
    return null
  }

  if (invoice.storedStatus === 'Paid') {
    return (
      <Button variant="outlined" startIcon={<PdfIcon />} loading={pdf.isPending} onClick={() => pdf.mutate()}>
        Download PDF
      </Button>
    )
  }

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {invoice.storedStatus === 'Draft' && (
        <>
          <Button
            variant="contained"
            startIcon={<SendIcon />}
            loading={markAsSent.isPending}
            onClick={() => markAsSent.mutate()}
          >
            Mark as sent
          </Button>
          <Button component={RouterLink} to={`/invoices/${invoice.invoiceId}/edit`} startIcon={<EditIcon />}>
            Edit
          </Button>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
          <ConfirmDialog
            open={deleteOpen}
            title={`Delete invoice ${invoice.invoiceNumber}?`}
            message="This draft will be removed permanently."
            confirmLabel="Delete"
            isWorking={remove.isPending}
            onConfirm={() => remove.mutate()}
            onCancel={() => setDeleteOpen(false)}
          />
        </>
      )}

      {invoice.storedStatus === 'Pending' && (
        <>
          <Button variant="contained" startIcon={<PaymentsIcon />} onClick={() => setPaymentOpen(true)}>
            Record payment
          </Button>
          <RecordPaymentDialog
            // remount on every open so the form starts from the current balance
            key={paymentOpen ? `open-${invoice.balanceAmount}` : 'closed'}
            invoice={invoice}
            open={paymentOpen}
            isSaving={payment.isPending}
            error={getErrorStatus(payment.error) === 409 ? null : payment.error}
            onClose={() => {
              setPaymentOpen(false)
              payment.reset()
            }}
            onSubmit={(values) => payment.mutate(values)}
          />
          <Button color="error" startIcon={<MoneyOffIcon />} onClick={() => setWriteOffOpen(true)}>
            Write off
          </Button>
          <WriteOffDialog
            key={writeOffOpen ? 'open' : 'closed'}
            invoice={invoice}
            open={writeOffOpen}
            isSaving={writeOff.isPending}
            error={getErrorStatus(writeOff.error) === 409 ? null : writeOff.error}
            onClose={() => {
              setWriteOffOpen(false)
              writeOff.reset()
            }}
            onSubmit={(values) => writeOff.mutate(values)}
          />
        </>
      )}
    </Stack>
  )
}
