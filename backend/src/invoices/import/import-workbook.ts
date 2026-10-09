import ExcelJS from 'exceljs';
import { SUPPORTED_CURRENCIES } from '../currencies';
import {
  DATA_SHEET,
  IMPORT_COLUMNS,
  ImportColumn,
  MAX_IMPORT_ROWS,
  headerText,
  normaliseHeader,
} from './import-columns';

/** Something wrong with the file as a whole (maps to 400). */
export class ImportFileError extends Error {}

export interface ParsedRow {
  /** Row number as the user sees it in Excel */
  rowNumber: number;
  /** Shaped like the create-invoice request body, not validated yet */
  payload: Record<string, unknown>;
  /** Problems found while reading the row, e.g. an amount in the wrong currency */
  problems: string[];
}

const LAST_TEMPLATE_ROW = MAX_IMPORT_ROWS + 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Excel's serial day 25569 is 1970-01-01
const EXCEL_EPOCH_OFFSET = 25569;

// --- template ------------------------------------------------------------

export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SimpleInvoice';

  const sheet = workbook.addWorksheet(DATA_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = IMPORT_COLUMNS.map((column) => ({
    header: headerText(column),
    width: column.width,
    style:
      column.kind === 'date'
        ? { numFmt: 'yyyy-mm-dd' }
        : column.kind === 'money'
          ? { numFmt: '#,##0.00' }
          : undefined,
  }));

  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell, colNumber) => {
    const column = IMPORT_COLUMNS[colNumber - 1];
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      // required columns darker so they stand out
      fgColor: { argb: column.required ? 'FF3B5BDB' : 'FF8B9FF8' },
    };
    cell.alignment = { vertical: 'middle' };
    if (column.help) cell.note = column.help;
  });

  // In-cell checks so mistakes are caught while typing, not only on upload
  IMPORT_COLUMNS.forEach((column, i) => {
    const validation = cellValidation(column);
    if (!validation) return;
    for (let row = 2; row <= LAST_TEMPLATE_ROW; row++) {
      sheet.getCell(row, i + 1).dataValidation = validation;
    }
  });

  addInstructionsSheet(workbook);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function cellValidation(column: ImportColumn): ExcelJS.DataValidation | null {
  const common = {
    allowBlank: !column.required,
    showErrorMessage: true,
    errorTitle: column.header,
    error: column.help,
  };
  if (column.kind === 'currency') {
    return {
      ...common,
      type: 'list',
      formulae: [`"${SUPPORTED_CURRENCIES.join(',')}"`],
    };
  }
  if (column.kind === 'date') {
    return {
      ...common,
      type: 'date',
      operator: 'greaterThan',
      formulae: [new Date(Date.UTC(2000, 0, 1))],
      error: 'Enter a date, e.g. 2026-10-01',
    };
  }
  if (column.field === 'item.quantity') {
    return {
      ...common,
      type: 'whole',
      operator: 'greaterThanOrEqual',
      formulae: [1],
    };
  }
  if (column.kind === 'number' || column.kind === 'money') {
    return {
      ...common,
      type: 'decimal',
      operator: 'greaterThanOrEqual',
      formulae: [0],
    };
  }
  return null;
}

function addInstructionsSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 22 }, { width: 11 }, { width: 48 }, { width: 30 }];

  sheet.addRow(['How to import invoices']).font = { bold: true, size: 14 };
  sheet.addRow([]);
  [
    `1. Fill in one invoice per row on the "${DATA_SHEET}" sheet, starting at row 2.`,
    '2. Columns marked * are required. Leave optional cells empty if not needed.',
    '   Amounts (Rate, Discount) are in the invoice currency, given by its code in the Currency column (e.g. AUD).',
    '   Type just the number, e.g. 180 or 1,234.50 (SimpleInvoice shows it as AUD 1,234.50). Do not use symbols like $ or £.',
    `3. Up to ${MAX_IMPORT_ROWS} invoices per file. Keep the header row as it is.`,
    '4. Upload the file in SimpleInvoice. You will see every row checked before anything is saved.',
    '5. Valid rows are imported as Draft invoices; rows with problems are skipped and listed so you can fix them and upload again.',
  ].forEach((line) => sheet.addRow([line]));
  sheet.addRow([]);

  const head = sheet.addRow(['Column', 'Required', 'Rules', 'Example']);
  head.font = { bold: true };
  IMPORT_COLUMNS.forEach((column) => {
    sheet.addRow([
      column.header,
      column.required ? 'Yes' : 'No',
      column.help,
      column.example,
    ]);
  });
}

// --- parsing -------------------------------------------------------------

/** Unwraps the different shapes exceljs uses for cell values. */
type Plain = string | number | boolean | Date | undefined;

