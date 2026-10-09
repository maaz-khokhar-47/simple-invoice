import PDFDocument from 'pdfkit';
import {
  InvoiceDetailDto,
  PaymentDto,
  WriteOffDto,
} from './dto/invoice-response.dto';

/** The business sending the invoice ("From"), read from COMPANY_* env vars */
export interface InvoiceIssuer {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  /** Printed as given, e.g. "ABN 12 345 678 901" */
  taxId?: string;
  /** How to pay: bank, account number, reference */
  paymentDetails?: string;
}

const COLORS = {
  text: '#1a1d29',
  muted: '#5f6577',
  line: '#e4e7ee',
  band: '#f5f6fa',
  brand: '#3b5bdb',
  paid: '#15803d',
  paidBg: '#e3f4e8',
};

const PAGE_MARGIN = 50;

const amountFormat = new Intl.NumberFormat('en-AU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WRITE_OFF_REASONS: Record<WriteOffDto['reason'], string> = {
  BadDebt: 'Bad debt',
  Dispute: 'Dispute',
  BankCharges: 'Bank charges',
  ExchangeDifference: 'Exchange difference',
  Rounding: 'Rounding',
  SettlementDiscount: 'Settlement discount',
  Other: 'Other',
};

const PAYMENT_METHODS: Record<PaymentDto['method'], string> = {
  BankTransfer: 'Bank transfer',
  Cash: 'Cash',
  BankRemittance: 'Bank remittance',
};

