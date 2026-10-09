import { useMemo } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { getErrorMessage } from '../../api/client'
import {
  CURRENCIES,
  PAYMENT_METHODS,
  SHORTFALL_WRITE_OFF_REASONS,
  type CreatePaymentPayload,
  type InvoiceDetail,
} from '../../types/invoice'
import { formatMoney, paymentMethodLabel, todayIso, writeOffReasonLabel } from '../../utils/format'

interface Props {
  invoice: InvoiceDetail
  open: boolean
  isSaving: boolean
  /** Error from the last save attempt; the parent clears it on close */
  error: unknown
  onClose: () => void
  onSubmit: (payload: CreatePaymentPayload) => void
}

const toNumber = (value: string | undefined) => (value && value.trim() !== '' ? Number(value) : NaN)
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const hasAtMostDecimals = (value: number, places: number) => {
  const factor = 10 ** places
  return Math.abs(Math.round(value * factor) - value * factor) < 1e-6
}

/** Same arithmetic as the server: received x rate (to cents) + tax withheld */
function settlement(values: FormInput, invoiceCurrency: string) {
  const received = toNumber(values.amountReceived)
  const rate = values.currency === invoiceCurrency ? 1 : toNumber(values.exchangeRate)
  const tax = values.taxDeducted === 'yes' ? toNumber(values.taxWithheld) : 0
  const converted = cents(received * rate)
  return { received, rate, tax, converted, settled: cents(converted + (Number.isNaN(tax) ? 0 : tax)) }
}

// Numbers are kept as text in the form and checked here, because which fields
// apply depends on other answers (exchange rate only for foreign currency, etc.)
const schemaFor = (invoice: InvoiceDetail) =>
  z
    .object({
      method: z.enum(PAYMENT_METHODS),
      currency: z.enum(CURRENCIES),
      exchangeRate: z.string(),
      amountReceived: z.string(),
      taxDeducted: z.enum(['no', 'yes']),
      taxWithheld: z.string(),
      paidAt: z
        .string()
        .min(1, 'Payment date is required')
        .refine((v) => v >= invoice.invoiceDate, 'Payment date cannot be before the invoice date'),
      note: z.string().trim().max(500),
      writeOffRest: z.boolean(),
      writeOffReason: z.union([z.enum(SHORTFALL_WRITE_OFF_REASONS), z.literal('')]),
      writeOffNote: z.string().trim().max(500),
    })
    .superRefine((values, ctx) => {
      const { received, rate, tax, settled } = settlement(values, invoice.currency)
      const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

      if (!(received > 0)) issue('amountReceived', 'Amount received must be greater than 0')
      else if (!hasAtMostDecimals(received, 2)) issue('amountReceived', 'Use at most 2 decimal places')

      if (values.currency !== invoice.currency) {
        if (!(rate > 0)) issue('exchangeRate', 'Enter the exchange rate')
        else if (!hasAtMostDecimals(rate, 6)) issue('exchangeRate', 'Use at most 6 decimal places')
      }

      if (values.taxDeducted === 'yes') {
        if (!(tax > 0)) issue('taxWithheld', 'Enter the tax withheld, or choose No')
        else if (!hasAtMostDecimals(tax, 2)) issue('taxWithheld', 'Use at most 2 decimal places')
      }

      if (settled > invoice.balanceAmount + 1e-9) {
        issue(
          'amountReceived',
          `This settles ${formatMoney(settled, invoice.currency)}, more than the balance (${formatMoney(invoice.balanceAmount, invoice.currency)})`,
        )
      }

      if (values.writeOffRest && cents(invoice.balanceAmount - settled) > 0) {
        if (!values.writeOffReason) issue('writeOffReason', 'Choose why the difference is written off')
        else if (values.writeOffReason === 'Other' && !values.writeOffNote) {
          issue('writeOffNote', 'Say what the difference is')
        }
      }
    })

type FormInput = z.input<ReturnType<typeof schemaFor>>
type FormValues = z.output<ReturnType<typeof schemaFor>>

const defaultsFor = (invoice: InvoiceDetail): FormInput => ({
  method: 'BankTransfer',
  currency: invoice.currency as FormInput['currency'],
  exchangeRate: '',
  amountReceived: invoice.balanceAmount.toFixed(2),
  taxDeducted: 'no',
  taxWithheld: '',
  paidAt: todayIso(),
  note: '',
  writeOffRest: false,
  writeOffReason: '',
  writeOffNote: '',
})

