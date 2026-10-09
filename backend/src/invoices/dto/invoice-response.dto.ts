import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, PaymentMethod, WriteOffReason } from '@prisma/client';
import { INVOICE_STATUSES, type DisplayStatus } from '../invoice-status';
import { CustomerDto } from './create-invoice.dto';

export class InvoiceItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  rate: number;
}

export class PaymentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    example: 836,
    description:
      'Settled against the invoice, in the invoice currency (amountReceived x exchangeRate + taxWithheld)',
  })
  amount: number;

  @ApiProperty({ enum: PaymentMethod })
  method: PaymentMethod;

  @ApiProperty({ example: 500, description: 'In the payment currency' })
  amountReceived: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 1.52 })
  exchangeRate: number;

  @ApiProperty({ example: 76, description: 'In the invoice currency' })
  taxWithheld: number;

  @ApiProperty({ format: 'date' })
  paidAt: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  note: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class WriteOffDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 5, description: 'In the invoice currency' })
  amount: number;

  @ApiProperty({ enum: WriteOffReason })
  reason: WriteOffReason;

  @ApiPropertyOptional({ nullable: true, type: String })
  note: string | null;

  @ApiProperty({ format: 'date' })
  writtenOffAt: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Set when the write-off covered the gap left by this payment; null when the rest of the balance was written off',
  })
  paymentId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class InvoiceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  invoiceId: string;

  @ApiProperty()
  invoiceNumber: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  invoiceReference: string | null;

  @ApiProperty({ format: 'date' })
  invoiceDate: string;

  @ApiProperty({ format: 'date' })
  dueDate: string;

  @ApiProperty({ example: 'AUD' })
  currency: string;

  @ApiProperty({ example: 'AU$' })
  currencySymbol: string;

  @ApiProperty({ enum: INVOICE_STATUSES })
  status: DisplayStatus;

  @ApiProperty({ type: CustomerDto })
  customer: CustomerDto;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  balanceAmount: number;
}

export class InvoiceDetailDto extends InvoiceSummaryDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ description: 'Tax percentage', example: 10 })
  taxRate: number;

  @ApiProperty()
  invoiceSubTotal: number;

  @ApiProperty()
  totalTax: number;

  @ApiProperty()
  totalDiscount: number;

  @ApiProperty()
  totalPaid: number;

  @ApiProperty({
    description: 'Written off (bad debt, bank charges...); never collected',
  })
  totalWrittenOff: number;

  @ApiProperty({
    enum: InvoiceStatus,
    description:
      'Status as saved, before Overdue is applied. Decides which actions are available.',
  })
  storedStatus: InvoiceStatus;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'When the invoice was marked as sent; null for Drafts',
  })
  sentAt: string | null;

  @ApiProperty({ type: [InvoiceItemDto] })
  items: InvoiceItemDto[];

  @ApiProperty({ type: [PaymentDto] })
  payments: PaymentDto[];

  @ApiProperty({ type: [WriteOffDto] })
  writeOffs: WriteOffDto[];

  @ApiProperty({ format: 'uuid' })
  createdBy: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class PagingDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 100 })
  total: number;
}

export class InvoiceListResponseDto {
  @ApiProperty({ type: [InvoiceSummaryDto] })
  data: InvoiceSummaryDto[];

  @ApiProperty({ type: PagingDto })
  paging: PagingDto;
}
