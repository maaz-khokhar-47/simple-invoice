import { Box, LinearProgress, Stack, Typography } from '@mui/material'
import type { InvoiceDetail } from '../../types/invoice'
import { formatMoney } from '../../utils/format'

/** "AUD 1,451.34 of AUD 2,180.00 paid" with a bar. Only shown once an invoice is sent. */
export function PaymentProgress({ invoice }: { invoice: InvoiceDetail }) {
  if (invoice.storedStatus === 'Draft' || invoice.totalAmount <= 0) {
    return null
  }

  const percent = Math.min(100, Math.round((invoice.totalPaid / invoice.totalAmount) * 100))
  const money = (amount: number) => formatMoney(amount, invoice.currency)
  const color =
    invoice.storedStatus === 'Paid'
      ? 'success'
      : invoice.storedStatus === 'WrittenOff'
        ? 'secondary'
        : invoice.status === 'Overdue'
          ? 'error'
          : 'primary'

  return (
    <Box sx={{ mt: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75 }}>
        <Typography variant="body2">
          <strong>{money(invoice.totalPaid)}</strong> of {money(invoice.totalAmount)} paid
          {invoice.totalWrittenOff > 0 && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}
              · {money(invoice.totalWrittenOff)} written off
            </Typography>
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {percent}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={percent}
        color={color}
        aria-label="Amount paid"
        sx={{ height: 8, borderRadius: 4 }}
      />
    </Box>
  )
}