function plainValue(value: ExcelJS.CellValue): Plain {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('result' in value) return plainValue(value.result); // formula
    if ('richText' in value)
      return value.richText.map((part) => part.text).join('');
    if ('text' in value) return plainValue(value.text); // hyperlink, e.g. emails
    if ('error' in value) return String(value.error); // #REF! etc - will fail validation
    return undefined;
  }
  return value;
}

function toDateString(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    // date typed into a cell formatted as a number
    return new Date(Math.round((value - EXCEL_EPOCH_OFFSET) * MS_PER_DAY))
      .toISOString()
      .slice(0, 10);
  }
  return typeof value === 'string' ? value.trim() : value;
}

function toNumber(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const plain = trimmed.replace(/,/g, ''); // "1,234.50"
    // keep non-numbers as text so validation reports "must be a number"
    return /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : trimmed;
  }
  return value;
}

/**
 * Amounts may be typed the way the app shows them: "AUD 1,234.50" (or
 * "1,234.50 AUD"). Returns the number and the currency code if one was given.
 */
function toMoney(value: unknown): { value: unknown; code?: string } {
  if (typeof value !== 'string') return { value };
  const match = /^([A-Za-z]{3})?\s*(-?[\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})?$/.exec(
    value.trim(),
  );
  if (!match || (match[1] && match[3])) return { value: toNumber(value) };
  return {
    value: toNumber(match[2]),
    code: (match[1] ?? match[3])?.toUpperCase(),
  };
}

function convert(column: ImportColumn, raw: Plain): unknown {
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return undefined;
  }
  switch (column.kind) {
    case 'date':
      return toDateString(raw);
    case 'number':
      return toNumber(raw);
    case 'money':
      return toMoney(raw).value;
    case 'currency':
      return String(raw).trim().toUpperCase();
    default:
      return raw instanceof Date
        ? raw.toISOString().slice(0, 10)
        : String(raw).trim();
  }
}

/** Puts a value at a dotted path, mapping "item.x" onto items[0].x */
function setPath(
  target: Record<string, unknown>,
  field: string,
  value: unknown,
) {
  const [head, key] = field.split('.');
  if (!key) {
    target[head] = value;
    return;
  }
  if (head === 'item') {
    const items = (target.items ??= [{}]) as Record<string, unknown>[];
    items[0][key] = value;
    return;
  }
  const nested = (target[head] ??= {}) as Record<string, unknown>;
  nested[key] = value;
}

export async function parseImportWorkbook(
  buffer: Buffer,
): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError(
      'Could not read the file. Please upload the .xlsx template.',
    );
  }

  const sheet = workbook.getWorksheet(DATA_SHEET) ?? workbook.worksheets[0];
  if (!sheet) {
    throw new ImportFileError('The file has no sheets.');
  }

  // Find each column by its header text, so column order doesn't matter
  const positions = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    positions.set(
      normaliseHeader(String(plainValue(cell.value) ?? '')),
      colNumber,
    );
  });
  const located = IMPORT_COLUMNS.map((column) => ({
    column,
    position: positions.get(normaliseHeader(column.header)),
  }));
  const missing = located
    .filter(({ column, position }) => column.required && position === undefined)
    .map(({ column }) => column.header);
  if (missing.length) {
    throw new ImportFileError(
      `Missing column(s): ${missing.join(', ')}. Please use the template.`,
    );
  }

  const rows: ParsedRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const payload: Record<string, unknown> = {};
    const amountCodes: { column: ImportColumn; code: string }[] = [];
    let hasData = false;

    for (const { column, position } of located) {
      if (position === undefined) continue;
      const raw = plainValue(row.getCell(position).value);
      const value = convert(column, raw);
      if (value !== undefined) {
        hasData = true;
        setPath(payload, column.field, value);
      }
      const code = column.kind === 'money' ? toMoney(raw).code : undefined;
      if (code) amountCodes.push({ column, code });
    }
    if (!hasData) continue; // blank rows are fine, e.g. gaps between invoices

    // "USD 180" on an AUD invoice is almost certainly a mistake - don't guess
    const currency =
      typeof payload.currency === 'string' ? payload.currency : '';
    const problems = amountCodes
      .filter(({ code }) => code !== currency)
      .map(
        ({ column, code }) =>
          `${column.header}: written in ${code} but the invoice currency is ${currency || 'not set'}`,
      );

    if (rows.length === MAX_IMPORT_ROWS) {
      throw new ImportFileError(
        `Too many rows: up to ${MAX_IMPORT_ROWS} invoices per file.`,
      );
    }
    // Always send the nested objects so missing required fields get reported
    payload.customer ??= {};
    payload.items ??= [{}];
    rows.push({ rowNumber, payload, problems });
  }

  return rows;
}
