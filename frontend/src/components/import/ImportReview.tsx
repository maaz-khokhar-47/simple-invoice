import { useState } from 'react'
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/TaskAlt'
import ErrorIcon from '@mui/icons-material/ErrorOutlineOutlined'
import type { ImportPreview, ImportPreviewRow } from '../../types/invoice'
import { formatDate, formatMoney } from '../../utils/format'
import { ImportRowDialog } from './ImportRowDialog'

type Filter = 'all' | 'valid' | 'invalid'

const showDate = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value || '—')

/** Every row from the file with its status; click one for the full picture. */
export function ImportReview({ preview }: { preview: ImportPreview }) {
  // Start on the problems when there are any - that's what needs attention
  const [filter, setFilter] = useState<Filter>(preview.invalidCount > 0 ? 'invalid' : 'all')
  const [selected, setSelected] = useState<ImportPreviewRow | null>(null)

  const rows = preview.rows.filter((row) => filter === 'all' || (filter === 'valid') === row.valid)

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Chip
            icon={<CheckCircleIcon />}
            color="success"
            variant="outlined"
            label={`${preview.validCount} ready to import`}
          />
          {preview.invalidCount > 0 && (
            <Chip
              icon={<ErrorIcon />}
              color="error"
              variant="outlined"
              label={`${preview.invalidCount} with problems (will be skipped)`}
            />
          )}
        </Stack>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_, value: Filter | null) => value && setFilter(value)}
          aria-label="Show rows"
        >
          <ToggleButton value="all">All {preview.totalRows}</ToggleButton>
          <ToggleButton value="valid">Ready {preview.validCount}</ToggleButton>
          <ToggleButton value="invalid">Problems {preview.invalidCount}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 2, maxHeight: 480 }}>
        <Table size="small" stickyHeader aria-label="Rows in the file">
          <TableHead>
            <TableRow>
              <TableCell>Row</TableCell>
              <TableCell>Invoice #</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Due date</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.rowNumber}
                hover
                onClick={() => setSelected(row)}
                sx={{ cursor: 'pointer', verticalAlign: 'top' }}
              >
                <TableCell>{row.rowNumber}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{row.invoice.invoiceNumber || '—'}</TableCell>
                <TableCell>
                  <div>{row.invoice.customer?.fullname || '—'}</div>
                  {!row.valid && (
                    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, color: 'error.main' }}>
                      {row.errors.map((error) => (
                        <Typography key={error} component="li" variant="caption">
                          {error}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{showDate(row.invoice.dueDate)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {row.totals && row.invoice.currency ? formatMoney(row.totals.totalAmount, row.invoice.currency) : '—'}
                </TableCell>
                <TableCell>
                  {row.valid ? (
                    <Chip size="small" color="success" label="Ready" />
                  ) : (
                    <Chip
                      size="small"
                      color="error"
                      label={`${row.errors.length} problem${row.errors.length === 1 ? '' : 's'}`}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {filter === 'invalid' ? 'No problems found.' : 'No rows to show.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ImportRowDialog row={selected} onClose={() => setSelected(null)} />
    </>
  )
}
