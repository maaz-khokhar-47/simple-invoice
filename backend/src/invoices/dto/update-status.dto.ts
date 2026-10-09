import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateInvoiceStatusDto {
  @ApiProperty({
    enum: InvoiceStatus,
    example: InvoiceStatus.Pending,
    description:
      'Only Draft -> Pending is allowed. Invoices become Paid by recording payments.',
  })
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;
}
