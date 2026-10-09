import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { INVOICE_DETAIL, sampleInvoice, server } from '../test/server'
import { renderApp } from '../test/render'

describe('Invoice detail', () => {
  it('shows invoice, customer, item and amount information', async () => {
    renderApp({ route: `/invoices/${sampleInvoice.invoiceId}` })

    expect(await screen.findByRole('heading', { name: 'IV1780488206995' })).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('paul@101digital.io')).toBeInTheDocument()
    expect(screen.getByText('Honda RC150')).toBeInTheDocument()
    expect(screen.getByText('Tax (10%)')).toBeInTheDocument()
    expect(screen.getByText('AUD 2,000.00', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('-AUD 20.00')).toBeInTheDocument()
    expect(screen.getByText('AUD 2,180.00')).toBeInTheDocument()
    expect(screen.getByText('AUD 728.66')).toBeInTheDocument()
  })

  it('shows a friendly message for an unknown invoice', async () => {
    server.use(
      http.get(INVOICE_DETAIL, () =>
        HttpResponse.json({ statusCode: 404, message: 'Invoice not found', error: 'Not Found' }, { status: 404 }),
      ),
    )
    renderApp({ route: '/invoices/00000000-0000-4000-8000-000000000000' })

    expect(await screen.findByText('This invoice does not exist.')).toBeInTheDocument()
  })
})
