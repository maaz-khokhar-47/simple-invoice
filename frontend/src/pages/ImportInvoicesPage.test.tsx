import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API, server } from '../test/server'
import { renderApp } from '../test/render'
import type { ImportPreview } from '../types/invoice'

const validInvoice = (number: string) => ({
  invoiceNumber: number,
  invoiceDate: '2026-10-01',
  dueDate: '2026-10-31',
  currency: 'AUD' as const,
  customer: { fullname: 'Harbour Cafe', email: 'hello@harbourcafe.example.com' },
  items: [{ name: 'Service', quantity: 2, rate: 180 }],
  taxRate: 10,
  discount: 0,
})

const preview: ImportPreview = {
  totalRows: 3,
  validCount: 2,
  invalidCount: 1,
  rows: [
    {
      rowNumber: 2,
      valid: true,
      errors: [],
      invoice: validInvoice('IMP-1'),
      totals: { subTotal: 360, totalTax: 36, totalDiscount: 0, totalAmount: 396 },
    },
    {
      rowNumber: 3,
      valid: false,
      errors: ['Customer email: must be an email', 'Due date: must be on or after Invoice date'],
      invoice: { ...validInvoice('IMP-2'), customer: { fullname: 'Bad Row', email: 'nope' } },
      totals: null,
    },
    {
      rowNumber: 4,
      valid: true,
      errors: [],
      invoice: validInvoice('IMP-3'),
      totals: { subTotal: 360, totalTax: 36, totalDiscount: 0, totalAmount: 396 },
    },
  ],
}

const xlsx = (name = 'invoices.xlsx') =>
  new File(['fake workbook'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

async function uploadFile(file: File) {
  renderApp({ route: '/invoices/import' })
  const input = await screen.findByLabelText('Upload filled-in template')
  await userEvent.upload(input, file, { applyAccept: false })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Bulk import', () => {
  it('downloads the template', async () => {
    let downloaded = false
    server.use(
      http.get(`${API}/invoices/import/template`, () => {
        downloaded = true
        return HttpResponse.arrayBuffer(new ArrayBuffer(8))
      }),
    )
    URL.createObjectURL = vi.fn(() => 'blob:template')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderApp({ route: '/invoices/import' })

    await userEvent.click(await screen.findByRole('button', { name: /download template/i }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(downloaded).toBe(true)
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('invoice-import-template.xlsx')
  })

  it('rejects files that are not .xlsx before uploading', async () => {
    let uploaded = false
    server.use(
      http.post(`${API}/invoices/import/preview`, () => {
        uploaded = true
        return HttpResponse.json(preview)
      }),
    )
    await uploadFile(xlsx('invoices.csv'))

    expect(await screen.findByText(/Please choose an Excel \.xlsx file/)).toBeInTheDocument()
    expect(uploaded).toBe(false)
  })

  it('shows every row checked, problems first, and imports only the valid ones', async () => {
    let sent: { invoices: { invoiceNumber: string }[] } | undefined
    server.use(
      http.post(`${API}/invoices/import/preview`, () => HttpResponse.json(preview)),
      http.post(`${API}/invoices/import`, async ({ request }) => {
        sent = (await request.json()) as typeof sent
        return HttpResponse.json(
          {
            created: 2,
            invoices: [
              { invoiceId: 'a', invoiceNumber: 'IMP-1' },
              { invoiceId: 'b', invoiceNumber: 'IMP-3' },
            ],
          },
          { status: 201 },
        )
      }),
    )
    await uploadFile(xlsx())

    expect(await screen.findByText('2 ready to import')).toBeInTheDocument()
    expect(screen.getByText('1 with problems (will be skipped)')).toBeInTheDocument()

    // starts on the problem rows, with the reasons spelled out
    const table = screen.getByRole('table', { name: 'Rows in the file' })
    expect(within(table).getByText('Bad Row')).toBeInTheDocument()
    expect(within(table).getByText('Customer email: must be an email')).toBeInTheDocument()
    expect(within(table).queryByText('IMP-1')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /All 3/ }))
    expect(within(table).getByText('IMP-1')).toBeInTheDocument()

    // a row opens a preview of the invoice it will create
    await userEvent.click(within(table).getByText('IMP-1'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Ready to import as a Draft invoice.')).toBeInTheDocument()
    expect(within(dialog).getByText('AUD 396.00')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Import 2 invoices as Draft' }))

    expect(await screen.findByText('Imported 2 invoices as Draft')).toBeInTheDocument()
    expect(screen.getByText(/1 row was skipped \(row 3\)/)).toBeInTheDocument()
    expect(sent?.invoices.map((invoice) => invoice.invoiceNumber)).toEqual(['IMP-1', 'IMP-3'])
    expect(screen.getByRole('link', { name: 'View drafts' })).toHaveAttribute('href', '/invoices?status=Draft')
  })

  it('explains problems with the file itself', async () => {
    server.use(
      http.post(`${API}/invoices/import/preview`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'Missing column(s): Invoice date. Please use the template.',
            error: 'Bad Request',
          },
          { status: 400 },
        ),
      ),
    )
    await uploadFile(xlsx())

    expect(await screen.findByText('Missing column(s): Invoice date. Please use the template.')).toBeInTheDocument()
  })

  it('keeps the review open if the import is refused', async () => {
    server.use(
      http.post(`${API}/invoices/import/preview`, () => HttpResponse.json(preview)),
      http.post(`${API}/invoices/import`, () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Invoice numbers already exist: IMP-1', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    )
    await uploadFile(xlsx())

    await userEvent.click(await screen.findByRole('button', { name: 'Import 2 invoices as Draft' }))

    expect(await screen.findByText(/Invoice numbers already exist: IMP-1/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Rows in the file' })).toBeInTheDocument()
  })

  it('cannot import when every row has problems', async () => {
    server.use(
      http.post(`${API}/invoices/import/preview`, () =>
        HttpResponse.json({ ...preview, rows: [preview.rows[1]], totalRows: 1, validCount: 0, invalidCount: 1 }),
      ),
    )
    await uploadFile(xlsx())

    expect(await screen.findByRole('button', { name: 'Nothing to import' })).toBeDisabled()
  })
})
