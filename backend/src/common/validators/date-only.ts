import { applyDecorators } from '@nestjs/common';
import { IsDateString, Matches } from 'class-validator';

/** A calendar date in YYYY-MM-DD form that actually exists (no 2026-02-30). */
export function IsDateOnly() {
  return applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: '$property must be in YYYY-MM-DD format',
    }),
    IsDateString({ strict: true }),
  );
}
