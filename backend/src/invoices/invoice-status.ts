import { InvoiceStatus, Prisma } from '@prisma/client';

/** Statuses the API exposes. Overdue only exists at read time. */
export const INVOICE_STATUSES = [
  'Draft',
  'Pending',
  'Paid',
  'Overdue',
  'WrittenOff',
] as const;
export type DisplayStatus = (typeof INVOICE_STATUSES)[number];

/** Nothing more will be collected on these, so they can't become Overdue */
const CLOSED: InvoiceStatus[] = [InvoiceStatus.Paid, InvoiceStatus.WrittenOff];

/**
 * Midnight UTC for the current day. Date columns come back from Postgres as
 * UTC midnight too, so the two compare cleanly. All "today" logic runs in UTC.
 */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function deriveStatus(
  status: InvoiceStatus,
  dueDate: Date,
  today: Date,
): DisplayStatus {
  if (!CLOSED.includes(status) && dueDate < today) {
    return 'Overdue';
  }
  return status;
}

/**
 * Turns a status filter into a WHERE clause that agrees with deriveStatus().
 * e.g. filtering by Pending must not return a Pending invoice that is past
 * due, because the list would show that row as Overdue.
 */
export function statusFilter(
  status: DisplayStatus,
  today: Date,
): Prisma.InvoiceWhereInput {
  switch (status) {
    case 'Overdue':
      return { status: { notIn: CLOSED }, dueDate: { lt: today } };
    case 'Paid':
    case 'WrittenOff':
      return { status };
    default:
      return { status, dueDate: { gte: today } };
  }
}

/**
 * Unpaid invoices due today. Not Overdue yet - that starts tomorrow - so
 * these are the ones worth chasing now.
 */
export function dueTodayFilter(today: Date): Prisma.InvoiceWhereInput {
  return { status: { notIn: CLOSED }, dueDate: today };
}

/**
 * Receivables: money customers owe on invoices that have been sent and aren't
 * fully paid, whatever the due date. Drafts aren't included - they haven't
 * been sent, so nobody owes them yet. (A Pending invoice always has a balance:
 * it becomes Paid as soon as the balance reaches 0.)
 */
export function outstandingFilter(): Prisma.InvoiceWhereInput {
  return { status: InvoiceStatus.Pending };
}
