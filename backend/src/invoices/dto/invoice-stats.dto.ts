import { ApiProperty, PickType } from '@nestjs/swagger';
import { ListInvoicesQueryDto } from './list-invoices-query.dto';

/** Same search/date filters as the list, so the numbers match what the list shows. */
export class InvoiceStatsQueryDto extends PickType(ListInvoicesQueryDto, [
  'keyword',
  'fromDate',
  'toDate',
] as const) {}

export class CurrencyAmountDto {
  @ApiProperty({ example: 'AUD' })
  currency: string;

  @ApiProperty({ example: 'AU$' })
  currencySymbol: string;

  @ApiProperty({ example: 12500.5 })
  amount: number;
}

export class StatusStatsDto {
  @ApiProperty({ example: 12 })
  count: number;

  @ApiProperty({
    type: [CurrencyAmountDto],
    description:
      'Per currency, largest first. Balance owed for Draft/Pending/Overdue, invoice total for Paid, amount written off for WrittenOff.',
  })
  amounts: CurrencyAmountDto[];
}

export class InvoiceStatsDto {
  @ApiProperty({ example: 41 })
  total: number;

  @ApiProperty({ type: StatusStatsDto })
  Draft: StatusStatsDto;

  @ApiProperty({ type: StatusStatsDto })
  Pending: StatusStatsDto;

  @ApiProperty({ type: StatusStatsDto })
  Overdue: StatusStatsDto;

  @ApiProperty({ type: StatusStatsDto })
  Paid: StatusStatsDto;

  @ApiProperty({ type: StatusStatsDto })
  WrittenOff: StatusStatsDto;

  @ApiProperty({
    type: StatusStatsDto,
    description: 'Unpaid invoices due today (balance owed)',
  })
  dueToday: StatusStatsDto;

  @ApiProperty({
    type: StatusStatsDto,
    description:
      'Total outstanding receivable: balance owed on sent, unpaid invoices (Drafts excluded)',
  })
  outstanding: StatusStatsDto;
}
