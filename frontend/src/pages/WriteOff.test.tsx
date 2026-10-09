import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, INVOICE_DETAIL, sampleDetail, server } from '../test/server'
import { renderApp } from '../test/render'
import type { CreatePaymentPayload, InvoiceDetail, WriteOffPayload } from '../types/invoice'
import { todayIso } from '../utils/format'

const route = `/invoices/${sampleDetail.invoiceId}`

// the sample invoice: AUD 2,180.00, AUD 1,451.34 paid, AUD 728.66 left
const writtenOff: InvoiceDetail = {
  ...sampleDetail,
  status: 'WrittenOff',
  storedStatus: 'WrittenOff',
  totalWrittenOff: 728.66,
  balanceAmount: 0,
  writeOffs: [
    {
      id: 'w-1',
      amount: 728.66,
      reason: 'BadDebt',
      note: 'Customer went into liquidation',
      writtenOffAt: '2026-10-09',
      paymentId: null,
      createdAt: '2026-10-09T09:00:00Z',
    },
  ],
}

describe('Writing off a balance', () => {
  it('writes off the rest of the balance as bad debt', async () => {
    let body: WriteOffPayload | undefined
    let current: InvoiceDetail = sampleDetail
    server.use(
      http.get(INVOICE_DETAIL, () => HttpResponse.json(current)),
      http.post(`${API}/invoices/:id/write-off`, async ({ request }) => {
        body = (await request.json()) as WriteOffPayload
        current = writtenOff
        return HttpResponse.json(writtenOff, { status: 201 })
      }),
    )
    renderApp({ route })

    await userEvent.click(await screen.findByRole('button', { name: /^write off$/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Write off balance' })
    expect(within(dialog).getByText('AUD 728.66')).toBeInTheDocument()
    expect(within(dialog).getByText(/AUD 1,451\.34 already received stays recorded/)).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText(/note/i), 'Customer went into liquidation')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Write off AUD 728.66' }))

    await waitFor(() =>
      expect(body).toEqual({ reason: 'BadDebt', writtenOffAt: todayIso(), note: 'Customer went into liquidation' }),
    )

    // closed: shown as Written off, nothing left to do, and the write-off is listed
    expect(await screen.findByText('Invoice IV1780488206995 written off')).toBeInTheDocument()
    expect(screen.getAllByText('Written off').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^write off$/i })).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Write-offs' })
    expect(within(table).getByText('Bad debt')).toBeInTheDocument()
    expect(within(table).getByText('AUD 728.66')).toBeInTheDocument()
    const activity = screen.getByRole('region', { name: 'Activity' })
    expect(within(activity).getByText('Balance written off')).toBeInTheDocument()
  })

  it('needs a note when the reason is Other', async () => {
    let called = false
    server.use(
      http.post(`${API}/invoices/:id/write-off`, () => {
        called = true
        return HttpResponse.json(writtenOff, { status: 201 })
      }),
    )
    renderApp({ route })

    await userEvent.click(await screen.findByRole('button', { name: /^write off$/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Write off balance' })
    await userEvent.click(within(dialog).getByLabelText(/reason/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }))
    await userEvent.click(within(dialog).getByRole('button', { name: /write off aud/i }))

    expect(await within(dialog).findByText('Say why the balance is being written off')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('writes off the small difference a payment leaves', async () => {
    let body: CreatePaymentPayload | undefined
    server.use(
      http.post(`${API}/invoices/:id/payments`, async ({ request }) => {
        body = (await request.json()) as CreatePaymentPayload
        return HttpResponse.json(sampleDetail, { status: 201 })
      }),
    )
    renderApp({ route })
    await userEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' })
    const user = userEvent.setup({ delay: null })

    // AUD 718.66 arrives against AUD 728.66: AUD 10.00 short
    const amount = within(dialog).getByLabelText(/amount received/i)
    await user.clear(amount)
    await user.type(amount, '718.66')
    await user.click(within(dialog).getByLabelText(/write off the remaining aud 10\.00/i))

    const summary = within(dialog).getByRole('region', { name: 'Payment summary' })
    expect(summary).toHaveTextContent('Written offAUD 10.00')
    expect(summary).toHaveTextContent('marks the invoice Paid')

    // a reason is required
    await user.click(within(dialog).getByRole('button', { name: /save payment/i }))
    expect(await within(dialog).findByText('Choose why the difference is written off')).toBeInTheDocument()

    await user.click(within(dialog).getByLabelText(/write-off reason/i))
    await user.click(await screen.findByRole('option', { name: 'Bank charges' }))
    await user.type(within(dialog).getByLabelText(/write-off note/i), 'Intermediary bank fee')
    await user.click(within(dialog).getByRole('button', { name: /save payment/i }))

    await waitFor(() =>
      expect(body).toMatchObject({
        amountReceived: 718.66,
        writeOffRest: true,
        writeOffReason: 'BankCharges',
        writeOffNote: 'Intermediary bank fee',
      }),
    )
  })

  it('only offers the write-off when the payment leaves something unpaid', async () => {
    let body: CreatePaymentPayload | undefined
    server.use(
      http.post(`${API}/invoices/:id/payments`, async ({ request }) => {
        body = (await request.json()) as CreatePaymentPayload
        return HttpResponse.json(sampleDetail, { status: 201 })
      }),
    )
    renderApp({ route })
    await userEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' })

    // the full balance is filled in by default
    expect(within(dialog).queryByLabelText(/write off the remaining/i)).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /save payment/i }))

    await waitFor(() => expect(body).toBeDefined())
    expect(body).not.toHaveProperty('writeOffRest')
  })

  it('lists written-off invoices under their own tab', async () => {
    renderApp({ route: '/invoices' })

    expect(await screen.findByRole('tab', { name: /written off/i })).toBeInTheDocument()
  })
})
