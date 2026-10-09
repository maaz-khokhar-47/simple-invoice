import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsInt()
  @Min(60)
  JWT_EXPIRES_IN: number = 3600;

  @IsInt()
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  // the business sending invoices, printed in the PDF's "From" block
  @IsOptional()
  @IsString()
  COMPANY_NAME?: string;

  @IsOptional()
  @IsString()
  COMPANY_ADDRESS?: string;

  @IsOptional()
  @IsString()
  COMPANY_EMAIL?: string;

  @IsOptional()
  @IsString()
  COMPANY_PHONE?: string;

  @IsOptional()
  @IsString()
  COMPANY_TAX_ID?: string;

  @IsOptional()
  @IsString()
  COMPANY_PAYMENT_DETAILS?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return env;
}
