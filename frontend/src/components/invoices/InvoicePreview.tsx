import { Box, Divider, Paper, Stack, Typography } from '@mui/material'
import dayjs from 'dayjs'
import { useWatch, type Control } from 'react-hook-form'
import { formatMoney } from '../../utils/format'
import { StatusChip } from '../StatusChip'
import type { InvoiceFormInput, InvoiceFormValues } from './invoice-form-schema'

const toNumber = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const showDate = (value?: string) => (value && dayjs(value).isValid() ? dayjs(value).format('D MMM YYYY') : '—')

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Stack>
  )
}

/** What the invoice will look like, updated as the form is filled in. */
export function InvoicePreview({ control }: { control: Control<InvoiceFormInput, unknown, InvoiceFormValues> }) {
  // Only this panel re-renders while typing, not the whole form
  const values = useWatch({ control })
  const money = (amount: number) => formatMoney(amount, values.currency ?? 'AUD')

  const quantity = toNumber(values.item?.quantity)
  const rate = toNumber(values.item?.rate)
  const taxRate = toNumber(values.taxRate)
  const subTotal = quantity * rate
  const tax = (subTotal * taxRate) / 100
  const discount = toNumber(values.discount)
  const total = subTotal + tax - discount

  return (
    <Paper sx={{ p: 3, position: 'sticky', top: 88 }} aria-label="Invoice preview">
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Preview
          </Typography>
          {/* styled like a heading, but not one: the page already has the real title */}
          <Typography variant="h6" component="p" sx={{ wordBreak: 'break-word' }}>
            {values.invoiceNumber?.trim() || 'New invoice'}
          </Typography>
        </Box>
        <StatusChip status="Draft" />
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Bill to
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>{values.customer?.fullname?.trim() || '—'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, wordBreak: 'break-word' }}>
        {values.customer?.email || ' '}
      </Typography>

      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Row label="Invoice date" value={showDate(values.invoiceDate)} />
        <Row label="Due date" value={showDate(values.dueDate)} />
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 2, gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
            {values.item?.name?.trim() || 'Item'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {quantity} × {money(rate)}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {money(subTotal)}
        </Typography>
      </Stack>

      <Stack spacing={0.75}>
        <Row label="Subtotal" value={money(subTotal)} />
        <Row label={`Tax (${taxRate}%)`} value={money(tax)} />
        <Row label="Discount" value={discount > 0 ? `-${money(discount)}` : money(0)} />
        <Divider />
        <Box data-testid="preview-total">
          <Row label="Total" value={money(total)} strong />
        </Box>
      </Stack>

      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
        Final amounts are calculated by the server when you save.
      </Typography>
    </Paper>
  )
}
