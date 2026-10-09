import { Chip, type ChipProps } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { InvoiceStatus } from '../types/invoice'
import { statusLabel } from '../utils/format'

/** Soft tinted chip with a dot, readable in both light and dark mode. */
export function StatusChip({ status, size = 'small' }: { status: InvoiceStatus; size?: ChipProps['size'] }) {
  const { palette } = useTheme()
  const colors: Record<InvoiceStatus, string> = {
    Draft: palette.text.secondary,
    Pending: palette.warning.main,
    Paid: palette.success.main,
    Overdue: palette.error.main,
    WrittenOff: palette.mode === 'dark' ? '#b39ddb' : '#6d4c9f',
  }
  const color = colors[status]

  return (
    <Chip
      label={statusLabel(status)}
      size={size}
      sx={{
        fontWeight: 600,
        color,
        bgcolor: alpha(color, palette.mode === 'dark' ? 0.18 : 0.1),
        '&::before': {
          content: '""',
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: color,
          ml: 1.25,
          mr: -0.5,
        },
      }}
    />
  )
}
