import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { STATUS_CODES } from 'http';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

/** Postgres unique_violation */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Makes every error response look the same: { statusCode, message, error }.
 * Unknown errors are logged and returned as a plain 500 so internals don't leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return {
          statusCode: status,
          message: payload,
          error: STATUS_CODES[status] ?? 'Error',
        };
      }

      const { message, error } = payload as Partial<ErrorBody>;
      return {
        statusCode: status,
        message: message ?? exception.message,
        error: error ?? STATUS_CODES[status] ?? 'Error',
      };
    }

    // The services check for duplicates first; this catches the race where
    // two requests pass that check at once and the unique index rejects one.
    if (isUniqueViolation(exception)) {
      return {
        statusCode: HttpStatus.CONFLICT,
        message: duplicateMessage(exception),
        error: 'Conflict',
      };
    }

    this.logger.error(exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }
}

/**
 * Prisma reports a unique violation as P2002; a raw query surfaces the
 * Postgres code 23505 (wrapped in P2010).
 */
function isUniqueViolation(exception: unknown) {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      exception.code === 'P2002' ||
      (exception.code === 'P2010' &&
        exception.meta?.code === PG_UNIQUE_VIOLATION)
    );
  }
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

function duplicateMessage(exception: unknown) {
  const target =
    exception instanceof Prisma.PrismaClientKnownRequestError
      ? exception.meta?.target
      : undefined;
  const fields = Array.isArray(target) ? target.join(', ') : String(target);
  return /invoice_?number/i.test(fields)
    ? 'Invoice number already exists'
    : 'A record with the same value already exists';
}
