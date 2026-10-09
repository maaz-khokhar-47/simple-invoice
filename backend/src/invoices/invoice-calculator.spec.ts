import { calculateInvoiceAmounts } from './invoice-calculator';

describe('calculateInvoiceAmounts', () => {
  it('matches the sample invoice from the brief', () => {
    const result = calculateInvoiceAmounts({
      items: [{ quantity: 2, rate: 1000 }],
      taxRate: 10,
      discount: 20,
      totalPaid: 1451.34,
    });

    expect(result.subTotal.toNumber()).toBe(2000);
    expect(result.totalTax.toNumber()).toBe(200);
    expect(result.totalDiscount.toNumber()).toBe(20);
    expect(result.totalAmount.toNumber()).toBe(2180);
    expect(result.balanceAmount.toNumber()).toBe(728.66);
  });

  it('defaults discount and paid amount to zero', () => {
    const result = calculateInvoiceAmounts({
      items: [{ quantity: 3, rate: 50 }],
      taxRate: 10,
    });

    expect(result.totalDiscount.toNumber()).toBe(0);
    expect(result.totalPaid.toNumber()).toBe(0);
    expect(result.totalAmount.toNumber()).toBe(165);
    expect(result.balanceAmount.toNumber()).toBe(165);
  });

  it('handles a zero tax rate', () => {
    const result = calculateInvoiceAmounts({
      items: [{ quantity: 1, rate: 99.99 }],
      taxRate: 0,
    });

    expect(result.totalTax.toNumber()).toBe(0);
    expect(result.totalAmount.toNumber()).toBe(99.99);
  });

  it('does not suffer from floating point drift', () => {
    // 0.1 * 3 in plain JS is 0.30000000000000004
    const result = calculateInvoiceAmounts({
      items: [{ quantity: 3, rate: 0.1 }],
      taxRate: 0,
    });

    expect(result.subTotal.toString()).toBe('0.3');
  });

  it('rounds tax half up to 2 decimal places', () => {
    // 10.05 * 7.5% = 0.75375 -> 0.75
    // 10.10 * 7.5% = 0.7575  -> 0.76
    const a = calculateInvoiceAmounts({
      items: [{ quantity: 1, rate: 10.05 }],
      taxRate: 7.5,
    });
    const b = calculateInvoiceAmounts({
      items: [{ quantity: 1, rate: 10.1 }],
      taxRate: 7.5,
    });

    expect(a.totalTax.toNumber()).toBe(0.75);
    expect(b.totalTax.toNumber()).toBe(0.76);
  });

  it('sums multiple line items', () => {
    const result = calculateInvoiceAmounts({
      items: [
        { quantity: 2, rate: 100 },
        { quantity: 1, rate: 49.5 },
      ],
      taxRate: 10,
    });

    expect(result.subTotal.toNumber()).toBe(249.5);
    expect(result.totalAmount.toNumber()).toBe(274.45);
  });

  it('can produce a negative total, which the service has to reject', () => {
    const result = calculateInvoiceAmounts({
      items: [{ quantity: 1, rate: 10 }],
      taxRate: 10,
      discount: 50,
    });

    expect(result.totalAmount.isNegative()).toBe(true);
  });
});
