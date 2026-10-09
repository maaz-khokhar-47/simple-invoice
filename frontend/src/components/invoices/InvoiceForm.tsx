import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Grid,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { Link as RouterLink } from 'react-router-dom'
import { getErrorMessage, getErrorStatus } from '../../api/client'
import { CURRENCIES, type CreateInvoicePayload } from '../../types/invoice'
import { CustomerNameField } from './CustomerNameField'
import { DueDateShortcuts } from './DueDateShortcuts'
import { InvoicePreview } from './InvoicePreview'
import {
  invoiceFormSchema,
  toCreatePayload,
  type InvoiceFormInput,
  type InvoiceFormValues,
} from './invoice-form-schema'

interface Props {
  title: string
  subtitle: string
  submitLabel: string
  cancelTo: string
  defaultValues: InvoiceFormInput
  /** Saves the invoice. Errors are caught here and shown on the form. */
  onSubmit: (payload: CreateInvoicePayload) => Promise<unknown>
}

/** Rough total shown while typing. The saved amounts always come from the API. */
function estimateTotal(item: { quantity?: unknown; rate?: unknown }, taxRate: unknown, discount: unknown) {
  const subTotal = Number(item.quantity) * Number(item.rate)
  const total = subTotal * (1 + Number(taxRate) / 100) - Number(discount)
  return Number.isFinite(total) ? total : null
}

type FormControl = Control<InvoiceFormInput, unknown, InvoiceFormValues>

/**
 * Subscribes to just the fields it needs, so typing elsewhere in the form
 * doesn't re-render it (and typing here doesn't re-render the whole form).
 */
function EstimatedTotal({ control }: { control: FormControl }) {
  const [item, taxRate, discount] = useWatch({ control, name: ['item', 'taxRate', 'discount'] })
  const estimate = estimateTotal(item, taxRate, discount)
  return (
    <Typography variant="h6" data-testid="estimated-total">
      {estimate === null ? '—' : estimate.toFixed(2)}
    </Typography>
  )
}

/**
 * Controlled text field for values that get filled in programmatically (from
 * the customer autocomplete). With a plain register() MUI never hears about
 * those changes, so the label would stay inside the box on top of the text.
 */
function ControlledTextField({
  control,
  name,
  label,
  type,
  required,
  error,
}: {
  control: FormControl
  name: 'customer.email' | 'customer.mobileNumber' | 'customer.address'
  label: string
  type?: string
  required?: boolean
  error?: string
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, value, ...field } }) => (
        <TextField
          {...field}
          value={value ?? ''}
          inputRef={ref}
          label={label}
          type={type}
          required={required}
          fullWidth
          error={!!error}
          helperText={error}
        />
      )}
    />
  )
}

