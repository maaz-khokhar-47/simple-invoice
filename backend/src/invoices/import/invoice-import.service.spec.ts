import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../database/prisma.service';
import { InvoicesService } from '../invoices.service';
import { IMPORT_COLUMNS } from './import-columns';
import { InvoiceImportService } from './invoice-import.service';

const HEADERS = IMPORT_COLUMNS.map((c) => c.header);

const row = (values: Record<string, ExcelJS.CellValue>) =>
  IMPORT_COLUMNS.map((column) => values[column.header] ?? null);

const good = (number: string, extra: Record<string, ExcelJS.CellValue> = {}) =>
  row({
    'Invoice number': number,
    'Invoice date': '2026-10-01',
    'Due date': '2026-10-31',
    Currency: 'AUD',
    'Customer name': 'Harbour Cafe',
    'Customer email': 'hello@harbourcafe.example.com',
    'Item name': 'Service',
    Quantity: 2,
    Rate: 180,
    ...extra,
  });

async function file(rows: ExcelJS.CellValue[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invoices');
  sheet.addRow(HEADERS);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('InvoiceImportService.preview', () => {
  let service: InvoiceImportService;
  let findMany: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    service = new InvoiceImportService(
      { invoice: { findMany } } as unknown as PrismaService,
      {} as InvoicesService,
    );
  });

  it('accepts a valid row and works out its totals', async () => {
    const result = await service.preview(
      await file([good('INV-1', { Discount: 10 })]),
    );

    expect(result).toMatchObject({
      totalRows: 1,
      validCount: 1,
      invalidCount: 0,
    });
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      valid: true,
      errors: [],
      // 360 + 10% tax - 10 discount
      totals: {
        subTotal: 360,
        totalTax: 36,
        totalDiscount: 10,
        totalAmount: 386,
      },
      // defaults applied, ready to send to POST /invoices/import
      invoice: { invoiceNumber: 'INV-1', taxRate: 10, discount: 10 },
    });
  });

  it('reports problems per column in plain language', async () => {
    const result = await service.preview(
      await file([
        good('INV-1', {
          'Customer email': 'not-an-email',
          'Due date': '2026-09-01',
          Quantity: 1.5,
          'Item name': null,
        }),
      ]),
    );

    const [r] = result.rows;
    expect(r.valid).toBe(false);
    expect(r.totals).toBeNull();
    // a blank required cell gives one message, not one per rule
    expect(r.errors.filter((e) => e.startsWith('Item name'))).toEqual([
      'Item name: is required',
    ]);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'Customer email: must be an email',
        'Due date: must be on or after Invoice date',
        'Quantity: must be an integer number',
        'Item name: is required',
      ]),
    );
  });

  it('flags invoice numbers repeated in the file or already used', async () => {
    findMany.mockResolvedValue([{ invoiceNumber: 'INV-OLD' }]);
    const result = await service.preview(
      await file([good('INV-1'), good('INV-1'), good('INV-OLD')]),
    );

    expect(result.rows.map((r) => r.errors)).toEqual([
      [],
      ['Invoice number: INV-1 is also used on row 2'],
      ['Invoice number: INV-OLD already exists'],
    ]);
    expect(result).toMatchObject({ validCount: 1, invalidCount: 2 });
  });

  it('rejects a discount bigger than the total', async () => {
    const result = await service.preview(
      await file([good('INV-1', { Discount: 5000 })]),
    );
    expect(result.rows[0].errors).toEqual([
      'Discount: cannot be greater than subtotal plus tax',
    ]);
  });

  it('returns 400 for an empty file', async () => {
    await expect(service.preview(await file([]))).rejects.toThrow(
      new BadRequestException(
        'The file has no invoices. Fill in at least one row below the headers.',
      ),
    );
  });
});
