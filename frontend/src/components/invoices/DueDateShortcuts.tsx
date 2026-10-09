import { Chip, Stack } from '@mui/material'
import dayjs from 'dayjs'
import { useWatch, type Control } from 'react-hook-form'
import type { InvoiceFormInput, InvoiceFormValues } from './invoice-form-schema'

const PAYMENT_TERMS = [7, 14, 30, 60]

interface Props {
  control: Control<InvoiceFormInput, unknown, InvoiceFormValues>
  onPick: (dueDate: string) => void
}

/** "Net 30" etc: sets the due date that many days after the invoice date. */
export function DueDateShortcuts({ control, onPick }: Props) {
  const [invoiceDate, dueDate] = useWatch({ control, name: ['invoiceDate', 'dueDate'] })
  const start = dayjs(invoiceDate)
  if (!invoiceDate || !start.isValid()) return null

  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }} aria-label="Payment terms">
      {PAYMENT_TERMS.map((days) => {
        const date = start.add(days, 'day').format('YYYY-MM-DD')
        const selected = date === dueDate
        return (
          <Chip
            key={days}
            label={`Net ${days}`}
            size="small"
            color={selected ? 'primary' : 'default'}
            variant={selected ? 'filled' : 'outlined'}
            onClick={() => onPick(date)}
            aria-pressed={selected}
          />
        )
      })}
    </Stack>
  )
}
