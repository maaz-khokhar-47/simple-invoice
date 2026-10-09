import type { ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { fetchInvoice } from '../api/invoices'
import { getErrorMessage, getErrorStatus } from '../api/client'
import { PageSkeleton } from '../components/PageSkeleton'
import { StatusChip } from '../components/StatusChip'
import { InvoiceActions } from '../components/invoices/InvoiceActions'
import { ActivityTimeline } from '../components/invoices/ActivityTimeline'
import { PaymentHistory } from '../components/invoices/PaymentHistory'
import { PaymentProgress } from '../components/invoices/PaymentProgress'
import { formatDate, formatMoney } from '../utils/format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography component="div">{children || '—'}</Typography>
    </Box>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <Typography color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: strong ? 600 : 400 }}>{value}</Typography>
    </Stack>
  )
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const { data: invoice, isPending, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id),
    retry: (count, err) => getErrorStatus(err) !== 404 && getErrorStatus(err) !== 400 && count < 2,
  })
  useDocumentTitle(invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice')

  const backLink = (
    <Button component={RouterLink} to="/invoices" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
      Back to invoices
    </Button>
  )

  if (isPending) {
    return (
      <>
        {backLink}
        <PageSkeleton />
      </>
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

  const money = (amount: number) => formatMoney(amount, invoice.currency)

  return (
    <>
      {backLink}

      <Paper sx={{ p: { xs: 2, md: 4 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              Invoice
            </Typography>
            <Typography variant="h5" component="h1">
              {invoice.invoiceNumber}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <StatusChip status={invoice.status} size="medium" />
            <InvoiceActions invoice={invoice} />
          </Stack>
        </Stack>

        <PaymentProgress invoice={invoice} />

        <Divider sx={{ my: 3 }} />

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Invoice details
            </Typography>
            <Grid container spacing={2}>
              <Grid size={6}>
                <Field label="Invoice date">{formatDate(invoice.invoiceDate)}</Field>
              </Grid>
              <Grid size={6}>
                <Field label="Due date">{formatDate(invoice.dueDate)}</Field>
              </Grid>
              <Grid size={6}>
                <Field label="Reference">{invoice.invoiceReference}</Field>
              </Grid>
              <Grid size={6}>
                <Field label="Currency">{invoice.currency}</Field>
              </Grid>
              <Grid size={12}>
                <Field label="Description">{invoice.description}</Field>
              </Grid>
            </Grid>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Bill to
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Field label="Name">{invoice.customer.fullname}</Field>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Field label="Email">{invoice.customer.email}</Field>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Field label="Mobile">{invoice.customer.mobileNumber}</Field>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Field label="Address">{invoice.customer.address}</Field>
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        <TableContainer sx={{ mt: 4 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell align="right">{money(item.rate)}</TableCell>
                  <TableCell align="right">{money(item.quantity * item.rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack spacing={1} sx={{ mt: 3, ml: 'auto', maxWidth: 360 }}>
          <SummaryRow label="Subtotal" value={money(invoice.invoiceSubTotal)} />
          <SummaryRow label={`Tax (${invoice.taxRate}%)`} value={money(invoice.totalTax)} />
          <SummaryRow
            label="Discount"
            value={invoice.totalDiscount > 0 ? `-${money(invoice.totalDiscount)}` : money(0)}
          />
          <Divider />
          <SummaryRow label="Total" value={money(invoice.totalAmount)} strong />
          <SummaryRow label="Paid" value={money(invoice.totalPaid)} />
          {invoice.totalWrittenOff > 0 && <SummaryRow label="Written off" value={money(invoice.totalWrittenOff)} />}
          <SummaryRow label="Balance due" value={money(invoice.balanceAmount)} strong />
        </Stack>

        <PaymentHistory payments={invoice.payments} writeOffs={invoice.writeOffs} currency={invoice.currency} />
        <ActivityTimeline invoice={invoice} />
      </Paper>
    </>
  )
}
