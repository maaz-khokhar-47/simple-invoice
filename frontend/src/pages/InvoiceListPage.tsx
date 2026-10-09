import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  TablePagination,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined'
import InboxIcon from '@mui/icons-material/InboxOutlined'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import { fetchInvoices, fetchInvoiceStats } from '../api/invoices'
import { getErrorMessage } from '../api/client'
import { EmptyState } from '../components/EmptyState'
import { InvoiceFilters } from '../components/invoices/InvoiceFilters'
import { InvoiceCardList, InvoiceTable } from '../components/invoices/InvoiceTable'
import { StatusTabs } from '../components/invoices/StatusTabs'
import { SummaryCards } from '../components/invoices/SummaryCards'
import { PAGE_SIZE_OPTIONS, useInvoiceListParams } from '../hooks/useInvoiceListParams'
import type { InvoiceListParams, InvoiceStatus, SortField } from '../types/invoice'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const EMPTY_TAB_MESSAGES: Record<InvoiceStatus, { title: string; message: string }> = {
  Draft: { title: 'No drafts', message: 'Invoices you create start here until you mark them as sent.' },
  Pending: { title: 'Nothing waiting for payment', message: 'Sent invoices that are not yet due will show up here.' },
  Overdue: { title: 'Nothing overdue', message: 'Every unpaid invoice is still within its due date.' },
  Paid: { title: 'No paid invoices yet', message: 'Invoices move here once payments cover the full amount.' },
  WrittenOff: { title: 'Nothing written off', message: 'Invoices whose balance was written off as bad debt show up here.' },
}

function EmptyResults({ params, onClear }: { params: InvoiceListParams; onClear: () => void }) {
  const searching = Boolean(params.keyword || params.fromDate || params.toDate)

  if (params.outstanding && !searching) {
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="Nothing outstanding"
        message="Every invoice you've sent has been paid in full."
      />
    )
  }
  if (params.dueToday && !searching) {
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="Nothing due today"
        message="No unpaid invoices have a due date of today."
      />
    )
  }

  if (searching) {
    return (
      <EmptyState
        icon={<SearchOffIcon />}
        title="No matching invoices"
        message="Try a different search term or date range."
        action={<Button onClick={onClear}>Clear search and dates</Button>}
      />
    )
  }
  if (params.status) {
    return <EmptyState icon={<InboxIcon />} {...EMPTY_TAB_MESSAGES[params.status]} />
  }
  return (
    <EmptyState
      icon={<InboxIcon />}
      title="No invoices yet"
      message="Create your first invoice to get started."
      action={
        <Button component={RouterLink} to="/invoices/new" variant="contained" startIcon={<AddIcon />}>
          New invoice
        </Button>
      }
    />
  )
}

export function InvoiceListPage() {
  useDocumentTitle('Invoices')
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { params, update } = useInvoiceListParams()
  const { keyword, fromDate, toDate } = params

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['invoices', params],
    queryFn: () => fetchInvoices(params),
    // keep showing the current page while the next one loads
    placeholderData: keepPreviousData,
  })

  // Same search/date filters as the list, so tab counts match what you'd see
  const { data: stats } = useQuery({
    queryKey: ['invoices', 'stats', { keyword, fromDate, toDate }],
    queryFn: () => fetchInvoiceStats({ keyword, fromDate, toDate }),
    placeholderData: keepPreviousData,
  })

  const handleSort = (sortBy: SortField) => {
    const ordering = params.sortBy === sortBy && params.ordering === 'DESC' ? 'ASC' : 'DESC'
    update({ sortBy, ordering })
  }

  // A status, "Due today" and "Outstanding" are alternative views; picking one clears the others
  const views = { status: undefined, dueToday: undefined, outstanding: undefined }
  const setStatus = (status: InvoiceStatus | undefined) => update({ ...views, status })
  const toggleDueToday = () => update({ ...views, dueToday: params.dueToday ? undefined : true })
  const toggleOutstanding = () => update({ ...views, outstanding: params.outstanding ? undefined : true })
  const invoices = data?.data ?? []

  const renderBody = () => {
    if (isError) {
      return (
        <Alert
          severity="error"
          sx={{ m: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          {getErrorMessage(error, 'Could not load invoices')}
        </Alert>
      )
    }
    if (!isPending && invoices.length === 0) {
      return (
        <EmptyResults
          params={params}
          onClear={() => update({ keyword: undefined, fromDate: undefined, toDate: undefined })}
        />
      )
    }
    return isMobile ? (
      <InvoiceCardList invoices={invoices} loading={isPending} />
    ) : (
      <InvoiceTable invoices={invoices} params={params} loading={isPending} onSort={handleSort} />
    )
  }

  return (
    <>
      <Stack
        direction="row"
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}>
            Invoices
          </Typography>
          <Typography color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Track what you've billed and what's still owed.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            component={RouterLink}
            to="/invoices/import"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            aria-label="Import from Excel"
            // icon only on phones, there isn't room for two labelled buttons
            sx={{ minWidth: { xs: 0 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              Import
            </Box>
          </Button>
          <Button component={RouterLink} to="/invoices/new" variant="contained" startIcon={<AddIcon />}>
            New invoice
          </Button>
        </Stack>
      </Stack>

      <SummaryCards
        stats={stats}
        activeStatus={params.status}
        dueToday={params.dueToday}
        outstanding={params.outstanding}
        onSelect={setStatus}
        onDueToday={toggleDueToday}
        onOutstanding={toggleOutstanding}
      />

      <Paper sx={{ overflow: 'hidden' }}>
        <StatusTabs
          value={params.status}
          dueToday={params.dueToday}
          outstanding={params.outstanding}
          stats={stats}
          onChange={setStatus}
          onDueToday={() => update({ ...views, dueToday: true })}
        />
        <InvoiceFilters params={params} onChange={update} />

        {/* thin bar for background refreshes; first load uses skeletons instead */}
        <Box sx={{ height: 2 }}>{isFetching && !isPending && <LinearProgress sx={{ height: 2 }} />}</Box>

        {renderBody()}

        {data && data.paging.total > 0 && (
          <TablePagination
            component="div"
            count={data.paging.total}
            page={params.page - 1}
            rowsPerPage={params.pageSize}
            rowsPerPageOptions={PAGE_SIZE_OPTIONS}
            onPageChange={(_, page) => update({ page: page + 1 })}
            onRowsPerPageChange={(e) => update({ pageSize: Number(e.target.value) })}
            labelRowsPerPage={isMobile ? 'Rows' : 'Rows per page'}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        )}
      </Paper>
    </>
  )
}
