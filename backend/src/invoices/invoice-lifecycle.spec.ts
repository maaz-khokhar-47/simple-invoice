import { InvoiceStatus, Prisma } from '@prisma/client';
import {
  applyPayment,
  assertDraft,
  assertTransition,
  InvoiceStateError,
  PaymentAmountError,
  settlePayment,
  writeOffBalance,
} from './invoice-lifecycle';

const money = (value: number) => new Prisma.Decimal(value);

const pending = (totalAmount: number, totalPaid = 0, totalWrittenOff = 0) => ({
  status: InvoiceStatus.Pending,
  totalAmount: money(totalAmount),
  totalPaid: money(totalPaid),
  totalWrittenOff: money(totalWrittenOff),
});

describe('assertTransition', () => {
  it('allows Draft -> Pending', () => {
    expect(() =>
      assertTransition(InvoiceStatus.Draft, InvoiceStatus.Pending),
    ).not.toThrow();
  });

  it.each([
    [InvoiceStatus.Pending, InvoiceStatus.Draft],
    [InvoiceStatus.Paid, InvoiceStatus.Draft],
    [InvoiceStatus.Paid, InvoiceStatus.Pending],
  ])('rejects %s -> %s', (from, to) => {
    expect(() => assertTransition(from, to)).toThrow(
      `Cannot change status from ${from} to ${to}`,
    );
  });

  it('never allows setting WrittenOff directly', () => {
    expect(() =>
      assertTransition(InvoiceStatus.Pending, InvoiceStatus.WrittenOff),
    ).toThrow('Use write-off to write an invoice off');
  });

  it('never allows setting Paid directly', () => {
    expect(() =>
      assertTransition(InvoiceStatus.Pending, InvoiceStatus.Paid),
    ).toThrow('Record a payment to mark an invoice as Paid');
    expect(() =>
      assertTransition(InvoiceStatus.Draft, InvoiceStatus.Paid),
    ).toThrow(InvoiceStateError);
  });

  it('rejects a no-op change', () => {
    expect(() =>
      assertTransition(InvoiceStatus.Pending, InvoiceStatus.Pending),
    ).toThrow('Invoice is already Pending');
  });
});

describe('applyPayment', () => {
  it('records a part payment and stays Pending', () => {
    const result = applyPayment(pending(2180), 1000);

    expect(result.totalPaid.toNumber()).toBe(1000);
    expect(result.balanceAmount.toNumber()).toBe(1180);
    expect(result.status).toBe(InvoiceStatus.Pending);
  });

  it('marks the invoice Paid when the balance reaches zero', () => {
    // the sample invoice: 2180 total, 1451.34 already paid
    const result = applyPayment(pending(2180, 1451.34), 728.66);

    expect(result.balanceAmount.toNumber()).toBe(0);
    expect(result.status).toBe(InvoiceStatus.Paid);
  });

  it('adds cents exactly', () => {
    const result = applyPayment(pending(0.3, 0.1), 0.2);
    expect(result.balanceAmount.isZero()).toBe(true);
  });

  it('rejects paying more than the balance', () => {
    expect(() => applyPayment(pending(2180, 1451.34), 728.67)).toThrow(
      new PaymentAmountError(
        'amount cannot be more than the balance of 728.66',
      ),
    );
  });

  it('rejects zero or negative amounts', () => {
    expect(() => applyPayment(pending(100), 0)).toThrow(PaymentAmountError);
    expect(() => applyPayment(pending(100), -5)).toThrow(PaymentAmountError);
  });

  it('does not accept payments on a Draft', () => {
    expect(() =>
      applyPayment({ ...pending(100), status: InvoiceStatus.Draft }, 10),
    ).toThrow(
      new InvoiceStateError(
        'Mark the invoice as sent before recording payments',
      ),
    );
  });

  it('does not accept payments on a Paid invoice', () => {
    expect(() =>
      applyPayment({ ...pending(100, 100), status: InvoiceStatus.Paid }, 10),
    ).toThrow(new InvoiceStateError('Invoice is already paid'));
  });

  it('does not accept payments on a written-off invoice', () => {
    expect(() =>
      applyPayment(
        { ...pending(100, 40, 60), status: InvoiceStatus.WrittenOff },
        10,
      ),
    ).toThrow(new InvoiceStateError('Invoice has been written off'));
  });

  it('writes off what the payment leaves and closes the invoice as Paid', () => {
    // 1000 owed, 995 arrives, 5 lost to bank charges
    const result = applyPayment(pending(1000), 995, true);

    expect(result.totalPaid.toNumber()).toBe(995);
    expect(result.writtenOff.toNumber()).toBe(5);
    expect(result.totalWrittenOff.toNumber()).toBe(5);
    expect(result.balanceAmount.toNumber()).toBe(0);
    expect(result.status).toBe(InvoiceStatus.Paid);
  });

  it('has nothing to write off when the payment covers the balance', () => {
    expect(() => applyPayment(pending(1000, 400), 600, true)).toThrow(
      PaymentAmountError,
    );
  });

  it('counts earlier write-offs in the balance', () => {
    expect(() => applyPayment(pending(100, 0, 10), 95)).toThrow(
      'amount cannot be more than the balance of 90.00',
    );
  });
});

