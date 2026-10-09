import { SUPPORTED_CURRENCIES } from '../currencies';

/** money = an amount in the row's currency (Rate, Discount) */
export type ColumnKind = 'text' | 'date' | 'number' | 'money' | 'currency';

export interface ImportColumn {
  /** Path in the create-invoice payload, e.g. "customer.email" */
  field: string;
  header: string;
  kind: ColumnKind;
  required: boolean;
  width: number;
  example: string;
  help: string;
}

/**
 * The spreadsheet layout. Both the downloadable template and the upload parser
 * are driven by this list, so they can't drift apart.
 */
export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    field: 'invoiceNumber',
    header: 'Invoice number',
    kind: 'text',
    required: true,
    width: 18,
    example: 'INV-1001',
    help: 'Must be unique, both in the file and in the system',
  },
  {
    field: 'invoiceReference',
    header: 'Reference',
    kind: 'text',
    required: false,
    width: 14,
    example: 'PO-4471',
    help: 'Optional external reference',
  },
  {
    field: 'invoiceDate',
    header: 'Invoice date',
    kind: 'date',
    required: true,
    width: 14,
    example: '2026-10-01',
    help: 'A date cell, or text as YYYY-MM-DD',
  },
  {
    field: 'dueDate',
    header: 'Due date',
    kind: 'date',
    required: true,
    width: 14,
    example: '2026-10-31',
    help: 'On or after the invoice date',
  },
  {
    field: 'currency',
    header: 'Currency',
    kind: 'currency',
    required: true,
    width: 11,
    example: 'AUD',
    help: `Currency code: ${SUPPORTED_CURRENCIES.join(', ')} (codes, not symbols like $ or £)`,
  },
  {
    field: 'description',
    header: 'Description',
    kind: 'text',
    required: false,
    width: 28,
    example: 'October support retainer',
    help: 'Optional',
  },
  {
    field: 'customer.fullname',
    header: 'Customer name',
    kind: 'text',
    required: true,
    width: 22,
    example: 'Harbour Cafe',
    help: '',
  },
  {
    field: 'customer.email',
    header: 'Customer email',
    kind: 'text',
    required: true,
    width: 28,
    example: 'hello@harbourcafe.example.com',
    help: 'A valid email address',
  },
  {
    field: 'customer.mobileNumber',
    header: 'Customer mobile',
    kind: 'text',
    required: false,
    width: 16,
    example: '6421555012',
    help: 'Optional',
  },
  {
    field: 'customer.address',
    header: 'Customer address',
    kind: 'text',
    required: false,
    width: 24,
    example: 'Auckland',
    help: 'Optional',
  },
  {
    field: 'item.name',
    header: 'Item name',
    kind: 'text',
    required: true,
    width: 24,
    example: 'Espresso machine service',
    help: 'One item per invoice',
  },
  {
    field: 'item.quantity',
    header: 'Quantity',
    kind: 'number',
    required: true,
    width: 10,
    example: '2',
    help: 'Whole number, 1 or more',
  },
  {
    field: 'item.rate',
    header: 'Rate',
    kind: 'money',
    required: true,
    width: 12,
    example: '180',
    help: 'Price per unit in the invoice currency (the code in the Currency column), more than 0, up to 2 decimals',
  },
  {
    field: 'taxRate',
    header: 'Tax %',
    kind: 'number',
    required: false,
    width: 9,
    example: '10',
    help: 'Defaults to 10 when empty',
  },
  {
    field: 'discount',
    header: 'Discount',
    kind: 'money',
    required: false,
    width: 11,
    example: '0',
    help: 'Flat amount in the invoice currency, defaults to 0 when empty',
  },
];

export const DATA_SHEET = 'Invoices';
export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Header text as shown in the template; required columns get a "*" */
export const headerText = (column: ImportColumn) =>
  column.required ? `${column.header} *` : column.header;

/** Lets users rename headers slightly ("customer email*", "Tax%") and still match */
export const normaliseHeader = (text: string) =>
  text.toLowerCase().replace(/[^a-z%]/g, '');
