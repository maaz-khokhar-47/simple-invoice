import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, INVOICE_DETAIL, sampleDetail, server } from '../test/server'
import { renderApp } from '../test/render'
import type { CreatePaymentPayload, InvoiceDetail } from '../types/invoice'

const route = `/invoices/${sampleDetail.invoiceId}`

/** Serves one invoice and lets each test change it like the real API would. */
function serveInvoice(initial: Partial<InvoiceDetail>) {
  let invoice: InvoiceDetail = { ...sampleDetail, ...initial }
  server.use(http.get(INVOICE_DETAIL, () => HttpResponse.json(invoice)))
  return {
    update: (changes: Partial<InvoiceDetail>) => {
      invoice = { ...invoice, ...changes }
      return invoice
    },
  }
}

describe('Invoice lifecycle', () => {
  it('shows the payment history', async () => {
    renderApp({ route })

    const table = await screen.findByRole('table', { name: 'Payments' })
    expect(within(table).getByText('20 Jun 2026')).toBeInTheDocument()
    expect(within(table).getByText('Part payment')).toBeInTheDocument()
    // received and settled are the same for a same-currency payment with no tax
    expect(within(table).getAllByText('AUD 1,451.34')).toHaveLength(2)
    expect(within(table).getByText('Bank transfer')).toBeInTheDocument()
  })

  it('marks a draft as sent', async () => {
    const invoice = serveInvoice({ storedStatus: 'Draft', status: 'Draft', totalPaid: 0, payments: [] })
    let body: unknown
    server.use(
      http.patch(`${API}/invoices/:id/status`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(invoice.update({ storedStatus: 'Pending', status: 'Pending' }))
      }),
    )
    renderApp({ route })

    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /mark as sent/i }))

    expect(await screen.findByText('Invoice IV1780488206995 marked as sent')).toBeInTheDocument()
    expect(body).toEqual({ status: 'Pending' })
    expect(screen.getByRole('button', { name: /record payment/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark as sent/i })).not.toBeInTheDocument()
  })

  it('validates the payment amount against the balance', async () => {
    let called = false
    server.use(
      http.post(`${API}/invoices/:id/payments`, () => {
        called = true
        return HttpResponse.json({})
      }),
    )
    renderApp({ route })

    await userEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText(/amount received/i)

    // defaults to the full balance
    expect(amount).toHaveValue(728.66)

    await userEvent.clear(amount)
    await userEvent.type(amount, '800')
    await userEvent.click(within(dialog).getByRole('button', { name: /save payment/i }))

    expect(
      await within(dialog).findByText('This settles AUD 800.00, more than the balance (AUD 728.66)'),
    ).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('records the final payment and the invoice becomes Paid', async () => {
    const invoice = serveInvoice({})
    let body: CreatePaymentPayload | undefined
    server.use(
      http.post(`${API}/invoices/:id/payments`, async ({ request }) => {
        body = (await request.json()) as CreatePaymentPayload
        return HttpResponse.json(
          invoice.update({
            storedStatus: 'Paid',
            status: 'Paid',
            totalPaid: 2180,
            balanceAmount: 0,
            payments: [
              ...sampleDetail.payments,
              { id: 'p-2', amount: 728.66, method: 'BankTransfer', amountReceived: 728.66, currency: 'AUD', exchangeRate: 1, taxWithheld: 0, paidAt: body.paidAt, note: 'Final', createdAt: '2026-10-09T00:00:00Z' },
            ],
          }),
          { status: 201 },
        )
      }),
    )
    renderApp({ route })

    await userEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/note/i), 'Final')
    await userEvent.click(within(dialog).getByRole('button', { name: /save payment/i }))

    expect(await screen.findByText('Invoice IV1780488206995 is now paid')).toBeInTheDocument()
    expect(body).toMatchObject({ method: 'BankTransfer', amountReceived: 728.66, taxWithheld: 0, note: 'Final' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Paid', { selector: '.MuiChip-label' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
  })

  it('records a foreign-currency payment with tax withheld', async () => {
    let body: CreatePaymentPayload | undefined
    server.use(
      http.post(`${API}/invoices/:id/payments`, async ({ request }) => {
        body = (await request.json()) as CreatePaymentPayload
        return HttpResponse.json(sampleDetail, { status: 201 })
      }),
    )
    renderApp({ route })
    await userEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup({ delay: null })

    // mode and currency
    await user.click(within(dialog).getByLabelText(/payment mode/i))
    await user.click(await screen.findByRole('option', { name: 'Bank remittance' }))
    await user.click(within(dialog).getByLabelText(/received in/i))
    await user.click(await screen.findByRole('option', { name: 'USD' }))

    // a rate is required once the currency differs
    const rate = within(dialog).getByLabelText(/exchange rate/i)
    expect(within(dialog).getByText('1 USD = ? AUD')).toBeInTheDocument()
    await user.type(rate, '1.25')

    // tax withheld: 10% of the AUD 2,000.00 subtotal = AUD 200.00
    await user.click(within(dialog).getByRole('radio', { name: 'Yes' }))
    await user.type(within(dialog).getByLabelText('Tax rate (%)'), '10')
    expect(within(dialog).getByLabelText(/tax withheld/i)).toHaveValue(200)

    // too much: USD 728.66 x 1.25 + 200 is more than the balance
    await user.click(within(dialog).getByRole('button', { name: /save payment/i }))
    expect(await within(dialog).findByText(/more than the balance \(AUD 728\.66\)/)).toBeInTheDocument()

    // "receive the rest": (728.66 - 200) / 1.25 = 422.93 USD
    await user.click(within(dialog).getByRole('button', { name: /receive the rest/i }))
    expect(within(dialog).getByLabelText(/amount received/i)).toHaveValue(422.93)
    const summary = within(dialog).getByRole('region', { name: 'Payment summary' })
    expect(summary).toHaveTextContent('USD 422.93 × 1.25 = AUD 528.66')
    expect(summary).toHaveTextContent('Settles' + 'AUD 728.66')
    expect(summary).toHaveTextContent('marks the invoice Paid')

    await user.click(within(dialog).getByRole('button', { name: /save payment/i }))
    await waitFor(() =>
      expect(body).toMatchObject({
        method: 'BankRemittance',
        amountReceived: 422.93,
        currency: 'USD',
        exchangeRate: 1.25,
        taxWithheld: 200,
      }),
    )
  })

  it('does not send an exchange rate for a same-currency payment', async () => {
    let body: CreatePaymentPayload | undefined
    server.use(
      http.post(`${API}/invoices/:id/payments`, async ({ request }) => {
        body = (await request.json()) as CreatePaymentPayload
        return HttpResponse.json(sampleDetail, { status: 201 })
      }),
    )
    renderApp({ route })
    await userEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByLabelText(/exchange rate/i)).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /save payment/i }))

    await waitFor(() => expect(body).toMatchObject({ method: 'BankTransfer', currency: 'AUD', taxWithheld: 0 }))
    expect(body).not.toHaveProperty('exchangeRate')
  })

  it('shows server-side amount errors inside the dialog', async () => {
    server.use(
      http.post(`${API}/invoices/:id/payments`, () =>
        HttpResponse.json(
          { statusCode: 400, message: ['paidAt cannot be before the invoice date'], error: 'Bad Request' },
          { status: 400 },
        ),
      ),
    )
    renderApp({ route })

    await userEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /save payment/i }))

    expect(await within(dialog).findByText('paidAt cannot be before the invoice date')).toBeInTheDocument()
  })

  it('offers no actions once an invoice is paid', async () => {
    serveInvoice({ storedStatus: 'Paid', status: 'Paid', balanceAmount: 0, totalPaid: 2180 })
    renderApp({ route })

    expect(await screen.findByRole('heading', { name: 'IV1780488206995' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark as sent/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
  })
})
