import { Invoice, InvoiceItem, Payment, WriteOff } from '@prisma/client';
import {
  InvoiceDetailDto,
  InvoiceSummaryDto,
} from './dto/invoice-response.dto';
import { deriveStatus } from './invoice-status';

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

export function toInvoiceSummary(
  invoice: Invoice,
  today: Date,
): InvoiceSummaryDto {
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceReference: invoice.invoiceReference,
    invoiceDate: toDateString(invoice.invoiceDate),
    dueDate: toDateString(invoice.dueDate),
    currency: invoice.currency,
    currencySymbol: invoice.currencySymbol,
    status: deriveStatus(invoice.status, invoice.dueDate, today),
    customer: {
      fullname: invoice.customerName,
      email: invoice.customerEmail,
      mobileNumber: invoice.customerMobile ?? undefined,
      address: invoice.customerAddress ?? undefined,
    },
    totalAmount: invoice.totalAmount.toNumber(),
    balanceAmount: invoice.balanceAmount.toNumber(),
  };
}

export type InvoiceWithRelations = Invoice & {
  items: InvoiceItem[];
  payments: Payment[];
  writeOffs: WriteOff[];
};

export function toInvoiceDetail(
  invoice: InvoiceWithRelations,
  today: Date,
): InvoiceDetailDto {
  return {
    ...toInvoiceSummary(invoice, today),
    description: invoice.description,
    taxRate: invoice.taxRate.toNumber(),
    invoiceSubTotal: invoice.subTotal.toNumber(),
    totalTax: invoice.totalTax.toNumber(),
    totalDiscount: invoice.totalDiscount.toNumber(),
    totalPaid: invoice.totalPaid.toNumber(),
    totalWrittenOff: invoice.totalWrittenOff.toNumber(),
    storedStatus: invoice.status,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    items: invoice.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      rate: item.rate.toNumber(),
    })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toNumber(),
      method: payment.method,
      amountReceived: payment.amountReceived.toNumber(),
      currency: payment.currency,
      exchangeRate: payment.exchangeRate.toNumber(),
      taxWithheld: payment.taxWithheld.toNumber(),
      paidAt: toDateString(payment.paidAt),
      note: payment.note,
      createdAt: payment.createdAt.toISOString(),
    })),
    writeOffs: invoice.writeOffs.map((writeOff) => ({
      id: writeOff.id,
      amount: writeOff.amount.toNumber(),
      reason: writeOff.reason,
      note: writeOff.note,
      writtenOffAt: toDateString(writeOff.writtenOffAt),
      paymentId: writeOff.paymentId,
      createdAt: writeOff.createdAt.toISOString(),
    })),
    createdBy: invoice.createdById,
    createdAt: invoice.createdAt.toISOString(),
  };
}