/** "USD 500.00 at 1.52" and/or "tax withheld AUD 76.00", then the note (nbsp keeps code and amount together) */
function paymentDetail(payment: PaymentDto, invoiceCurrency: string) {
  const parts: string[] = [];
  if (payment.currency !== invoiceCurrency) {
    parts.push(
      `${payment.currency}\u00a0${amountFormat.format(payment.amountReceived)} at ${payment.exchangeRate}`,
    );
  }
  if (payment.taxWithheld > 0) {
    parts.push(
      `tax withheld ${invoiceCurrency}\u00a0${amountFormat.format(payment.taxWithheld)}`,
    );
  }
  if (payment.note) parts.push(payment.note);
  return parts.join(' · ') || '—';
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "3 Jun 2026", same as the web app. Locale formats vary ("June" vs "Oct") so it's built by hand. */
function formatDate(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Builds a one-page A4 PDF for an invoice using the built-in Helvetica font
 * (covers £ and €, so no font files are needed in the Docker image).
 */
export function renderInvoicePdf(
  invoice: InvoiceDetailDto,
  issuer: InvoiceIssuer,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    info: {
      Title: `Invoice ${invoice.invoiceNumber}`,
      Author: issuer.name,
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // "AUD 1,234.50": currency code rather than symbol, same as the web app
  const money = (amount: number) =>
    `${amount < 0 ? '-' : ''}${invoice.currency} ${amountFormat.format(Math.abs(amount))}`;
  const left = PAGE_MARGIN;
  const right = doc.page.width - PAGE_MARGIN;
  const width = right - left;
  const isPaid = invoice.storedStatus === 'Paid';
  const lastPayment = invoice.payments.at(-1);

  const rule = (y: number, from = left) =>
    doc
      .moveTo(from, y)
      .lineTo(right, y)
      .lineWidth(1)
      .strokeColor(COLORS.line)
      .stroke();
  const label = (text: string, x: number, y: number) =>
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(text.toUpperCase(), x, y, { characterSpacing: 0.5 });

  // --- header -------------------------------------------------------------
  doc.rect(0, 0, doc.page.width, 6).fill(COLORS.brand);

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(COLORS.brand)
    .text(issuer.name, left, 50, { width: width * 0.55 });
  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor(COLORS.text)
    .text('INVOICE', left, 46, { width, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text(`No. ${invoice.invoiceNumber}`, left, 76, { width, align: 'right' });

  let headerBottom = Math.max(doc.y, 92);
  if (isPaid) {
    // a status pill like the one in the web app, under the invoice number
    const pillW = 62;
    const pillH = 20;
    const pillY = 96;
    doc
      .roundedRect(right - pillW, pillY, pillW, pillH, pillH / 2)
      .fill(COLORS.paidBg);
    doc.circle(right - pillW + 13, pillY + pillH / 2, 3).fill(COLORS.paid);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLORS.paid)
      .text('PAID', right - pillW + 20, pillY + 6, {
        width: pillW - 26,
        characterSpacing: 0.5,
      });
    if (lastPayment) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(
          `${invoice.totalWrittenOff > 0 ? 'Settled' : 'Paid in full'} on ${formatDate(lastPayment.paidAt)}`,
          left,
          pillY + pillH + 5,
          { width, align: 'right' },
        );
    }
    headerBottom = doc.y;
  }

  let y = Math.max(headerBottom, 110) + 14;
  rule(y);
  y += 18;

  // --- from / bill to / details -------------------------------------------
  const gap = 24;
  const colW = (width - gap * 2) / 3;
  const cols = [left, left + colW + gap, left + (colW + gap) * 2];

  const party = (
    x: number,
    title: string,
    name: string,
    lines: (string | null | undefined)[],
  ) => {
    label(title, x, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(COLORS.text)
      .text(name, x, y + 15, { width: colW });
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted);
    for (const line of lines) {
      if (line) doc.text(line, x, doc.y + 3, { width: colW });
    }
    return doc.y;
  };

  const fromBottom = party(cols[0], 'From', issuer.name, [
    issuer.address,
    issuer.email,
    issuer.phone,
    issuer.taxId,
  ]);
  const toBottom = party(cols[1], 'Bill to', invoice.customer.fullname, [
    invoice.customer.address,
    invoice.customer.email,
    invoice.customer.mobileNumber,
  ]);

  const details: [string, string][] = [
    ['Invoice date', formatDate(invoice.invoiceDate)],
    ['Due date', formatDate(invoice.dueDate)],
    ['Reference', invoice.invoiceReference ?? '—'],
    ['Currency', invoice.currency],
  ];
  label('Invoice details', cols[2], y);
  let detailY = y + 15;
  for (const [name, text] of details) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLORS.muted)
      .text(name, cols[2], detailY);
    doc
      .fillColor(COLORS.text)
      .text(text, cols[2], detailY, { width: colW, align: 'right' });
    detailY += 15;
  }

  y = Math.max(fromBottom, toBottom, detailY) + 22;

  if (invoice.description) {
    label('Description', left, y);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(invoice.description, left, y + 13, { width });
    y = doc.y + 18;
  }

  // --- items table --------------------------------------------------------
  const itemCols = {
    item: left,
    qty: left + width * 0.55,
    rate: left + width * 0.68,
    amount: left + width * 0.82,
  };
  const amountW = width * 0.18;

  doc.rect(left, y, width, 22).fill(COLORS.band);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted);
  doc.text('ITEM', itemCols.item + 8, y + 7);
  doc.text('QTY', itemCols.qty, y + 7, { width: width * 0.12, align: 'right' });
  doc.text('RATE', itemCols.rate, y + 7, {
    width: width * 0.13,
    align: 'right',
  });
  doc.text('AMOUNT', itemCols.amount, y + 7, {
    width: amountW - 8,
    align: 'right',
  });
  y += 30;

  doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
  for (const item of invoice.items) {
    doc.text(item.name, itemCols.item + 8, y, { width: width * 0.5 });
    const rowBottom = doc.y;
    doc.text(String(item.quantity), itemCols.qty, y, {
      width: width * 0.12,
      align: 'right',
    });
    doc.text(money(item.rate), itemCols.rate, y, {
      width: width * 0.13,
      align: 'right',
    });
    doc.text(money(item.quantity * item.rate), itemCols.amount, y, {
      width: amountW - 8,
      align: 'right',
    });
    y = Math.max(rowBottom, doc.y) + 8;
    rule(y);
    y += 8;
  }

  // --- totals -------------------------------------------------------------
  const totalsX = left + width * 0.55;
  const totalsW = width * 0.45 - 8;
  const totalRow = (name: string, amount: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10);
    doc.fillColor(bold ? COLORS.text : COLORS.muted).text(name, totalsX + 8, y);
    doc
      .fillColor(COLORS.text)
      .text(amount, totalsX, y, { width: totalsW, align: 'right' });
    y += bold ? 20 : 17;
  };

  y += 6;
  totalRow('Subtotal', money(invoice.invoiceSubTotal));
  totalRow(`Tax (${invoice.taxRate}%)`, money(invoice.totalTax));
  totalRow(
    'Discount',
    invoice.totalDiscount > 0 ? money(-invoice.totalDiscount) : money(0),
  );
  rule(y - 4, totalsX);
  y += 4;
  totalRow('Total', money(invoice.totalAmount), true);
  totalRow('Amount paid', money(invoice.totalPaid));
  if (invoice.totalWrittenOff > 0) {
    totalRow('Written off', money(invoice.totalWrittenOff));
  }
  doc.rect(totalsX, y - 5, width * 0.45, 24).fill(COLORS.band);
  totalRow('Balance due', money(invoice.balanceAmount), true);

  // --- payments -----------------------------------------------------------
  // payments and write-offs in date order; a payment's write-off follows it
  const rows = [
    ...invoice.payments.map((payment) => ({
      date: payment.paidAt,
      mode: PAYMENT_METHODS[payment.method],
      detail: paymentDetail(payment, invoice.currency),
      amount: payment.amount,
    })),
    ...invoice.writeOffs.map((writeOff) => ({
      date: writeOff.writtenOffAt,
      mode: 'Written off',
      detail: [WRITE_OFF_REASONS[writeOff.reason], writeOff.note]
        .filter(Boolean)
        .join(' · '),
      amount: writeOff.amount,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length > 0) {
    y += 18;
    label(
      invoice.writeOffs.length > 0
        ? 'Payments and write-offs'
        : 'Payments received',
      left,
      y,
    );
    y += 14;
    doc.rect(left, y, width, 20).fill(COLORS.band);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted);
    doc.text('DATE', left + 8, y + 6);
    doc.text('MODE', left + 95, y + 6);
    doc.text('DETAILS', left + 205, y + 6);
    doc.text('AMOUNT', left, y + 6, { width: width - 8, align: 'right' });
    y += 28;

    doc.font('Helvetica').fontSize(9.5);
    for (const row of rows) {
      doc
        .fillColor(COLORS.text)
        .text(formatDate(row.date), left + 8, y, { width: 85 });
      doc.fillColor(COLORS.text).text(row.mode, left + 95, y, { width: 105 });
      // the detail can wrap, so the row is as tall as it is
      doc
        .fillColor(COLORS.muted)
        .text(row.detail, left + 205, y, { width: width - 205 - 100 });
      const rowBottom = doc.y;
      doc.fillColor(COLORS.text).text(money(row.amount), left, y, {
        width: width - 8,
        align: 'right',
      });
      y = Math.max(y + 15, rowBottom) + 6;
      rule(y - 3);
      y += 4;
    }
  }

  // --- how to pay ---------------------------------------------------------
  if (issuer.paymentDetails) {
    y += 16;
    label('Payment information', left, y);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLORS.text)
      .text(issuer.paymentDetails, left, y + 13, { width: width * 0.7 });
  }

  // --- footer -------------------------------------------------------------
  const footerY = doc.page.height - PAGE_MARGIN - 30;
  rule(footerY - 10);
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(COLORS.text)
    .text('Thank you for your business.', left, footerY, {
      width,
      align: 'center',
      lineBreak: false,
    });
  const contact = [issuer.name, issuer.taxId, issuer.email, issuer.phone]
    .filter(Boolean)
    .join('  ·  ');
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(contact, left, footerY + 13, {
      width,
      align: 'center',
      lineBreak: false,
    });

  doc.end();
  return done;
}
