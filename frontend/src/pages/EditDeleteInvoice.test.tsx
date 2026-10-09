import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, INVOICE_DETAIL, sampleDetail, server } from '../test/server'
import { renderApp } from '../test/render'
import type { CreateInvoicePayload, InvoiceDetail } from '../types/invoice'

const draft: InvoiceDetail = {
  ...sampleDetail,
  invoiceNumber: 'INV-0042',
  invoiceDate: '2099-01-01',
  dueDate: '2099-01-31',
  status: 'Draft',
  storedStatus: 'Draft',
  totalPaid: 0,
  balanceAmount: 2180,
  payments: [],
}

function serve(invoice: InvoiceDetail) {
  server.use(http.get(INVOICE_DETAIL, () => HttpResponse.json(invoice)))
}

describe('Editing a draft', () => {
  it('only shows Edit and Delete on drafts', async () => {
    renderApp({ route: `/invoices/${sampleDetail.invoiceId}` })

    // sample invoice is Pending (shown as Overdue)
    expect(await screen.findByRole('button', { name: /record payment/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('pre-fills the form and saves the changes', async () => {
    serve(draft)
    let body: CreateInvoicePayload | undefined
    server.use(
      http.put(`${API}/invoices/:id`, async ({ request }) => {
        body = (await request.json()) as CreateInvoicePayload
        return HttpResponse.json({ ...draft, customer: { ...draft.customer, fullname: 'Paul Tan' } })
      }),
    )
    renderApp({ route: `/invoices/${draft.invoiceId}` })

    await userEvent.click(await screen.findByRole('link', { name: /edit/i }))
    expect(await screen.findByRole('heading', { name: 'Edit INV-0042' })).toBeInTheDocument()

    // existing values are filled in
    expect(screen.getByLabelText(/customer name/i)).toHaveValue('Paul')
    expect(screen.getByLabelText(/invoice number/i)).toHaveValue('INV-0042')
    expect(screen.getByLabelText(/item name/i)).toHaveValue('Honda RC150')
    expect(screen.getByLabelText(/discount/i)).toHaveValue(20)

    const name = screen.getByLabelText(/customer name/i)
    await userEvent.clear(name)
    await userEvent.type(name, 'Paul Tan')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('Invoice INV-0042 updated')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/invoices/${draft.invoiceId}`))
    expect(body).toMatchObject({
      invoiceNumber: 'INV-0042',
      customer: { fullname: 'Paul Tan', email: 'paul@101digital.io' },
      items: [{ name: 'Honda RC150', quantity: 2, rate: 1000 }],
      taxRate: 10,
      discount: 20,
    })
  })

  it('refuses to edit an invoice that has been sent', async () => {
    renderApp({ route: `/invoices/${sampleDetail.invoiceId}/edit` })

    expect(
      await screen.findByText(/has been sent \(Pending\), so it can no longer be edited/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })
})

describe('Deleting a draft', () => {
  it('asks for confirmation, deletes and returns to the list', async () => {
    serve(draft)
    let deleted = false
    server.use(
      http.delete(`${API}/invoices/:id`, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp({ route: `/invoices/${draft.invoiceId}` })

    await userEvent.click(await screen.findByRole('button', { name: /delete/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete invoice INV-0042?')).toBeInTheDocument()

    // cancelling does nothing
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleted).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Invoice INV-0042 deleted')).toBeInTheDocument()
    expect(deleted).toBe(true)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/invoices$/))
  })

  it('shows the reason when the server refuses', async () => {
    serve(draft)
    server.use(
      http.delete(`${API}/invoices/:id`, () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Only Draft invoices can be deleted (this one is Pending)', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    )
    renderApp({ route: `/invoices/${draft.invoiceId}` })

    await userEvent.click(await screen.findByRole('button', { name: /delete/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Only Draft invoices can be deleted (this one is Pending)')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/invoices/${draft.invoiceId}`)
  })
})
