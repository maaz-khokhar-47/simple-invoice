import { InvoiceStatus } from '@prisma/client';
import {
  deriveStatus,
  dueTodayFilter,
  outstandingFilter,
  startOfTodayUtc,
  statusFilter,
} from './invoice-status';

const today = new Date('2026-10-08T00:00:00Z');
const yesterday = new Date('2026-10-07T00:00:00Z');
const tomorrow = new Date('2026-10-09T00:00:00Z');

describe('deriveStatus', () => {
  it.each([InvoiceStatus.Draft, InvoiceStatus.Pending])(
    'returns Overdue for a %s invoice past its due date',
    (status) => {
      expect(deriveStatus(status, yesterday, today)).toBe('Overdue');
    },
  );

  it('never marks a Paid invoice as Overdue', () => {
    expect(deriveStatus(InvoiceStatus.Paid, yesterday, today)).toBe('Paid');
  });

  it('never marks a written-off invoice as Overdue', () => {
    expect(deriveStatus(InvoiceStatus.WrittenOff, yesterday, today)).toBe(
      'WrittenOff',
    );
  });

  it('is not overdue on the due date itself', () => {
    expect(deriveStatus(InvoiceStatus.Pending, today, today)).toBe('Pending');
  });

  it('keeps the stored status when the due date is in the future', () => {
    expect(deriveStatus(InvoiceStatus.Draft, tomorrow, today)).toBe('Draft');
  });
});

describe('statusFilter', () => {
  it('Overdue means not paid and due before today', () => {
    expect(statusFilter('Overdue', today)).toEqual({
      status: { notIn: [InvoiceStatus.Paid, InvoiceStatus.WrittenOff] },
      dueDate: { lt: today },
    });
  });

  it('Pending leaves out invoices that would show as Overdue', () => {
    expect(statusFilter('Pending', today)).toEqual({
      status: 'Pending',
      dueDate: { gte: today },
    });
  });

  it('Paid ignores the due date', () => {
    expect(statusFilter('Paid', today)).toEqual({
      status: InvoiceStatus.Paid,
    });
  });
});

describe('startOfTodayUtc', () => {
  it('drops the time part', () => {
    const result = startOfTodayUtc(new Date('2026-10-08T23:59:59.999Z'));
    expect(result.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });
});

describe('dueTodayFilter', () => {
  it('matches unpaid invoices due exactly today', () => {
    expect(dueTodayFilter(today)).toEqual({
      status: { notIn: [InvoiceStatus.Paid, InvoiceStatus.WrittenOff] },
      dueDate: today,
    });
  });

  it('agrees with deriveStatus: due today is not Overdue yet', () => {
    expect(deriveStatus(InvoiceStatus.Pending, today, today)).toBe('Pending');
  });
});

describe('outstandingFilter', () => {
  it('counts sent, unpaid invoices of any due date but no Drafts', () => {
    expect(outstandingFilter()).toEqual({ status: InvoiceStatus.Pending });
  });
});
