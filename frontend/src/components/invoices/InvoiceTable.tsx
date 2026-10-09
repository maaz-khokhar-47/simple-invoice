import {
  Card,
  CardActionArea,
  CardContent,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { StatusChip } from '../StatusChip'
import { dueHint, formatDate, formatMoney } from '../../utils/format'
import type { InvoiceListParams, InvoiceSummary, SortField } from '../../types/invoice'

const SKELETON_ROWS = 6

function DueHint({ invoice }: { invoice: InvoiceSummary }) {
  const hint = dueHint(invoice.dueDate, invoice.status)
  if (!hint) return null
  return (
    <Typography
      variant="caption"
      component="div"
      color={invoice.status === 'Overdue' ? 'error.main' : 'text.secondary'}
      sx={{ fontWeight: invoice.status === 'Overdue' ? 600 : 400 }}
    >
      {hint}
    </Typography>
  )
}

interface Props {
  invoices: InvoiceSummary[]
  params: InvoiceListParams
  loading?: boolean
  onSort: (sortBy: SortField) => void
}

export function InvoiceTable({ invoices, params, loading, onSort }: Props) {
  const navigate = useNavigate()

  const sortableHeader = (field: SortField, label: string, align?: 'right') => (
    <TableCell align={align} sortDirection={params.sortBy === field ? (params.ordering === 'ASC' ? 'asc' : 'desc') : false}>
      <TableSortLabel
        active={params.sortBy === field}
        direction={params.sortBy === field && params.ordering === 'ASC' ? 'asc' : 'desc'}
        onClick={() => onSort(field)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  )

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Invoice #</TableCell>
            <TableCell>Customer</TableCell>
            {sortableHeader('invoiceDate', 'Invoice date')}
            {sortableHeader('dueDate', 'Due date')}
            {sortableHeader('totalAmount', 'Total', 'right')}
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <TableRow key={i} aria-hidden>
                  {[90, 140, 90, 90, 80, 70].map((width, col) => (
                    <TableCell key={col} align={col === 4 ? 'right' : undefined}>
                      <Skeleton width={width} sx={{ display: 'inline-block' }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : invoices.map((invoice) => (
                <TableRow
                  key={invoice.invoiceId}
                  hover
                  onClick={() => navigate(`/invoices/${invoice.invoiceId}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontWeight: 600 }}>{invoice.invoiceNumber}</TableCell>
                  <TableCell>
                    <div>{invoice.customer.fullname}</div>
                    <Typography variant="caption" component="div" color="text.secondary">
                      {invoice.customer.email}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                  <TableCell>
                    <div>{formatDate(invoice.dueDate)}</div>
                    <DueHint invoice={invoice} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatMoney(invoice.totalAmount, invoice.currency)}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={invoice.status} />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

/** Card layout for small screens where a 6-column table doesn't fit. */
export function InvoiceCardList({ invoices, loading }: { invoices: InvoiceSummary[]; loading?: boolean }) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <Stack spacing={1.5} sx={{ p: 1.5 }} aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={96} />
        ))}
      </Stack>
    )
  }

  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      {invoices.map((invoice) => (
        <Card key={invoice.invoiceId}>
          <CardActionArea onClick={() => navigate(`/invoices/${invoice.invoiceId}`)}>
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Typography sx={{ fontWeight: 600 }}>{invoice.invoiceNumber}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {invoice.customer.fullname}
                  </Typography>
                </div>
                <StatusChip status={invoice.status} />
              </Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-end', mt: 1.5 }}>
                <div>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Due {formatDate(invoice.dueDate)}
                  </Typography>
                  <DueHint invoice={invoice} />
                </div>
                <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(invoice.totalAmount, invoice.currency)}
                </Typography>
              </Stack>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  )
}
