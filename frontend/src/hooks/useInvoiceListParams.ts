import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  INVOICE_STATUSES,
  type InvoiceListParams,
  type InvoiceStatus,
  type Ordering,
  type SortField,
} from '../types/invoice'

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]

const SORT_FIELDS: SortField[] = ['invoiceDate', 'dueDate', 'totalAmount']

export const DEFAULT_PARAMS: InvoiceListParams = {
  page: 1,
  pageSize: 10,
  sortBy: 'invoiceDate',
  ordering: 'DESC',
}

function parse(search: URLSearchParams): InvoiceListParams {
  const page = Number(search.get('page'))
  const pageSize = Number(search.get('pageSize'))
  const sortBy = search.get('sortBy') as SortField
  const ordering = search.get('ordering') as Ordering
  const status = search.get('status') as InvoiceStatus

  // Anything unrecognised in the URL just falls back to the default
  return {
    page: Number.isInteger(page) && page > 0 ? page : DEFAULT_PARAMS.page,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PARAMS.pageSize,
    sortBy: SORT_FIELDS.includes(sortBy) ? sortBy : DEFAULT_PARAMS.sortBy,
    ordering: ordering === 'ASC' || ordering === 'DESC' ? ordering : DEFAULT_PARAMS.ordering,
    status: INVOICE_STATUSES.includes(status) ? status : undefined,
    keyword: search.get('keyword') || undefined,
    fromDate: search.get('fromDate') || undefined,
    toDate: search.get('toDate') || undefined,
    dueToday: search.get('dueToday') === 'true' || undefined,
    outstanding: search.get('outstanding') === 'true' || undefined,
  }
}

/**
 * List filters live in the URL so refresh, back/forward and shared links
 * all keep the current view.
 */
export function useInvoiceListParams() {
  const [search, setSearch] = useSearchParams()
  const params = useMemo(() => parse(search), [search])

  const update = useCallback(
    (changes: Partial<InvoiceListParams>) => {
      setSearch(
        (prev) => {
          const current = parse(prev)
          // Changing anything other than the page should start again from page 1
          const resetPage = Object.keys(changes).some((key) => key !== 'page')
          const next: InvoiceListParams = {
            ...current,
            ...(resetPage ? { page: 1 } : {}),
            ...changes,
          }

          const out = new URLSearchParams()
          for (const [key, value] of Object.entries(next)) {
            const isDefault = DEFAULT_PARAMS[key as keyof InvoiceListParams] === value
            if (value !== undefined && value !== '' && !isDefault) {
              out.set(key, String(value))
            }
          }
          return out
        },
        { replace: true },
      )
    },
    [setSearch],
  )

  return { params, update }
}
