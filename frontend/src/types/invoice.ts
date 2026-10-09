export const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Overdue', 'WrittenOff'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** Status as saved in the database. Overdue is only ever derived. */
export type StoredStatus = Exclude<InvoiceStatus, 'Overdue'>

export const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'SGD', 'NZD'] as const
export type Currency = (typeof CURRENCIES)[number]

export type SortField = 'invoiceDate' | 'dueDate' | 'totalAmount'
export type Ordering = 'ASC' | 'DESC'

export interface Customer {
  fullname: string
  email: string
  mobileNumber?: string
  address?: string
}

export interface InvoiceItem {
  id: string
  name: string
  quantity: number
  rate: number
}

export const PAYMENT_METHODS = ['BankTransfer', 'Cash', 'BankRemittance'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface Payment {
  id: string
  /** Settled against the invoice, in the invoice currency */
  amount: number
  method: PaymentMethod
  /** What arrived, in `currency` */
  amountReceived: number
  currency: string
  /** 1 unit of `currency` in the invoice currency */
  exchangeRate: number
  /** Tax the customer withheld (TDS/WHT), in the invoice currency */
  taxWithheld: number
  paidAt: string
  note: string | null
  createdAt: string
}

/** Writing off the whole rest of the balance */
export const BALANCE_WRITE_OFF_REASONS = ['BadDebt', 'Dispute', 'Other'] as const
/** Writing off the small gap a payment leaves */
export const SHORTFALL_WRITE_OFF_REASONS = [
  'BankCharges',
  'ExchangeDifference',
  'Rounding',
  'SettlementDiscount',
  'Other',
] as const
export type WriteOffReason =
  | (typeof BALANCE_WRITE_OFF_REASONS)[number]
  | (typeof SHORTFALL_WRITE_OFF_REASONS)[number]

export interface WriteOff {
  id: string
  /** In the invoice currency */
  amount: number
  reason: WriteOffReason
  note: string | null
  writtenOffAt: string
  /** The payment that left this gap; null when the rest of the balance was written off */
  paymentId: string | null
  createdAt: string
}

export interface InvoiceSummary {
  invoiceId: string
  invoiceNumber: string
  invoiceReference: string | null
  invoiceDate: string
  dueDate: string
  currency: string
  currencySymbol: string
  status: InvoiceStatus
  customer: Customer
  totalAmount: number
  balanceAmount: number
}

export interface InvoiceDetail extends InvoiceSummary {
  description: string | null
  taxRate: number
  invoiceSubTotal: number
  totalTax: number
  totalDiscount: number
  totalPaid: number
  /** Never collected: bad debt, bank charges... */
  totalWrittenOff: number
  storedStatus: StoredStatus
  /** When it was marked as sent; null for Drafts */
  sentAt: string | null
  items: InvoiceItem[]
  payments: Payment[]
  writeOffs: WriteOff[]
  createdBy: string
  createdAt: string
}

export interface Paged<T> {
  data: T[]
  paging: { page: number; pageSize: number; total: number }
}

export interface InvoiceListParams {
  page: number
  pageSize: number
  sortBy: SortField
  ordering: Ordering
  status?: InvoiceStatus
  keyword?: string
  fromDate?: string
  toDate?: string
  /** Only unpaid invoices due today */
  dueToday?: boolean
  /** Only sent, unpaid invoices (receivables), any due date */
  outstanding?: boolean
}

export interface CreateInvoicePayload {
  invoiceNumber: string
  invoiceReference?: string
  invoiceDate: string
  dueDate: string
  currency: Currency
  description?: string
  customer: Customer
  items: { name: string; quantity: number; rate: number }[]
  taxRate: number
  discount: number
}

export interface CreatePaymentPayload {
  method: PaymentMethod
  amountReceived: number
  /** Defaults to the invoice currency */
  currency?: string
  /** Required when `currency` differs from the invoice currency */
  exchangeRate?: number
  taxWithheld: number
  paidAt: string
  note?: string
  /** Write off what this payment leaves unpaid and close the invoice as Paid */
  writeOffRest?: boolean
  writeOffReason?: (typeof SHORTFALL_WRITE_OFF_REASONS)[number]
  writeOffNote?: string
}

export interface WriteOffPayload {
  reason: (typeof BALANCE_WRITE_OFF_REASONS)[number]
  writtenOffAt: string
  note?: string
}

export interface CurrencyAmount {
  currency: string
  currencySymbol: string
  amount: number
}

export interface StatusStats {
  count: number
  /** Per currency, largest first */
  amounts: CurrencyAmount[]
}

export type InvoiceStats = { total: number; dueToday: StatusStats; outstanding: StatusStats } & Record<
  InvoiceStatus,
  StatusStats
>

export type InvoiceStatsFilters = Pick<InvoiceListParams, 'keyword' | 'fromDate' | 'toDate'>

/** A customer from a previous invoice, for autofilling the form */
export interface CustomerSuggestion {
  fullname: string
  email: string
  mobileNumber: string | null
  address: string | null
}

export interface ImportPreviewRow {
  /** Row number in the spreadsheet */
  rowNumber: number
  valid: boolean
  errors: string[]
  /** Cleaned-up row, ready to send back for import when valid */
  invoice: Partial<CreateInvoicePayload>
  totals: { subTotal: number; totalTax: number; totalDiscount: number; totalAmount: number } | null
}

export interface ImportPreview {
  totalRows: number
  validCount: number
  invalidCount: number
  rows: ImportPreviewRow[]
}

export interface ImportResult {
  created: number
  invoices: { invoiceId: string; invoiceNumber: string }[]
}
