import type { ReactNode } from 'react'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import SendIcon from '@mui/icons-material/SendOutlined'
import PaymentsIcon from '@mui/icons-material/PaymentsOutlined'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import MoneyOffIcon from '@mui/icons-material/MoneyOff'
import dayjs from 'dayjs'
import type { InvoiceDetail } from '../../types/invoice'
import { formatMoney, paymentMethodLabel, writeOffReasonLabel } from '../../utils/format'

export type Tone = 'neutral' | 'primary' | 'success' | 'error'

export interface ActivityEvent {
  key: string
  date: string
  /** Date-only events (payments, due dates) don't show a time */
  hasTime: boolean
  /** Where the event sorts, when that differs from the date it shows */
  sortDate?: string
  title: string
  detail?: string
  icon: ReactNode
  tone: Tone
}

/** Builds the invoice's history from data it already has. */
export function buildActivity(invoice: InvoiceDetail): ActivityEvent[] {
  const money = (amount: number) => formatMoney(amount, invoice.currency)
  // payments and write-offs can be backdated, but nothing happened before the invoice went out
  const notBeforeSent = (date: string) =>
    invoice.sentAt && dayjs(date).isBefore(invoice.sentAt, 'day') ? invoice.sentAt : date
  const events: ActivityEvent[] = [
    {
      key: 'created',
      date: invoice.createdAt,
      hasTime: true,
      title: 'Invoice created',
      detail: `${money(invoice.totalAmount)} draft`,
      icon: <AddCircleOutlineIcon fontSize="small" />,
      tone: 'neutral',
    },
  ]

  if (invoice.sentAt) {
    events.push({
      key: 'sent',
      date: invoice.sentAt,
      hasTime: true,
      title: 'Marked as sent',
      detail: `Due ${dayjs(invoice.dueDate).format('D MMM YYYY')}`,
      icon: <SendIcon fontSize="small" />,
      tone: 'primary',
    })
  }

  if (invoice.status === 'Overdue') {
    events.push({
      key: 'overdue',
      date: dayjs(invoice.dueDate).add(1, 'day').format('YYYY-MM-DD'),
      hasTime: false,
      title: 'Became overdue',
      detail: `${money(invoice.balanceAmount)} still owed`,
      icon: <ErrorOutlineIcon fontSize="small" />,
      tone: 'error',
    })
  }

  invoice.payments.forEach((payment, i) => {
    const isFinal = invoice.storedStatus === 'Paid' && i === invoice.payments.length - 1
    const shortPaid = invoice.writeOffs.some((w) => w.paymentId === payment.id)
    events.push({
      key: payment.id,
      date: payment.paidAt,
      sortDate: notBeforeSent(payment.paidAt),
      hasTime: false,
      title: isFinal ? (shortPaid ? 'Final payment' : 'Paid in full') : 'Payment received',
      detail: [
        money(payment.amount),
        paymentMethodLabel(payment.method),
        payment.currency !== invoice.currency
          ? `received ${formatMoney(payment.amountReceived, payment.currency)} at ${payment.exchangeRate}`
          : null,
        payment.taxWithheld > 0 ? `incl. ${money(payment.taxWithheld)} tax withheld` : null,
        payment.note,
      ]
        .filter(Boolean)
        .join(' · '),
      icon: isFinal ? <TaskAltIcon fontSize="small" /> : <PaymentsIcon fontSize="small" />,
      tone: 'success',
    })
  })

  invoice.writeOffs.forEach((writeOff) => {
    events.push({
      key: writeOff.id,
      date: writeOff.writtenOffAt,
      sortDate: notBeforeSent(writeOff.writtenOffAt),
      hasTime: false,
      title: writeOff.paymentId ? 'Difference written off' : 'Balance written off',
      detail: [money(writeOff.amount), writeOffReasonLabel(writeOff.reason), writeOff.note]
        .filter(Boolean)
        .join(' · '),
      icon: <MoneyOffIcon fontSize="small" />,
      tone: writeOff.paymentId ? 'neutral' : 'error',
    })
  })

  // Oldest first; on the same day keep the order above (e.g. sent before paid)
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => sortDay(a.event).diff(sortDay(b.event)) || a.index - b.index)
    .map(({ event }) => event)
}

function sortDay(event: ActivityEvent) {
  return dayjs(event.sortDate ?? event.date).startOf('day')
}
