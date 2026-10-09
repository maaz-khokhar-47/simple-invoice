import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export interface LineInput {
  quantity: number;
  rate: number | string | Decimal;
}

export interface AmountsInput {
  items: LineInput[];
  /** Percentage, e.g. 10 for 10% */
  taxRate: number | string | Decimal;
  /** Flat amount taken off after tax */
  discount?: number | string | Decimal;
  totalPaid?: number | string | Decimal;
}

export interface InvoiceAmounts {
  subTotal: Decimal;
  totalTax: Decimal;
  totalDiscount: Decimal;
  totalAmount: Decimal;
  totalPaid: Decimal;
  balanceAmount: Decimal;
}

const money = (value: Decimal) =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 *   subTotal      = sum(quantity * rate)
 *   totalTax      = subTotal * taxRate / 100
 *   totalAmount   = subTotal + totalTax - discount
 *   balanceAmount = totalAmount - totalPaid
 *
 * Done with Decimal rather than JS numbers so we don't get 0.1 + 0.2 style errors.
 */
export function calculateInvoiceAmounts(input: AmountsInput): InvoiceAmounts {
  const subTotal = money(
    input.items.reduce(
      (sum, item) => sum.plus(new Decimal(item.rate).times(item.quantity)),
      new Decimal(0),
    ),
  );
  const totalTax = money(subTotal.times(input.taxRate).dividedBy(100));
  const totalDiscount = money(new Decimal(input.discount ?? 0));
  const totalAmount = subTotal.plus(totalTax).minus(totalDiscount);
  const totalPaid = money(new Decimal(input.totalPaid ?? 0));

  return {
    subTotal,
    totalTax,
    totalDiscount,
    totalAmount,
    totalPaid,
    balanceAmount: totalAmount.minus(totalPaid),
  };
}
