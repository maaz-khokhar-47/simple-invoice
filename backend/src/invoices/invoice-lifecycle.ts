import { InvoiceStatus, Prisma, WriteOffReason } from '@prisma/client';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** The invoice is in the wrong state for this action (maps to 409). */
export class InvoiceStateError extends Error {}

/** The payment amount itself is invalid (maps to 400). */
export class PaymentAmountError extends Error {}

/**
 * Status changes that can be made directly. Paid and WrittenOff are
 * deliberately missing: an invoice only gets there through payments or a
 * write-off that close the balance, so the status can never disagree with
 * totalPaid / totalWrittenOff / balanceAmount.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  Draft: [InvoiceStatus.Pending],
  Pending: [],
  Paid: [],
  WrittenOff: [],
};

/** Reasons for writing off the whole rest of the balance */
export const BALANCE_WRITE_OFF_REASONS: WriteOffReason[] = [
  WriteOffReason.BadDebt,
  WriteOffReason.Dispute,
  WriteOffReason.Other,
];

/** Reasons for writing off the small gap a payment leaves */
export const SHORTFALL_WRITE_OFF_REASONS: WriteOffReason[] = [
  WriteOffReason.BankCharges,
  WriteOffReason.ExchangeDifference,
  WriteOffReason.Rounding,
  WriteOffReason.SettlementDiscount,
  WriteOffReason.Other,
];

export function assertTransition(from: InvoiceStatus, to: InvoiceStatus) {
  if (from === to) {
    throw new InvoiceStateError(`Invoice is already ${from}`);
  }
  if (to === InvoiceStatus.Paid) {
    throw new InvoiceStateError('Record a payment to mark an invoice as Paid');
  }
  if (to === InvoiceStatus.WrittenOff) {
    throw new InvoiceStateError('Use write-off to write an invoice off');
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvoiceStateError(`Cannot change status from ${from} to ${to}`);
  }
}

/**
 * Only Drafts can be edited or deleted. Once an invoice has been sent the
 * customer has seen it, so it shouldn't change or disappear quietly.
 */
export function assertDraft(
  status: InvoiceStatus,
  action: 'edited' | 'deleted',
) {
  if (status !== InvoiceStatus.Draft) {
    throw new InvoiceStateError(
      `Only Draft invoices can be ${action} (this one is ${status})`,
    );
  }
}

export interface InvoiceBalance {
  status: InvoiceStatus;
  totalAmount: Decimal;
  totalPaid: Decimal;
  totalWrittenOff: Decimal;
}

export interface PaymentResult {
  totalPaid: Decimal;
  totalWrittenOff: Decimal;
  balanceAmount: Decimal;
  status: InvoiceStatus;
  /** What was written off with this payment (0 if nothing) */
  writtenOff: Decimal;
}

function balanceOf(invoice: InvoiceBalance) {
  return invoice.totalAmount
    .minus(invoice.totalPaid)
    .minus(invoice.totalWrittenOff);
}

/** Payments and write-offs are only for invoices that are sent and still open. */
function assertOpen(invoice: InvoiceBalance, action: string) {
  if (invoice.status === InvoiceStatus.Draft) {
    throw new InvoiceStateError(`Mark the invoice as sent before ${action}`);
  }
  if (invoice.status === InvoiceStatus.Paid) {
    throw new InvoiceStateError('Invoice is already paid');
  }
  if (invoice.status === InvoiceStatus.WrittenOff) {
    throw new InvoiceStateError('Invoice has been written off');
  }
}

/**
 * Works out the invoice totals after a payment, or throws if it isn't allowed.
 * With `writeOffRest`, whatever the payment leaves unpaid is written off
 * (bank charges, rounding...) and the invoice is closed as Paid.
 */
export function applyPayment(
  invoice: InvoiceBalance,
  amount: number | string | Decimal,
  writeOffRest = false,
): PaymentResult {
  assertOpen(invoice, 'recording payments');

  const payment = new Decimal(amount);
  const balance = balanceOf(invoice);
  if (payment.lte(0)) {
    throw new PaymentAmountError('amount must be greater than 0');
  }
  if (payment.gt(balance)) {
    throw new PaymentAmountError(
      `amount cannot be more than the balance of ${balance.toFixed(2)}`,
    );
  }

  const totalPaid = invoice.totalPaid.plus(payment);
  const writtenOff = writeOffRest ? balance.minus(payment) : new Decimal(0);
  if (writeOffRest && writtenOff.isZero()) {
    throw new PaymentAmountError(
      'This payment covers the whole balance, so there is nothing to write off',
    );
  }
  const totalWrittenOff = invoice.totalWrittenOff.plus(writtenOff);
  const balanceAmount = invoice.totalAmount
    .minus(totalPaid)
    .minus(totalWrittenOff);
  return {
    totalPaid,
    totalWrittenOff,
    balanceAmount,
    status: balanceAmount.isZero() ? InvoiceStatus.Paid : invoice.status,
    writtenOff,
  };
}

export interface WriteOffResult {
  totalWrittenOff: Decimal;
  balanceAmount: Decimal;
  status: InvoiceStatus;
  /** The amount written off: the whole remaining balance */
  writtenOff: Decimal;
}

/**
 * Writes off the rest of the balance as uncollectable (bad debt, dispute).
 * Payments already received stay; the invoice is closed as WrittenOff.
 */
export function writeOffBalance(invoice: InvoiceBalance): WriteOffResult {
  assertOpen(invoice, 'writing it off');
  const writtenOff = balanceOf(invoice);
  return {
    totalWrittenOff: invoice.totalWrittenOff.plus(writtenOff),
    balanceAmount: new Decimal(0),
    status: InvoiceStatus.WrittenOff,
    writtenOff,
  };
}

export interface SettlementInput {
  /** What arrived, in the payment currency */
  amountReceived: number | string | Decimal;
  /** 1 unit of the payment currency in the invoice currency (1 when the same) */
  exchangeRate: number | string | Decimal;
  /** Tax the customer withheld on our behalf (TDS/WHT), in the invoice currency */
  taxWithheld: number | string | Decimal;
}

export interface Settlement {
  /** amountReceived converted into the invoice currency */
  converted: Decimal;
  /** converted + taxWithheld: what this payment takes off the balance */
  settled: Decimal;
}

/**
 * How much of the invoice a payment settles. Money received in another
 * currency is converted at the given rate; tax the customer withheld and pays
 * to the tax office on our behalf counts towards the invoice too.
 */
export function settlePayment(input: SettlementInput): Settlement {
  const received = new Decimal(input.amountReceived);
  const rate = new Decimal(input.exchangeRate);
  const tax = new Decimal(input.taxWithheld);
  if (received.lte(0)) {
    throw new PaymentAmountError('amountReceived must be greater than 0');
  }
  if (rate.lte(0)) {
    throw new PaymentAmountError('exchangeRate must be greater than 0');
  }
  if (tax.isNegative()) {
    throw new PaymentAmountError('taxWithheld cannot be negative');
  }
  const converted = received
    .times(rate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { converted, settled: converted.plus(tax) };
}
