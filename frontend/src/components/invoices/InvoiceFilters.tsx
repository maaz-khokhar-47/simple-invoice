import { useEffect, useState } from 'react'
import { Box, Button, IconButton, InputAdornment, MenuItem, Stack, TextField } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { InvoiceListParams } from '../../types/invoice'

const SORT_OPTIONS = [
  { value: 'invoiceDate:DESC', label: 'Invoice date (newest)' },
  { value: 'invoiceDate:ASC', label: 'Invoice date (oldest)' },
  { value: 'dueDate:ASC', label: 'Due date (soonest)' },
  { value: 'dueDate:DESC', label: 'Due date (latest)' },
  { value: 'totalAmount:DESC', label: 'Amount (high to low)' },
  { value: 'totalAmount:ASC', label: 'Amount (low to high)' },
] as const

// Native date inputs have a built-in minimum width; let them shrink so the
// From/To pair fits side by side on a phone
const DATE_FIELD_SX = { flex: 1, minWidth: 0, '& .MuiInputBase-input': { minWidth: 0 } }

interface Props {
  params: InvoiceListParams
  onChange: (changes: Partial<InvoiceListParams>) => void
}

/** Search, date range and sort. Status and "Due today" live in the tabs above. */
export function InvoiceFilters({ params, onChange }: Props) {
  // Keep the text box responsive and only hit the API once typing pauses
  const [keyword, setKeyword] = useState(params.keyword ?? '')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 350)

  useEffect(() => {
    if (debouncedKeyword !== (params.keyword ?? '')) {
      onChange({ keyword: debouncedKeyword || undefined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debouncedKeyword])

  // Follow the URL when it changes from outside (e.g. "Clear")
  useEffect(() => {
    setKeyword(params.keyword ?? '')
  }, [params.keyword])

  const hasFilters = Boolean(params.keyword || params.fromDate || params.toDate)

  return (
    <Box sx={{ p: 2 }}>
      {/* wrap only in the row layout: a wrapping column sizes itself to its widest child */}
      <Stack spacing={1.5} direction={{ xs: 'column', md: 'row' }} useFlexGap sx={{ flexWrap: { md: 'wrap' } }}>
        <TextField
          size="small"
          placeholder="Search invoice # or customer"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          sx={{ flex: { md: '1 1 260px' } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: keyword ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setKeyword('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
            htmlInput: { 'aria-label': 'Search invoices' },
          }}
        />

        <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
          <TextField
            size="small"
            type="date"
            label="From"
            value={params.fromDate ?? ''}
            onChange={(e) => onChange({ fromDate: e.target.value || undefined })}
            sx={DATE_FIELD_SX}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: params.toDate } }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={params.toDate ?? ''}
            onChange={(e) => onChange({ toDate: e.target.value || undefined })}
            sx={DATE_FIELD_SX}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: params.fromDate } }}
          />
        </Stack>

        <TextField
          select
          size="small"
          label="Sort by"
          value={`${params.sortBy}:${params.ordering}`}
          onChange={(e) => {
            const [sortBy, ordering] = e.target.value.split(':') as [
              InvoiceListParams['sortBy'],
              InvoiceListParams['ordering'],
            ]
            onChange({ sortBy, ordering })
          }}
          sx={{ minWidth: 200 }}
        >
          {SORT_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        {hasFilters && (
          <Button
            onClick={() => onChange({ keyword: undefined, fromDate: undefined, toDate: undefined })}
            sx={{ alignSelf: { md: 'center' } }}
          >
            Clear
          </Button>
        )}
      </Stack>
    </Box>
  )
}
