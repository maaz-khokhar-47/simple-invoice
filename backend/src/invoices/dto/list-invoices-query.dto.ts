import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateOnly } from '../../common/validators/date-only';
import { IsOnOrAfter } from '../../common/validators/is-on-or-after.validator';
import { INVOICE_STATUSES, type DisplayStatus } from '../invoice-status';

export const SORTABLE_FIELDS = [
  'invoiceDate',
  'dueDate',
  'totalAmount',
] as const;
export type SortField = (typeof SORTABLE_FIELDS)[number];

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10;

  @ApiPropertyOptional({ enum: SORTABLE_FIELDS, default: 'invoiceDate' })
  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy: SortField = 'invoiceDate';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(['ASC', 'DESC'])
  ordering: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ enum: INVOICE_STATUSES })
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: DisplayStatus;

  @ApiPropertyOptional({
    description:
      'Only invoices that have been sent and are not fully paid (receivables), any due date',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  outstanding?: boolean;

  @ApiPropertyOptional({
    description: 'Only unpaid invoices whose due date is today',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  dueToday?: boolean;

  @ApiPropertyOptional({
    description:
      'Partial, case-insensitive match on invoice number or customer name',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Invoices dated on or after (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateOnly()
  fromDate?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Invoices dated on or before (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateOnly()
  @IsOnOrAfter('fromDate')
  toDate?: string;
}
