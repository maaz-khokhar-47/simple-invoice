import { InvoiceDetailDto } from './dto/invoice-response.dto';
import { InvoiceIssuer, renderInvoicePdf } from './invoice-pdf';

const paidInvoice: InvoiceDetailDto = {
  invoiceId: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
  invoiceNumber: 'IV1780488206995',
  invoiceReference: '#5721662',
  invoiceDate: '2026-06-03',
  dueDate: '2026-07-03',
  currency: 'GBP',
  currencySymbol: '£',
  status: 'Paid',
  storedStatus: 'Paid',
  sentAt: '2026-06-03T14:30:00.000Z',
  customer: { fullname: 'Paul', email: 'paul@101digital.io' },
  description: null,
  taxRate: 10,
  invoiceSubTotal: 2000,
  totalTax: 200,
  totalDiscount: 20,
  totalAmount: 2180,
  totalPaid: 2179.99,
  totalWrittenOff: 0.01,
  balanceAmount: 0,
  items: [{ id: 'i1', name: 'Honda RC150', quantity: 2, rate: 1000 }],
  payments: [
    {
      id: 'p1',
      amount: 2179.99,
      method: 'BankRemittance',
      amountReceived: 1434.2,
      currency: 'USD',
      exchangeRate: 1.52,
      taxWithheld: 0.01,
      paidAt: '2026-06-20',
      note: null,
      createdAt: '2026-06-20T00:00:00.000Z',
    },
  ],
  writeOffs: [
    {
      id: 'w1',
      amount: 0.01,
      reason: 'Rounding',
      note: null,
      writtenOffAt: '2026-06-20',
      paymentId: 'p1',
      createdAt: '2026-06-20T00:00:00.000Z',
    },
  ],
  createdBy: 'ad1e0902-1928-4345-b513-60c86c94fc91',
  createdAt: '2026-06-03T12:03:26.995Z',
};

const issuer: InvoiceIssuer = {
  name: 'Brightline Studio Pty Ltd',
  address: 'Level 4, 120 Collins Street\nMelbourne VIC 3000',
  email: 'billing@brightline.example',
  taxId: 'ABN 12 345 678 901',
  paymentDetails: 'BSB 062-000, Account 1234 5678',
};

describe('renderInvoicePdf', () => {
  it('produces a PDF document', async () => {
    const pdf = await renderInvoicePdf(paidInvoice, issuer);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
