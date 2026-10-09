import { useState } from 'react'
import { Autocomplete, Box, TextField, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { Controller, type Control } from 'react-hook-form'
import { fetchCustomers } from '../../api/invoices'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { CustomerSuggestion } from '../../types/invoice'
import type { InvoiceFormInput, InvoiceFormValues } from './invoice-form-schema'

interface Props {
  control: Control<InvoiceFormInput, unknown, InvoiceFormValues>
  error?: string
  /** Called when a previous customer is picked, to fill the other fields */
  onPick: (customer: CustomerSuggestion) => void
}

/**
 * Customer name with suggestions from previous invoices. Free text still works
 * for new customers.
 */
export function CustomerNameField({ control, error, onPick }: Props) {
  const [typed, setTyped] = useState('')
  const term = useDebouncedValue(typed.trim(), 250)

  const { data: options = [], isFetching } = useQuery({
    queryKey: ['customers', term],
    queryFn: () => fetchCustomers(term),
    enabled: term.length >= 2,
    staleTime: 60_000,
  })

  return (
    <Controller
      name="customer.fullname"
      control={control}
      render={({ field }) => (
        <Autocomplete<CustomerSuggestion, false, false, true>
          freeSolo
          options={term.length >= 2 ? options : []}
          // the API already filters by name/email
          filterOptions={(list) => list}
          getOptionLabel={(option) => (typeof option === 'string' ? option : option.fullname)}
          inputValue={field.value ?? ''}
          onInputChange={(_, value, reason) => {
            field.onChange(value)
            if (reason === 'input') setTyped(value)
          }}
          onChange={(_, value) => {
            if (value && typeof value !== 'string') onPick(value)
          }}
          loading={isFetching}
          renderOption={(props, option) => {
            const { key, ...rest } = props as typeof props & { key: string }
            return (
              <Box component="li" key={key + option.email} {...rest}>
                <div>
                  <Typography variant="body2">{option.fullname}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.email}
                  </Typography>
                </div>
              </Box>
            )
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Customer name"
              required
              inputRef={field.ref}
              onBlur={field.onBlur}
              error={!!error}
              helperText={error ?? 'Type to reuse a previous customer'}
            />
          )}
        />
      )}
    />
  )
}