/** Shared by the create and edit pages. */
export function InvoiceForm({ title, subtitle, submitLabel, cancelTo, defaultValues, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormInput, unknown, InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues,
  })

  const fill = { shouldDirty: true, shouldValidate: true } as const

  const submit = async (values: InvoiceFormValues) => {
    setServerError(null)
    try {
      await onSubmit(toCreatePayload(values))
    } catch (err) {
      if (getErrorStatus(err) === 409 && getErrorMessage(err).includes('already exists')) {
        setError('invoiceNumber', { message: 'This invoice number is already in use' })
        return
      }
      setServerError(getErrorMessage(err, 'Could not save the invoice'))
    }
  }

  return (
    <Grid container spacing={3} sx={{ alignItems: 'flex-start' }}>
      <Grid size={{ xs: 12, lg: 8 }}>
        <Paper component="form" noValidate onSubmit={handleSubmit(submit)} sx={{ p: { xs: 2, md: 4 } }}>
          <Typography variant="h5" component="h1" gutterBottom>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>

          {serverError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {serverError}
            </Alert>
          )}

          <Stack spacing={4}>
            <section>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                Customer
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <CustomerNameField
                    control={control}
                    error={errors.customer?.fullname?.message}
                    onPick={(customer) => {
                      setValue('customer.fullname', customer.fullname, fill)
                      setValue('customer.email', customer.email, fill)
                      setValue('customer.mobileNumber', customer.mobileNumber ?? '', fill)
                      setValue('customer.address', customer.address ?? '', fill)
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <ControlledTextField
                    control={control}
                    name="customer.email"
                    label="Customer email"
                    type="email"
                    required
                    error={errors.customer?.email?.message}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <ControlledTextField
                    control={control}
                    name="customer.mobileNumber"
                    label="Mobile"
                    type="tel"
                    error={errors.customer?.mobileNumber?.message}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <ControlledTextField
                    control={control}
                    name="customer.address"
                    label="Address"
                    error={errors.customer?.address?.message}
                  />
                </Grid>
              </Grid>
            </section>

            <section>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                Invoice
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField
                    label="Invoice number"
                    required
                    fullWidth
                    {...register('invoiceNumber')}
                    error={!!errors.invoiceNumber}
                    helperText={errors.invoiceNumber?.message}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField label="Reference" fullWidth {...register('invoiceReference')} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField
                    select
                    label="Currency"
                    required
                    fullWidth
                    defaultValue={defaultValues.currency}
                    {...register('currency')}
                    error={!!errors.currency}
                    helperText={errors.currency?.message}
                  >
                    {CURRENCIES.map((code) => (
                      <MenuItem key={code} value={code}>
                        {code}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField
                    label="Invoice date"
                    type="date"
                    required
                    fullWidth
                    {...register('invoiceDate')}
                    error={!!errors.invoiceDate}
                    helperText={errors.invoiceDate?.message}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField
                    label="Due date"
                    type="date"
                    required
                    fullWidth
                    {...register('dueDate')}
                    error={!!errors.dueDate}
                    helperText={errors.dueDate?.message}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <DueDateShortcuts
                    control={control}
                    onPick={(date) => setValue('dueDate', date, fill)}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField label="Description" fullWidth multiline minRows={2} {...register('description')} />
                </Grid>
              </Grid>
            </section>

            <section>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                Item
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Item name"
                    required
                    fullWidth
                    {...register('item.name')}
                    error={!!errors.item?.name}
                    helperText={errors.item?.name?.message}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    label="Quantity"
                    type="number"
                    required
                    fullWidth
                    {...register('item.quantity')}
                    error={!!errors.item?.quantity}
                    helperText={errors.item?.quantity?.message}
                    slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    label="Rate"
                    type="number"
                    required
                    fullWidth
                    {...register('item.rate')}
                    error={!!errors.item?.rate}
                    helperText={errors.item?.rate?.message}
                    slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    label="Tax"
                    type="number"
                    fullWidth
                    {...register('taxRate')}
                    error={!!errors.taxRate}
                    helperText={errors.taxRate?.message}
                    slotProps={{
                      input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                      htmlInput: { min: 0, max: 100, step: '0.01' },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    label="Discount"
                    type="number"
                    fullWidth
                    {...register('discount')}
                    error={!!errors.discount}
                    helperText={errors.discount?.message}
                    slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                  />
                </Grid>
              </Grid>
            </section>
          </Stack>

          <Stack
            direction={{ xs: 'column-reverse', sm: 'row' }}
            spacing={2}
            sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, mt: 4 }}
          >
            <Box sx={{ display: { lg: 'none' } }}>
              <Typography variant="body2" color="text.secondary">
                Estimated total
              </Typography>
              <EstimatedTotal control={control} />
            </Box>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
              <Button component={RouterLink} to={cancelTo} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" loading={isSubmitting}>
                {submitLabel}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Grid>
      <Grid size={{ lg: 4 }} sx={{ display: { xs: 'none', lg: 'block' } }}>
        <InvoicePreview control={control} />
      </Grid>
    </Grid>
  )
}
