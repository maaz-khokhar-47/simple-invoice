import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material'
import type { ImportPreviewRow } from '../../types/invoice'
import { formatDate, formatMoney } from '../../utils/format'

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
        {value === undefined || value === null || value === '' ? '—' : value}
      </Typography>
    </Box>
  )
}

const showDate = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value)

/** Read-only look at one spreadsheet row: the invoice it will create, or what's wrong. */
export function ImportRowDialog({ row, onClose }: { row: ImportPreviewRow | null; onClose: () => void }) {
  if (!row) return null
  const { invoice, totals } = row
  const item = invoice.items?.[0]
  const money = (amount: number) => formatMoney(amount, invoice.currency ?? '')

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Row {row.rowNumber}
        {invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ''}
      </DialogTitle>
      <DialogContent>
        {row.valid ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            Ready to import as a Draft invoice.
          </Alert>
        ) : (
          <Alert severity="error" sx={{ mb: 2 }}>
            This row will be skipped. Fix it in the spreadsheet and upload again:
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {row.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </Box>
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Field label="Customer" value={invoice.customer?.fullname} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Field label="Email" value={invoice.customer?.email} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Field label="Invoice date" value={showDate(invoice.invoiceDate)} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Field label="Due date" value={showDate(invoice.dueDate)} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Field label="Currency" value={invoice.currency} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Field label="Reference" value={invoice.invoiceReference} />
          </Grid>
          <Grid size={12}>
            <Field label="Item" value={item ? `${item.name ?? '—'} · ${item.quantity ?? '?'} × ${item.rate ?? '?'}` : undefined} />
          </Grid>
        </Grid>

        {totals && (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={0.5} sx={{ maxWidth: 280, ml: 'auto' }}>
              {[
                ['Subtotal', money(totals.subTotal)],
                [`Tax (${invoice.taxRate ?? 10}%)`, money(totals.totalTax)],
                ['Discount', totals.totalDiscount > 0 ? `-${money(totals.totalDiscount)}` : money(0)],
              ].map(([label, value]) => (
                <Stack key={label} direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="body2">{value}</Typography>
                </Stack>
              ))}
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Total
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {money(totals.totalAmount)}
                </Typography>
              </Stack>
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
