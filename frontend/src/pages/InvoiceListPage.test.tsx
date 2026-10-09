import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, sampleInvoice, sampleStats, server } from '../test/server'
import { renderApp } from '../test/render'

/** Records the query string of every list request. */
function captureListRequests() {
  const requests: URLSearchParams[] = []
  server.use(
    http.get(`${API}/invoices`, ({ request }) => {
      requests.push(new URL(request.url).searchParams)
      return HttpResponse.json({ data: [sampleInvoice], paging: { page: 1, pageSize: 10, total: 25 } })
    }),
  )
  return requests
}

describe('Invoice list', () => {
  it('shows invoices with their key fields', async () => {
    renderApp({ route: '/invoices' })

    const row = (await screen.findByText('IV1780488206995')).closest('tr')!
    expect(within(row).getByText('Paul')).toBeInTheDocument()
    expect(within(row).getByText('3 Jun 2026')).toBeInTheDocument()
    expect(within(row).getByText('3 Jul 2026')).toBeInTheDocument()
    expect(within(row).getByText('AUD 2,180.00')).toBeInTheDocument()
    expect(within(row).getByText('Overdue')).toBeInTheDocument()
    expect(within(row).getByText(/\d+ days overdue/)).toBeInTheDocument()
  })

  it('sends default paging and sort params', async () => {
    const requests = captureListRequests()
    renderApp({ route: '/invoices' })

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(Object.fromEntries(requests[0])).toEqual({
      page: '1',
      pageSize: '10',
      sortBy: 'invoiceDate',
      ordering: 'DESC',
    })
  })

  it('searches after the user stops typing', async () => {
    const requests = captureListRequests()
    renderApp({ route: '/invoices' })
    await screen.findByText('IV1780488206995')

    await userEvent.type(screen.getByLabelText('Search invoices'), 'paul')

    await waitFor(() => expect(requests.at(-1)?.get('keyword')).toBe('paul'))
    // one request on load, one for the search - not one per keystroke
    expect(requests).toHaveLength(2)
  })

  it('filters by status and resets to page 1', async () => {
    const requests = captureListRequests()
    renderApp({ route: '/invoices?page=3' })
    await screen.findByText('IV1780488206995')

    await userEvent.click(screen.getByRole('tab', { name: /^Paid/ }))

    await waitFor(() => expect(requests.at(-1)?.get('status')).toBe('Paid'))
    expect(requests.at(-1)?.get('page')).toBe('1')
    expect(screen.getByTestId('location')).toHaveTextContent('/invoices?status=Paid')
  })

  it('toggles sort direction from the column header', async () => {
    const requests = captureListRequests()
    renderApp({ route: '/invoices' })
    await screen.findByText('IV1780488206995')

    await userEvent.click(screen.getByRole('button', { name: 'Total' }))
    await waitFor(() => expect(requests.at(-1)?.get('sortBy')).toBe('totalAmount'))
    expect(requests.at(-1)?.get('ordering')).toBe('DESC')

    await userEvent.click(screen.getByRole('button', { name: 'Total' }))
    await waitFor(() => expect(requests.at(-1)?.get('ordering')).toBe('ASC'))
  })

  it('goes to the next page', async () => {
    const requests = captureListRequests()
    renderApp({ route: '/invoices' })
    await screen.findByText('IV1780488206995')

    await userEvent.click(screen.getByRole('button', { name: /next page/i }))

    await waitFor(() => expect(requests.at(-1)?.get('page')).toBe('2'))
  })

  it('shows summary cards and tab counts from the stats endpoint', async () => {
    renderApp({ route: '/invoices' })

    // the receivable comes straight from the server's "outstanding" figure
    const card = (await screen.findByText('Total outstanding receivable')).closest('.MuiCard-root') as HTMLElement
    expect(await within(card).findByText('AUD 14,250.00')).toBeInTheDocument()
    expect(within(card).getByText('11 invoices · +USD 900.00')).toBeInTheDocument()
    // what it means is explained on hover and to screen readers
    expect(screen.getByRole('button', { name: /Total outstanding receivable/ })).toHaveAccessibleDescription(
      /Drafts aren't included/,
    )
    await userEvent.hover(within(card).getByTestId('InfoOutlinedIcon'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent("Money customers still owe on invoices you've sent")

    expect(screen.getByRole('tab', { name: 'All 25' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overdue 4' })).toBeInTheDocument()
  })

  it('filters to outstanding receivables from the card', async () => {
    const requests = captureListRequests()
    renderApp({ route: '/invoices?status=Draft' })
    await screen.findByText('IV1780488206995')

    await userEvent.click(screen.getByRole('button', { name: /Total outstanding receivable/ }))

    await waitFor(() => expect(requests.at(-1)?.get('outstanding')).toBe('true'))
    expect(requests.at(-1)?.get('status')).toBeNull()
    expect(screen.getByTestId('location')).toHaveTextContent('/invoices?outstanding=true')
    // no tab matches this view, so none is selected
    expect(screen.queryByRole('tab', { selected: true })).not.toBeInTheDocument()

    // a tab switches back to a normal view
    await userEvent.click(screen.getByRole('tab', { name: /^Pending/ }))
    await waitFor(() => expect(requests.at(-1)?.get('outstanding')).toBeNull())
    expect(requests.at(-1)?.get('status')).toBe('Pending')
  })

  it('filters by clicking a summary card, and clears on a second click', async () => {
    const requests = captureListRequests()
    renderApp({ route: '/invoices' })
    await screen.findByText('IV1780488206995')

    const overdueCard = screen.getByRole('button', { name: /Overdue/ })
    await userEvent.click(overdueCard)
    await waitFor(() => expect(requests.at(-1)?.get('status')).toBe('Overdue'))
    expect(screen.getByRole('tab', { name: 'Overdue 4' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(overdueCard)
    await waitFor(() => expect(requests.at(-1)?.get('status')).toBeNull())
  })

  it('shows invoices due today as a tab, without changing the cards', async () => {
    const requests = captureListRequests()
    const statsQueries: URLSearchParams[] = []
    server.use(
      http.get(`${API}/invoices/stats`, ({ request }) => {
        statsQueries.push(new URL(request.url).searchParams)
        return HttpResponse.json(sampleStats)
      }),
    )
    renderApp({ route: '/invoices?status=Paid' })

    const card = (await screen.findByText('Due today', { selector: 'p' })).closest('.MuiCard-root') as HTMLElement
    expect(await within(card).findByText('AUD 750.00')).toBeInTheDocument()
    expect(within(card).getByText('2 invoices')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Due today 2' })).toBeInTheDocument()

    // the card selects the "Due today" tab and replaces the status filter
    await userEvent.click(screen.getByRole('button', { name: /Due today/ }))
    await waitFor(() => expect(requests.at(-1)?.get('dueToday')).toBe('true'))
    expect(requests.at(-1)?.get('status')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Due today 2' })).toHaveAttribute('aria-selected', 'true')

    // the other cards keep their overall numbers
    const overdue = screen.getByText('Overdue', { selector: 'p' }).closest('.MuiCard-root') as HTMLElement
    expect(within(overdue).getByText('AUD 3,180.50')).toBeInTheDocument()
    expect(statsQueries.every((query) => !query.has('dueToday'))).toBe(true)

    // any other tab leaves "Due today"
    await userEvent.click(screen.getByRole('tab', { name: /^All/ }))
    await waitFor(() => expect(requests.at(-1)?.get('dueToday')).toBeNull())
  })

  it('passes search filters to the stats so counts match the list', async () => {
    const statsQueries: URLSearchParams[] = []
    server.use(
      http.get(`${API}/invoices/stats`, ({ request }) => {
        statsQueries.push(new URL(request.url).searchParams)
        return HttpResponse.json(sampleStats)
      }),
    )
    renderApp({ route: '/invoices' })
    await screen.findByText('IV1780488206995')

    await userEvent.type(screen.getByLabelText('Search invoices'), 'kang')

    await waitFor(() => expect(statsQueries.at(-1)?.get('keyword')).toBe('kang'))
  })

  it('invites you to create the first invoice when there are none', async () => {
    server.use(
      http.get(`${API}/invoices`, () => HttpResponse.json({ data: [], paging: { page: 1, pageSize: 10, total: 0 } })),
    )
    renderApp({ route: '/invoices' })

    expect(await screen.findByText('No invoices yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /new invoice/i })).toHaveLength(2)
  })

  it('explains an empty tab', async () => {
    server.use(
      http.get(`${API}/invoices`, () => HttpResponse.json({ data: [], paging: { page: 1, pageSize: 10, total: 0 } })),
    )
    renderApp({ route: '/invoices?status=Overdue' })

    expect(await screen.findByText('Nothing overdue')).toBeInTheDocument()
  })

  it('offers to clear a search with no results', async () => {
    server.use(
      http.get(`${API}/invoices`, () => HttpResponse.json({ data: [], paging: { page: 1, pageSize: 10, total: 0 } })),
    )
    renderApp({ route: '/invoices?keyword=zzz' })

    expect(await screen.findByText('No matching invoices')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and dates' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/invoices$/))
  })

  it('opens the detail page when a row is clicked', async () => {
    renderApp({ route: '/invoices' })

    await userEvent.click(await screen.findByText('IV1780488206995'))

    expect(await screen.findByText('Balance due')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/invoices/${sampleInvoice.invoiceId}`)
  })
})
