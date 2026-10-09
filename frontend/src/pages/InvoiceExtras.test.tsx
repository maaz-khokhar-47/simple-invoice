import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API, INVOICE_DETAIL, sampleDetail, server } from '../test/server'
import { renderApp } from '../test/render'
import type { InvoiceDetail } from '../types/invoice'

const route = `/invoices/${sampleDetail.invoiceId}`

const paid: InvoiceDetail = {
  ...sampleDetail,
  status: 'Paid',
  storedStatus: 'Paid',
  totalPaid: 2180,
  balanceAmount: 0,
  payments: [
    ...sampleDetail.payments,
    { id: 'p-2', amount: 728.66, method: 'BankTransfer', amountReceived: 728.66, currency: 'AUD', exchangeRate: 1, taxWithheld: 0, paidAt: '2026-07-10', note: 'Final', createdAt: '2026-07-10T09:00:00Z' },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Invoice detail extras', () => {
  it('shows how much has been paid', async () => {
    renderApp({ route })

    expect(await screen.findByRole('progressbar', { name: 'Amount paid' })).toHaveAttribute('aria-valuenow', '67')
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('names the browser tab after the page', async () => {
    renderApp({ route })
    await screen.findByRole('region', { name: 'Activity' })
    expect(document.title).toBe('Invoice IV1780488206995 · SimpleInvoice')

    await userEvent.click(screen.getByRole('link', { name: /back to invoices/i }))
    await waitFor(() => expect(document.title).toBe('Invoices · SimpleInvoice'))
  })

  it('shows the activity timeline in order', async () => {
    renderApp({ route })

    const activity = await screen.findByRole('region', { name: 'Activity' })
    const titles = within(activity)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')?.textContent)

    // created + sent on 3 Jun, part payment 20 Jun, overdue from 4 Jul
    expect(titles).toEqual(['Invoice created', 'Marked as sent', 'Payment received', 'Became overdue'])
    expect(within(activity).getByText(/AUD 1,451\.34 · Bank transfer · Part payment/)).toBeInTheDocument()
  })

  it('keeps a backdated payment after the invoice was sent', async () => {
    server.use(
      http.get(INVOICE_DETAIL, () =>
        HttpResponse.json({
          ...sampleDetail,
          payments: [{ ...sampleDetail.payments[0], paidAt: '2026-05-20' }],
        }),
      ),
    )
    renderApp({ route })

    const activity = await screen.findByRole('region', { name: 'Activity' })
    const titles = within(activity)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')?.textContent)

    expect(titles.slice(0, 3)).toEqual(['Invoice created', 'Marked as sent', 'Payment received'])
    expect(within(activity).getByText(/20 May 2026/)).toBeInTheDocument()
  })

  it('marks the last payment of a paid invoice as "Paid in full"', async () => {
    server.use(http.get(INVOICE_DETAIL, () => HttpResponse.json(paid)))
    renderApp({ route })

    const activity = await screen.findByRole('region', { name: 'Activity' })
    expect(within(activity).getByText('Paid in full')).toBeInTheDocument()
    expect(within(activity).queryByText('Became overdue')).not.toBeInTheDocument()
  })

  it('downloads a paid invoice as PDF', async () => {
    server.use(
      http.get(INVOICE_DETAIL, () => HttpResponse.json(paid)),
      http.get(`${API}/invoices/:id/pdf`, () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode('%PDF-1.3 test').buffer, {
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    )
    // jsdom has no object URLs or real downloads
    URL.createObjectURL = vi.fn(() => 'blob:invoice')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderApp({ route })
    await userEvent.click(await screen.findByRole('button', { name: /download pdf/i }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toBe('invoice-IV1780488206995.pdf')
    expect(link.href).toBe('blob:invoice')
  })

  it('does not offer a PDF before the invoice is paid', async () => {
    renderApp({ route })

    await screen.findByRole('button', { name: /record payment/i })
    expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument()
  })
})

describe('Invoice form extras', () => {
  it('sets the due date from payment terms', async () => {
    renderApp({ route: '/invoices/new' })
    await screen.findByRole('heading', { name: 'New invoice' })

    const invoiceDate = screen.getByLabelText(/invoice date/i)
    await userEvent.clear(invoiceDate)
    await userEvent.type(invoiceDate, '2026-10-01')
    await userEvent.click(screen.getByRole('button', { name: 'Net 30' }))

    expect(screen.getByLabelText(/due date/i)).toHaveValue('2026-10-31')
    expect(screen.getByRole('button', { name: 'Net 30' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('fills customer details from a previous invoice', async () => {
    let searched: string | null = null
    server.use(
      http.get(`${API}/customers`, ({ request }) => {
        searched = new URL(request.url).searchParams.get('keyword')
        return HttpResponse.json([
          { fullname: 'Kang Lee', email: 'kang.lee@example.com', mobileNumber: '6591234567', address: 'Singapore' },
        ])
      }),
    )
    renderApp({ route: '/invoices/new' })
    await screen.findByRole('heading', { name: 'New invoice' })

    await userEvent.type(screen.getByLabelText(/customer name/i), 'Kan')
    await userEvent.click(await screen.findByRole('option', { name: /Kang Lee/ }))

    expect(searched).toBe('Kan')
    expect(screen.getByLabelText(/customer name/i)).toHaveValue('Kang Lee')
    expect(screen.getByLabelText(/customer email/i)).toHaveValue('kang.lee@example.com')
    expect(screen.getByLabelText(/mobile/i)).toHaveValue('6591234567')
    expect(screen.getByLabelText(/address/i)).toHaveValue('Singapore')

    // labels of autofilled fields must float above the value, not sit on top of it
    for (const field of [/customer email/i, /mobile/i, /address/i]) {
      const label = screen.getByLabelText(field).closest('.MuiFormControl-root')?.querySelector('label')
      expect(label).toHaveAttribute('data-shrink', 'true')
    }
  })

  it('keeps the live preview in sync with the form', async () => {
    renderApp({ route: '/invoices/new' })
    await screen.findByRole('heading', { name: 'New invoice' })
    const user = userEvent.setup({ delay: null })

    await user.type(screen.getByLabelText(/invoice number/i), 'INV-7')
    await user.type(screen.getByLabelText(/item name/i), 'Consulting')
    await user.clear(screen.getByLabelText(/quantity/i))
    await user.type(screen.getByLabelText(/quantity/i), '4')
    await user.type(screen.getByLabelText(/rate/i), '250')

    const preview = screen.getByLabelText('Invoice preview')
    expect(within(preview).getByText('INV-7')).toBeInTheDocument()
    expect(within(preview).getByText('4 × AUD 250.00')).toBeInTheDocument()
    // 1000 + 10% tax
    expect(within(preview).getByTestId('preview-total')).toHaveTextContent('AUD 1,100.00')
  })
})
