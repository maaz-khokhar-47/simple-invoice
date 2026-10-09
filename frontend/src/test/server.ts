import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { InvoiceDetail, InvoiceStats, InvoiceSummary } from '../types/invoice'

// Matches whatever origin jsdom runs on
export const API = '*/api'

/**
 * GET /invoices/:id, matched by UUID so it doesn't also catch /invoices/stats.
 */
export const INVOICE_DETAIL = /\/api\/invoices\/[0-9a-f-]{36}$/

export const testUser = { id: 'u-1', email: 'reviewer@simpleinvoice.dev', fullname: 'Reviewer' }

export const sampleInvoice: InvoiceSummary = {
  invoiceId: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
  invoiceNumber: 'IV1780488206995',
  invoiceReference: '#5721662',
  invoiceDate: '2026-06-03',
  dueDate: '2026-07-03',
  currency: 'AUD',
  currencySymbol: 'AU$',
  status: 'Overdue',
  customer: { fullname: 'Paul', email: 'paul@101digital.io' },
  totalAmount: 2180,
  balanceAmount: 728.66,
}

export const sampleDetail: InvoiceDetail = {
  ...sampleInvoice,
  description: 'Invoice is issued to Kanglee',
  taxRate: 10,
  invoiceSubTotal: 2000,
  totalTax: 200,
  totalDiscount: 20,
  totalPaid: 1451.34,
  storedStatus: 'Pending',
  sentAt: '2026-06-03T14:30:00.000Z',
  items: [{ id: 'i-1', name: 'Honda RC150', quantity: 2, rate: 1000 }],
  totalWrittenOff: 0,
  writeOffs: [],
  payments: [
    {
      id: 'p-1',
      amount: 1451.34,
      method: 'BankTransfer',
      amountReceived: 1451.34,
      currency: 'AUD',
      exchangeRate: 1,
      taxWithheld: 0,
      paidAt: '2026-06-20',
      note: 'Part payment',
      createdAt: '2026-06-20T09:00:00.000Z',
    },
  ],
  createdBy: 'u-1',
  createdAt: '2026-06-03T12:03:26.995Z',
}

const aud = (amount: number) => [{ currency: 'AUD', currencySymbol: 'AU$', amount }]

export const sampleStats: InvoiceStats = {
  total: 25,
  Draft: { count: 5, amounts: aud(4000) },
  Pending: { count: 8, amounts: [...aud(12000), { currency: 'USD', currencySymbol: 'US$', amount: 900 }] },
  Overdue: { count: 4, amounts: aud(3180.5) },
  Paid: { count: 8, amounts: aud(20500) },
  WrittenOff: { count: 0, amounts: [] },
  dueToday: { count: 2, amounts: aud(750) },
  outstanding: { count: 11, amounts: [...aud(14250), { currency: 'USD', currencySymbol: 'US$', amount: 900 }] },
}

// Default happy-path handlers; individual tests override with server.use()
export const handlers = [
  http.post(`${API}/auth/login`, () =>
    HttpResponse.json({ accessToken: 'test-token', expiresIn: 3600, user: testUser }),
  ),
  http.get(`${API}/auth/me`, () => HttpResponse.json(testUser)),
  http.get(`${API}/invoices`, () =>
    HttpResponse.json({ data: [sampleInvoice], paging: { page: 1, pageSize: 10, total: 1 } }),
  ),
  http.get(`${API}/invoices/stats`, () => HttpResponse.json(sampleStats)),
  http.get(`${API}/customers`, () => HttpResponse.json([])),
  http.get(INVOICE_DETAIL, () => HttpResponse.json(sampleDetail)),
]

export const server = setupServer(...handlers)
