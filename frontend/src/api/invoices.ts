import type {
  CreateInvoicePayload,
  CreatePaymentPayload,
  WriteOffPayload,
  CustomerSuggestion,
  ImportPreview,
  ImportResult,
  InvoiceDetail,
  InvoiceListParams,
  InvoiceStats,
  InvoiceStatsFilters,
  InvoiceSummary,
  Paged,
  StoredStatus,
} from '../types/invoice'
import { api } from './client'

export async function fetchInvoices(params: InvoiceListParams) {
  const { data } = await api.get<Paged<InvoiceSummary>>('/invoices', { params })
  return data
}

export async function fetchInvoiceStats(filters: InvoiceStatsFilters) {
  const { data } = await api.get<InvoiceStats>('/invoices/stats', { params: filters })
  return data
}

export async function fetchInvoice(id: string) {
  const { data } = await api.get<InvoiceDetail>(`/invoices/${id}`)
  return data
}

export async function createInvoice(payload: CreateInvoicePayload) {
  const { data } = await api.post<InvoiceDetail>('/invoices', payload)
  return data
}

export async function updateInvoiceStatus(id: string, status: StoredStatus) {
  const { data } = await api.patch<InvoiceDetail>(`/invoices/${id}/status`, { status })
  return data
}

export async function recordPayment(id: string, payload: CreatePaymentPayload) {
  const { data } = await api.post<InvoiceDetail>(`/invoices/${id}/payments`, payload)
  return data
}

export async function writeOffInvoice(id: string, payload: WriteOffPayload) {
  const { data } = await api.post<InvoiceDetail>(`/invoices/${id}/write-off`, payload)
  return data
}

export async function updateInvoice(id: string, payload: CreateInvoicePayload) {
  const { data } = await api.put<InvoiceDetail>(`/invoices/${id}`, payload)
  return data
}

export async function deleteInvoice(id: string) {
  await api.delete(`/invoices/${id}`)
}

/** Hands a downloaded file to the browser to save. */
function saveFile(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// Files are fetched through the API client because the endpoints need the auth header

export async function downloadInvoicePdf(id: string, invoiceNumber: string) {
  const { data } = await api.get<Blob>(`/invoices/${id}/pdf`, { responseType: 'blob' })
  saveFile(data, `invoice-${invoiceNumber}.pdf`)
}

export async function downloadImportTemplate() {
  const { data } = await api.get<Blob>('/invoices/import/template', { responseType: 'blob' })
  saveFile(data, 'invoice-import-template.xlsx')
}

/** Checks a filled-in template. Nothing is saved. */
export async function previewImport(file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<ImportPreview>('/invoices/import/preview', form)
  return data
}

/** Creates the reviewed rows as Draft invoices (all or nothing). */
export async function importInvoices(invoices: ImportPreview['rows'][number]['invoice'][]) {
  const { data } = await api.post<ImportResult>('/invoices/import', { invoices })
  return data
}

export async function fetchCustomers(keyword: string) {
  const { data } = await api.get<CustomerSuggestion[]>('/customers', { params: { keyword } })
  return data
}
