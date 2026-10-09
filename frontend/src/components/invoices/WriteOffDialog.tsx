import { useMemo } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { getErrorMessage } from '../../api/client'
import { BALANCE_WRITE_OFF_REASONS, type InvoiceDetail, type WriteOffPayload } from '../../types/invoice'
import { formatMoney, todayIso, writeOffReasonLabel } from '../../utils/format'

interface Props {
  invoice: InvoiceDetail
  open: boolean
  isSaving: boolean
  /** Error from the last attempt; the parent clears it on close */
  error: unknown
  onClose: () => void
  onSubmit: (payload: WriteOffPayload) => void
}

const schemaFor = (invoice: InvoiceDetail) =>
  z
    .object({
      reason: z.enum(BALANCE_WRITE_OFF_REASONS),
      writtenOffAt: z
        .string()
        .min(1, 'Date is required')
        .refine((v) => v >= invoice.invoiceDate, 'Date cannot be before the invoice date'),
      note: z.string().trim().max(500),
    })
    .refine((v) => v.reason !== 'Other' || v.note.length > 0, {
      path: ['note'],
      message: 'Say why the balance is being written off',
    })

type FormInput = z.input<ReturnType<typeof schemaFor>>
type FormValues = z.output<ReturnType<typeof schemaFor>>

const defaults = (): FormInput => ({ reason: 'BadDebt', writtenOffAt: todayIso(), note: '' })

/**
 * Writes off the rest of the balance when it won't be collected (bad debt,
 * dispute). Whatever was already paid stays; the invoice is closed for good.
 */
export function WriteOffDialog({ invoice, open, isSaving, error, onClose, onSubmit }: Props) {
  const schema = useMemo(() => schemaFor(invoice), [invoice])
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  })
  const reason = useWatch({ control, name: 'reason' })
  const money = (amount: number) => formatMoney(amount, invoice.currency)

  const handleClose = () => {
    if (isSaving) return
    reset(defaults())
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <form
        noValidate
        onSubmit={handleSubmit((v) =>
          onSubmit({ reason: v.reason, writtenOffAt: v.writtenOffAt, note: v.note || undefined }),
        )}
      >
        <DialogTitle>Write off balance</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The remaining <strong>{money(invoice.balanceAmount)}</strong> on invoice {invoice.invoiceNumber} will not
              be collected.
              {invoice.totalPaid > 0 && ` The ${money(invoice.totalPaid)} already received stays recorded.`}
            </Typography>

            {error ? <Alert severity="error">{getErrorMessage(error)}</Alert> : null}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller
                name="reason"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Reason" required fullWidth>
                    {BALANCE_WRITE_OFF_REASONS.map((value) => (
                      <MenuItem key={value} value={value}>
                        {writeOffReasonLabel(value)}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <TextField
                label="Write-off date"
                type="date"
                required
                fullWidth
                {...register('writtenOffAt')}
                error={!!errors.writtenOffAt}
                helperText={errors.writtenOffAt?.message}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: invoice.invoiceDate } }}
              />
            </Stack>

            <TextField
              label="Note"
              placeholder="e.g. Customer went into liquidation"
              multiline
              minRows={2}
              required={reason === 'Other'}
              {...register('note')}
              error={!!errors.note}
              helperText={errors.note?.message}
            />

            <Alert severity="warning">
              The invoice will be closed as <strong>Written off</strong>. No more payments can be recorded on it, and
              this can't be undone.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="error" loading={isSaving}>
            Write off {money(invoice.balanceAmount)}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
