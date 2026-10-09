import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { MAX_IMPORT_ROWS } from './import-columns';

export class ImportRowTotalsDto {
  @ApiProperty() subTotal: number;
  @ApiProperty() totalTax: number;
  @ApiProperty() totalDiscount: number;
  @ApiProperty() totalAmount: number;
}

export class ImportPreviewRowDto {
  @ApiProperty({ description: 'Row number in the spreadsheet', example: 2 })
  rowNumber: number;

  @ApiProperty()
  valid: boolean;

  @ApiProperty({
    type: [String],
    example: ['Due date: must be on or after Invoice date'],
  })
  errors: string[];

  @ApiProperty({
    type: CreateInvoiceDto,
    description:
      'The row as it would be sent to POST /invoices/import (cleaned up, defaults applied)',
  })
  invoice: Partial<CreateInvoiceDto>;

  @ApiPropertyOptional({ type: ImportRowTotalsDto, nullable: true })
  totals: ImportRowTotalsDto | null;
}

export class ImportPreviewDto {
  @ApiProperty({ example: 25 })
  totalRows: number;

  @ApiProperty({ example: 23 })
  validCount: number;

  @ApiProperty({ example: 2 })
  invalidCount: number;

  @ApiProperty({ type: [ImportPreviewRowDto] })
  rows: ImportPreviewRowDto[];
}

export class ImportInvoicesDto {
  @ApiProperty({ type: [CreateInvoiceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceDto)
  invoices: CreateInvoiceDto[];
}

export class ImportedInvoiceDto {
  @ApiProperty({ format: 'uuid' }) invoiceId: string;
  @ApiProperty() invoiceNumber: string;
}

export class ImportResultDto {
  @ApiProperty({ example: 23 })
  created: number;

  @ApiProperty({ type: [ImportedInvoiceDto] })
  invoices: ImportedInvoiceDto[];
}
