import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, sampleDetail, server } from '../test/server'
import { renderApp } from '../test/render'
import type { CreateInvoicePayload } from '../types/invoice'

async function fillRequiredFields() {
  const user = userEvent.setup({ delay: null })
  // Paste the longer text values: typing them key by key into this many MUI
  // fields is what made these tests slow. Typing is covered by other tests.
  const paste = async (label: RegExp, text: string) => {
    await user.click(screen.getByLabelText(label))
    await user.paste(text)
  }
  await paste(/customer name/i, 'Kang Lee')
  await paste(/customer email/i, 'kang@example.com')
  await paste(/invoice number/i, 'INV-9001')
  await user.clear(screen.getByLabelText(/invoice date/i))
  await user.type(screen.getByLabelText(/invoice date/i), '2026-10-01')
  await user.type(screen.getByLabelText(/due date/i), '2026-10-31')
  await paste(/item name/i, 'Consulting')
  await user.clear(screen.getByLabelText(/quantity/i))
  await user.type(screen.getByLabelText(/quantity/i), '3')
  await user.type(screen.getByLabelText(/rate/i), '150')
  return user
}

describe('Create invoice', () => {
  it('shows required field errors', async () => {
    renderApp({ route: '/invoices/new' })

    await userEvent.click(await screen.findByRole('button', { name: /create invoice/i }))

    expect(await screen.findByText('Customer name is required')).toBeInTheDocument()
    expect(screen.getByText('Customer email is required')).toBeInTheDocument()
    expect(screen.getByText('Invoice number is required')).toBeInTheDocument()
    expect(screen.getByText('Due date is required')).toBeInTheDocument()
    expect(screen.getByText('Item name is required')).toBeInTheDocument()
  })

  it('rejects a due date before the invoice date', async () => {
    renderApp({ route: '/invoices/new' })
    await screen.findByRole('heading', { name: 'New invoice' })
    const user = await fillRequiredFields()

    await user.clear(screen.getByLabelText(/due date/i))
    await user.type(screen.getByLabelText(/due date/i), '2026-09-01')
    await user.click(screen.getByRole('button', { name: /create invoice/i }))

    expect(await screen.findByText('Due date must be on or after the invoice date')).toBeInTheDocument()
  })

  it('shows an estimated total while typing', async () => {
    renderApp({ route: '/invoices/new' })
    await screen.findByRole('heading', { name: 'New invoice' })
    await fillRequiredFields()

    // 3 x 150 = 450, + 10% tax = 495
    expect(screen.getByTestId('estimated-total')).toHaveTextContent('495.00')
  })

  it('submits the invoice and returns to the list with a notification', async () => {
    let body: CreateInvoicePayload | undefined
    server.use(
      http.post(`${API}/invoices`, async ({ request }) => {
        body = (await request.json()) as CreateInvoicePayload
        return HttpResponse.json({ ...sampleDetail, invoiceNumber: 'INV-9001', status: 'Draft' }, { status: 201 })
      }),
    )
    renderApp({ route: '/invoices/new' })
    await screen.findByRole('heading', { name: 'New invoice' })
    const user = await fillRequiredFields()

    await user.click(screen.getByRole('button', { name: /create invoice/i }))

    expect(await screen.findByText('Invoice INV-9001 created')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/invoices$/))
    expect(body).toEqual({
      invoiceNumber: 'INV-9001',
      invoiceDate: '2026-10-01',
      dueDate: '2026-10-31',
      currency: 'AUD',
      customer: { fullname: 'Kang Lee', email: 'kang@example.com' },
      items: [{ name: 'Consulting', quantity: 3, rate: 150 }],
      taxRate: 10,
      discount: 0,
    })
  })

  it('flags a duplicate invoice number from the server', async () => {
    server.use(
      http.post(`${API}/invoices`, () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Invoice number INV-9001 already exists', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    )
    renderApp({ route: '/invoices/new' })
    await screen.findByRole('heading', { name: 'New invoice' })
    const user = await fillRequiredFields()

    await user.click(screen.getByRole('button', { name: /create invoice/i }))

    expect(await screen.findByText('This invoice number is already in use')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/invoices/new')
  })
})
