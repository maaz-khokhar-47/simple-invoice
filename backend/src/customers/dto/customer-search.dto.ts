import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CustomerSearchQueryDto {
  @ApiPropertyOptional({
    description: 'Partial, case-insensitive match on name or email',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  keyword?: string;
}

export class CustomerSuggestionDto {
  @ApiProperty({ example: 'Paul' })
  fullname: string;

  @ApiProperty({ example: 'paul@101digital.io' })
  email: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  mobileNumber: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  address: string | null;
}
