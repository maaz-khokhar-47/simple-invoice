import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const res = {
    status: jest.fn<unknown, [number]>(),
    json: jest.fn<unknown, [Record<string, unknown>]>(),
  };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return {
    status: res.status.mock.calls[0][0],
    body: res.json.mock.calls[0][0],
  };
}

const prismaError = (code: string, meta: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: 'test',
    meta,
  });

describe('AllExceptionsFilter', () => {
  it('keeps the shape of HTTP errors', () => {
    expect(run(new NotFoundException('Invoice not found'))).toEqual({
      status: 404,
      body: {
        statusCode: 404,
        message: 'Invoice not found',
        error: 'Not Found',
      },
    });
  });

  it('turns a Prisma unique violation (P2002) into 409', () => {
    expect(run(prismaError('P2002', { target: ['invoice_number'] }))).toEqual({
      status: 409,
      body: {
        statusCode: 409,
        message: 'Invoice number already exists',
        error: 'Conflict',
      },
    });
  });

  it('turns a raw Postgres 23505 into 409', () => {
    expect(run(prismaError('P2010', { code: '23505' })).status).toBe(409);
    expect(
      run(Object.assign(new Error('dup'), { code: '23505' })).body,
    ).toEqual({
      statusCode: 409,
      message: 'A record with the same value already exists',
      error: 'Conflict',
    });
  });

  it('hides the details of unexpected errors', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { status, body } = run(new Error('connection refused at 10.0.0.5'));

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  });
});
