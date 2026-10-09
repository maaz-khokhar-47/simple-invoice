import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WriteOffReason } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDateOnly } from '../../common/validators/date-only';
import { BALANCE_WRITE_OFF_REASONS } from '../invoice-lifecycle';

/** Writes off the whole remaining balance; the amount isn't sent. */
export class CreateWriteOffDto {
  @ApiProperty({
    enum: BALANCE_WRITE_OFF_REASONS,
    example: WriteOffReason.BadDebt,
  })
  @IsIn(BALANCE_WRITE_OFF_REASONS)
  reason: WriteOffReason;

  @ApiProperty({ example: '2026-10-09', format: 'date' })
  @IsDateOnly()
  writtenOffAt: string;

  @ApiPropertyOptional({
    example: 'Customer went into liquidation',
    description: 'Required when reason is Other',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