describe('writeOffBalance', () => {
  it('writes off the rest of the balance and keeps what was paid', () => {
    const result = writeOffBalance(pending(1100, 400));

    expect(result.writtenOff.toNumber()).toBe(700);
    expect(result.totalWrittenOff.toNumber()).toBe(700);
    expect(result.balanceAmount.toNumber()).toBe(0);
    expect(result.status).toBe(InvoiceStatus.WrittenOff);
  });

  it.each([
    [InvoiceStatus.Draft, 'Mark the invoice as sent before writing it off'],
    [InvoiceStatus.Paid, 'Invoice is already paid'],
    [InvoiceStatus.WrittenOff, 'Invoice has been written off'],
  ])('is not allowed on a %s invoice', (status, message) => {
    expect(() => writeOffBalance({ ...pending(100), status })).toThrow(
      new InvoiceStateError(message),
    );
  });
});

describe('assertDraft', () => {
  it('allows editing and deleting a Draft', () => {
    expect(() => assertDraft(InvoiceStatus.Draft, 'edited')).not.toThrow();
    expect(() => assertDraft(InvoiceStatus.Draft, 'deleted')).not.toThrow();
  });

  it.each([InvoiceStatus.Pending, InvoiceStatus.Paid])(
    'blocks changes to a %s invoice',
    (status) => {
      expect(() => assertDraft(status, 'deleted')).toThrow(
        new InvoiceStateError(
          `Only Draft invoices can be deleted (this one is ${status})`,
        ),
      );
    },
  );
});

describe('settlePayment', () => {
  it('is just the amount received for a same-currency payment', () => {
    const { converted, settled } = settlePayment({
      amountReceived: 500,
      exchangeRate: 1,
      taxWithheld: 0,
    });
    expect(converted.toNumber()).toBe(500);
    expect(settled.toNumber()).toBe(500);
  });

  it('converts foreign money and adds the tax withheld', () => {
    // USD 500 at 1.52 = AUD 760, plus AUD 76 tax the customer withheld
    const { converted, settled } = settlePayment({
      amountReceived: 500,
      exchangeRate: 1.52,
      taxWithheld: 76,
    });
    expect(converted.toNumber()).toBe(760);
    expect(settled.toNumber()).toBe(836);
  });

  it('rounds the converted amount half up to cents', () => {
    // 100.01 x 1.234565 = 123.4688... -> 123.47
    const { converted } = settlePayment({
      amountReceived: 100.01,
      exchangeRate: 1.234565,
      taxWithheld: 0,
    });
    expect(converted.toString()).toBe('123.47');
  });

  it('rejects zero amounts, bad rates and negative tax', () => {
    const base = { amountReceived: 10, exchangeRate: 1, taxWithheld: 0 };
    expect(() => settlePayment({ ...base, amountReceived: 0 })).toThrow(
      PaymentAmountError,
    );
    expect(() => settlePayment({ ...base, exchangeRate: 0 })).toThrow(
      'exchangeRate must be greater than 0',
    );
    expect(() => settlePayment({ ...base, taxWithheld: -1 })).toThrow(
      'taxWithheld cannot be negative',
    );
  });
});
