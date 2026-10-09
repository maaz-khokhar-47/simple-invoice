import dayjs from 'dayjs'
import type { InvoiceStatus, PaymentMethod, WriteOffReason } from '../types/invoice'

const amountFormat = new Intl.NumberFormat('en-AU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "AUD 1,234.50" - the currency code rather than a symbol, so AUD/USD/NZD can't be confused */
export function formatMoney(amount: number, currency: string) {
  const sign = amount < 0 ? '-' : ''
  return `${sign}${currency} ${amountFormat.format(Math.abs(amount))}`
}

export function formatDate(value: string) {
  return dayjs(value).format('D MMM YYYY')
}

export function todayIso() {
  return dayjs().format('YYYY-MM-DD')
}

/**
 * Short hint next to a due date: "Due in 3 days", "Due today", "12 days overdue".
 * Nothing for closed (paid or written-off) invoices.
 */
export function dueHint(dueDate: string, status: InvoiceStatus): string | null {
  if (status === 'Paid' || status === 'WrittenOff') return null

  const days = dayjs(dueDate).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (status === 'Overdue') {
    const late = Math.max(-days, 1)
    return `${late} day${late === 1 ? '' : 's'} overdue`
  }
  if (days <= 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BankTransfer: 'Bank transfer',
  Cash: 'Cash',
  BankRemittance: 'Bank remittance',
}

export function paymentMethodLabel(method: PaymentMethod) {
  return PAYMENT_METHOD_LABELS[method]
}

const STATUS_LABELS: Partial<Record<InvoiceStatus, string>> = { WrittenOff: 'Written off' }

export function statusLabel(status: InvoiceStatus) {
  return STATUS_LABELS[status] ?? status
}

const WRITE_OFF_REASON_LABELS: Record<WriteOffReason, string> = {
  BadDebt: 'Bad debt',
  Dispute: 'Dispute',
  BankCharges: 'Bank charges',
  ExchangeDifference: 'Exchange difference',
  Rounding: 'Rounding',
  SettlementDiscount: 'Settlement discount',
  Other: 'Other',
}

export function writeOffReasonLabel(reason: WriteOffReason) {
  return WRITE_OFF_REASON_LABELS[reason]
}
