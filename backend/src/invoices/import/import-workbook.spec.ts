import ExcelJS from 'exceljs';
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS } from './import-columns';
import {
  buildImportTemplate,
  ImportFileError,
  parseImportWorkbook,
} from './import-workbook';

type Cell = ExcelJS.CellValue;

/** A row in template column order, keyed by header for readability */
const row = (values: Partial<Record<string, Cell>>): Cell[] =>
  IMPORT_COLUMNS.map((column) => values[column.header] ?? null);

const validRow = (overrides: Partial<Record<string, Cell>> = {}) =>
  row({
    'Invoice number': 'INV-1',
    'Invoice date': new Date(Date.UTC(2026, 9, 1)),
    'Due date': new Date(Date.UTC(2026, 9, 31)),
    Currency: 'AUD',
    'Customer name': 'Harbour Cafe',
    'Customer email': 'hello@harbourcafe.example.com',
    'Item name': 'Service',
    Quantity: 2,
    Rate: 180,
    ...overrides,
  });

async function workbookWith(
  rows: Cell[][],
  headers = IMPORT_COLUMNS.map((c) => c.header),
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invoices');
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('buildImportTemplate', () => {
  it('has every column on the Invoices sheet, required ones marked', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await buildImportTemplate()) as unknown as ArrayBuffer,
    );

    const headers = (
      workbook.getWorksheet('Invoices')!.getRow(1).values as Cell[]
    ).slice(1);
    expect(headers).toContain('Invoice number *');
    expect(headers).toContain('Reference');
    expect(headers).toHaveLength(IMPORT_COLUMNS.length);
    expect(workbook.getWorksheet('Instructions')).toBeDefined();
  });

  it('can be uploaded straight back (empty template has no rows)', async () => {
    expect(await parseImportWorkbook(await buildImportTemplate())).toEqual([]);
  });
});

describe('parseImportWorkbook', () => {
  it('turns a row into a create-invoice payload', async () => {
    const [parsed] = await parseImportWorkbook(
      await workbookWith([validRow()]),
    );

    expect(parsed).toEqual({
      rowNumber: 2,
      payload: {
        invoiceNumber: 'INV-1',
        invoiceDate: '2026-10-01',
        dueDate: '2026-10-31',
        currency: 'AUD',
        customer: {
          fullname: 'Harbour Cafe',
          email: 'hello@harbourcafe.example.com',
        },
        items: [{ name: 'Service', quantity: 2, rate: 180 }],
      },
      problems: [],
    });
  });

  it('copes with the ways Excel stores values', async () => {
    const [parsed] = await parseImportWorkbook(
      await workbookWith([
        validRow({
          // typed as text rather than a date cell
          'Invoice date': '2026-10-01',
          // Excel turns emails into hyperlinks
          'Customer email': {
            text: 'hello@harbourcafe.example.com',
            hyperlink: 'mailto:hello@harbourcafe.example.com',
          },
          // phone numbers usually end up as numbers
          'Customer mobile': 6421555012,
          // numbers typed as text, currency in lower case
          Quantity: ' 3 ',
          Currency: 'nzd',
          // formula cell: use its result
          Rate: { formula: '90*2', result: 180 },
        }),
      ]),
    );

    expect(parsed.payload).toMatchObject({
      invoiceDate: '2026-10-01',
      currency: 'NZD',
      customer: {
        email: 'hello@harbourcafe.example.com',
        mobileNumber: '6421555012',
      },
      items: [{ quantity: 3, rate: 180 }],
    });
  });

  it('accepts amounts written the way the app shows them', async () => {
    const [parsed] = await parseImportWorkbook(
      await workbookWith([
        validRow({
          Currency: 'AUD',
          Rate: 'AUD 1,234.50',
          Discount: '50.00 aud',
          Quantity: '1,000',
        }),
      ]),
    );

    expect(parsed.problems).toEqual([]);
    expect(parsed.payload).toMatchObject({
      items: [{ quantity: 1000, rate: 1234.5 }],
      discount: 50,
    });
  });

  it('flags an amount written in a different currency', async () => {
    const [parsed] = await parseImportWorkbook(
      await workbookWith([validRow({ Currency: 'AUD', Rate: 'USD 180' })]),
    );

    expect(parsed.problems).toEqual([
      'Rate: written in USD but the invoice currency is AUD',
    ]);
  });

  it('formats amount columns as money in the template', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await buildImportTemplate()) as unknown as ArrayBuffer,
    );
    const sheet = workbook.getWorksheet('Invoices')!;
    const rate = IMPORT_COLUMNS.findIndex((c) => c.header === 'Rate') + 1;
    expect(sheet.getColumn(rate).numFmt).toBe('#,##0.00');
  });

  it('skips blank rows and reports real row numbers', async () => {
    const rows = await parseImportWorkbook(
      await workbookWith([
        validRow(),
        row({}),
        validRow({ 'Invoice number': 'INV-2' }),
      ]),
    );
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it('finds columns by header, in any order', async () => {
    const headers = IMPORT_COLUMNS.map(
      (c) => `${c.header.toUpperCase()} *`,
    ).reverse();
    const [parsed] = await parseImportWorkbook(
      await workbookWith([[...validRow()].reverse()], headers),
    );
    expect(parsed.payload.invoiceNumber).toBe('INV-1');
  });

  it('leaves bad values as they are so validation can report them', async () => {
    const [parsed] = await parseImportWorkbook(
      await workbookWith([
        validRow({ Quantity: 'two', 'Due date': '31/10/2026' }),
      ]),
    );
    expect(parsed.payload).toMatchObject({
      dueDate: '31/10/2026',
      items: [{ quantity: 'two' }],
    });
  });

  it('rejects a file without the required columns', async () => {
    await expect(
      parseImportWorkbook(
        await workbookWith([], ['Invoice number', 'Something else']),
      ),
    ).rejects.toThrow(/Missing column\(s\): Invoice date, Due date/);
  });

  it(`rejects more than ${MAX_IMPORT_ROWS} invoices`, async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) =>
      validRow({ 'Invoice number': `INV-${i}` }),
    );
    await expect(parseImportWorkbook(await workbookWith(rows))).rejects.toThrow(
      ImportFileError,
    );
  });

  it('rejects files that are not spreadsheets', async () => {
    await expect(parseImportWorkbook(Buffer.from('hello'))).rejects.toThrow(
      'Could not read the file',
    );
  });
});