export function RecordPaymentDialog({ invoice, open, isSaving, error, onClose, onSubmit }: Props) {
  const schema = useMemo(() => schemaFor(invoice), [invoice])
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(invoice),
  })

  const values = useWatch({ control }) as FormInput
  const foreign = values.currency !== invoice.currency
  const taxDeducted = values.taxDeducted === 'yes'
  const { converted, settled, rate, tax } = settlement(values, invoice.currency)
  const remaining = cents(invoice.balanceAmount - settled)
  // a short payment can close the invoice by writing off the small difference
  const canWriteOff = settled > 0 && remaining > 0
  const writingOff = canWriteOff && values.writeOffRest
  const balanceAfter = writingOff ? 0 : remaining
  const money = (amount: number) => formatMoney(amount, invoice.currency)
  const fill = { shouldValidate: true } as const

  // Withholding tax is usually a % of the invoice before tax
  const setTaxPercent = (percent: string) => {
    const p = Number(percent)
    if (percent.trim() !== '' && p >= 0) {
      setValue('taxWithheld', cents((invoice.invoiceSubTotal * p) / 100).toFixed(2), fill)
    }
  }

  // Amount still to receive (in the payment currency) after any tax withheld
  const fillRest = () => {
    const remaining = invoice.balanceAmount - (taxDeducted && tax > 0 ? tax : 0)
    if (remaining > 0 && rate > 0) setValue('amountReceived', cents(remaining / rate).toFixed(2), fill)
  }

  const handleClose = () => {
    if (isSaving) return
    reset(defaultsFor(invoice))
    onClose()
  }

  const submit = (v: FormValues) => {
    const amountReceived = Number(v.amountReceived)
    const writeOff = v.writeOffRest && cents(invoice.balanceAmount - settlement(v, invoice.currency).settled) > 0
    onSubmit({
      method: v.method,
      amountReceived,
      currency: v.currency,
      exchangeRate: v.currency === invoice.currency ? undefined : Number(v.exchangeRate),
      taxWithheld: v.taxDeducted === 'yes' ? Number(v.taxWithheld) : 0,
      paidAt: v.paidAt,
      note: v.note || undefined,
      ...(writeOff && {
        writeOffRest: true,
        writeOffReason: v.writeOffReason || undefined,
        writeOffNote: v.writeOffNote || undefined,
      }),
    })
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <form noValidate onSubmit={handleSubmit(submit)}>
        <DialogTitle>Record payment</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Balance due: <strong>{money(invoice.balanceAmount)}</strong>
            </Typography>

            {error ? <Alert severity="error">{getErrorMessage(error)}</Alert> : null}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="method"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Payment mode" required fullWidth>
                      {PAYMENT_METHODS.map((method) => (
                        <MenuItem key={method} value={method}>
                          {paymentMethodLabel(method)}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Payment date"
                  type="date"
                  required
                  fullWidth
                  {...register('paidAt')}
                  error={!!errors.paidAt}
                  helperText={errors.paidAt?.message}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: invoice.invoiceDate } }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: foreign ? 4 : 6 }}>
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Received in"
                      fullWidth
                      helperText={foreign ? `Invoice is in ${invoice.currency}` : ' '}
                    >
                      {CURRENCIES.map((code) => (
                        <MenuItem key={code} value={code}>
                          {code}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>
              {foreign && (
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Exchange rate"
                    type="number"
                    required
                    fullWidth
                    {...register('exchangeRate')}
                    error={!!errors.exchangeRate}
                    helperText={errors.exchangeRate?.message ?? `1 ${values.currency} = ? ${invoice.currency}`}
                    slotProps={{ htmlInput: { min: 0, step: '0.000001' } }}
                  />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: foreign ? 4 : 6 }}>
                <TextField
                  label="Amount received"
                  type="number"
                  required
                  fullWidth
                  {...register('amountReceived')}
                  error={!!errors.amountReceived}
                  helperText={errors.amountReceived?.message ?? ' '}
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position="start">{values.currency}</InputAdornment>,
                    },
                    htmlInput: { min: 0, step: '0.01' },
                  }}
                />
              </Grid>
            </Grid>

            <Controller
              name="taxDeducted"
              control={control}
              render={({ field }) => (
                <FormControl>
                  <FormLabel id="tax-deducted-label" sx={{ fontSize: '0.875rem' }}>
                    Did the customer deduct tax (TDS / withholding tax)?
                  </FormLabel>
                  <RadioGroup {...field} row aria-labelledby="tax-deducted-label">
                    <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                    <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                  </RadioGroup>
                </FormControl>
              )}
            />

            {taxDeducted && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 5 }}>
                  <TextField
                    label="Tax rate"
                    type="number"
                    fullWidth
                    onChange={(e) => setTaxPercent(e.target.value)}
                    helperText={`% of subtotal ${money(invoice.invoiceSubTotal)}`}
                    slotProps={{
                      input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                      htmlInput: { min: 0, max: 100, step: '0.01', 'aria-label': 'Tax rate (%)' },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 7 }}>
                  <TextField
                    label="Tax withheld"
                    type="number"
                    required
                    fullWidth
                    {...register('taxWithheld')}
                    error={!!errors.taxWithheld}
                    helperText={errors.taxWithheld?.message ?? 'Counts towards the invoice; the customer pays it to the tax office'}
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">{invoice.currency}</InputAdornment>,
                      },
                      htmlInput: { min: 0, step: '0.01' },
                    }}
                  />
                </Grid>
              </Grid>
            )}

            {/* What this payment does to the invoice, in the invoice currency */}
            <Box
              aria-label="Payment summary"
              role="region"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, bgcolor: 'action.hover' }}
            >
              <Stack spacing={0.5}>
                <SummaryLine
                  label="Received"
                  value={
                    Number.isNaN(converted)
                      ? '—'
                      : foreign
                        ? `${formatMoney(Number(values.amountReceived) || 0, values.currency)} × ${rate || '?'} = ${money(converted)}`
                        : money(converted)
                  }
                />
                {taxDeducted && <SummaryLine label="Tax withheld" value={Number.isNaN(tax) ? '—' : money(tax)} />}
                <Divider sx={{ my: 0.5 }} />
                <SummaryLine label="Settles" value={Number.isNaN(settled) ? '—' : money(settled)} strong />
                {writingOff && <SummaryLine label="Written off" value={money(remaining)} />}
                <SummaryLine
                  label="Balance after"
                  value={Number.isNaN(balanceAfter) ? '—' : balanceAfter === 0 ? `${money(0)} · marks the invoice Paid` : money(balanceAfter)}
                />
              </Stack>
              <Button size="small" onClick={fillRest} sx={{ mt: 1, ml: -0.5 }}>
                Receive the rest of the balance
              </Button>
            </Box>

            {canWriteOff && (
              <Box>
                <Controller
                  name="writeOffRest"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      }
                      label={`Write off the remaining ${money(remaining)} and mark the invoice Paid`}
                    />
                  )}
                />
                <Typography variant="caption" color="text.secondary" component="p" sx={{ ml: 4, mt: -0.5 }}>
                  For a small difference that won't be collected: bank charges, rounding, a settlement discount.
                </Typography>
              </Box>
            )}

            {writingOff && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 5 }}>
                  <Controller
                    name="writeOffReason"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        select
                        label="Write-off reason"
                        required
                        fullWidth
                        error={!!errors.writeOffReason}
                        helperText={errors.writeOffReason?.message}
                      >
                        {SHORTFALL_WRITE_OFF_REASONS.map((reason) => (
                          <MenuItem key={reason} value={reason}>
                            {writeOffReasonLabel(reason)}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 7 }}>
                  <TextField
                    label="Write-off note"
                    placeholder="e.g. Intermediary bank fee"
                    fullWidth
                    required={values.writeOffReason === 'Other'}
                    {...register('writeOffNote')}
                    error={!!errors.writeOffNote}
                    helperText={errors.writeOffNote?.message}
                  />
                </Grid>
              </Grid>
            )}

            <TextField
              label="Note"
              placeholder="e.g. Remittance reference"
              {...register('note')}
              error={!!errors.note}
              helperText={errors.note?.message}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSaving}>
            Save payment
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function SummaryLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: strong ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 400, textAlign: 'right' }}>
        {value}
      </Typography>
    </Stack>
  )
}
