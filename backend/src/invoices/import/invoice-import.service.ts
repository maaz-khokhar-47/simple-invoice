import { BadRequestException, Injectable } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { calculateInvoiceAmounts } from '../invoice-calculator';
import { InvoicesService } from '../invoices.service';
import { IMPORT_COLUMNS } from './import-columns';
import {
  buildImportTemplate,
  ImportFileError,
  parseImportWorkbook,
} from './import-workbook';
import {
  ImportInvoicesDto,
  ImportPreviewDto,
  ImportPreviewRowDto,
  ImportResultDto,
} from './import.dto';

// "customer.email" -> "Customer email", "items.0.quantity" -> "Quantity"
const COLUMN_LABELS = new Map(
  IMPORT_COLUMNS.map((column) => [
    column.field.replace(/^item\./, 'items.0.'),
    column.header,
  ]),
);
const labelFor = (path: string) =>
  COLUMN_LABELS.get(path) ??
  COLUMN_LABELS.get(path.replace(/\.\d+$/, '')) ??
  path;

/** Flattens nested class-validator errors into "Column: problem" messages. */
function describeErrors(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const blank =
      error.constraints &&
      (error.value === undefined || error.value === null || error.value === '');
    if (blank) {
      // one clear message instead of "should not be empty", "must be a string", ...
      return [`${labelFor(path)}: is required`];
    }
    const own = Object.values(error.constraints ?? {}).map((message) => {
      // "email must be an email" -> "Customer email: must be an email"
      const detail = message.startsWith(`${error.property} `)
        ? message.slice(error.property.length + 1)
        : message;
      return `${labelFor(path)}: ${detail.replace('invoiceDate', 'Invoice date')}`;
    });
    return [...own, ...describeErrors(error.children ?? [], path)];
  });
}

@Injectable()
export class InvoiceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  template(): Promise<Buffer> {
    return buildImportTemplate();
  }

  /**
   * Reads the uploaded workbook and checks every row the same way POST
   * /invoices would. Nothing is saved.
   */
  async preview(buffer: Buffer): Promise<ImportPreviewDto> {
    let parsed: Awaited<ReturnType<typeof parseImportWorkbook>>;
    try {
      parsed = await parseImportWorkbook(buffer);
    } catch (err) {
      if (err instanceof ImportFileError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    if (parsed.length === 0) {
      throw new BadRequestException(
        'The file has no invoices. Fill in at least one row below the headers.',
      );
    }

    const numbers = parsed
      .map((row) => row.payload.invoiceNumber)
      .filter((n): n is string => typeof n === 'string');
    const taken = new Set(
      (
        await this.prisma.invoice.findMany({
          where: { invoiceNumber: { in: numbers } },
          select: { invoiceNumber: true },
        })
      ).map((invoice) => invoice.invoiceNumber),
    );

    const firstRowFor = new Map<string, number>();
    const rows: ImportPreviewRowDto[] = [];

    for (const { rowNumber, payload, problems } of parsed) {
      const dto = plainToInstance(CreateInvoiceDto, payload);
      const errors = [
        ...problems,
        ...describeErrors(
          await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
        ),
      ];

      const number = dto.invoiceNumber;
      if (typeof number === 'string' && number) {
        const earlier = firstRowFor.get(number);
        if (earlier !== undefined) {
          errors.push(
            `Invoice number: ${number} is also used on row ${earlier}`,
          );
        } else {
          firstRowFor.set(number, rowNumber);
        }
        if (taken.has(number)) {
          errors.push(`Invoice number: ${number} already exists`);
        }
      }

      let totals: ImportPreviewRowDto['totals'] = null;
      if (errors.length === 0) {
        const amounts = calculateInvoiceAmounts({
          items: dto.items,
          taxRate: dto.taxRate,
          discount: dto.discount,
        });
        if (amounts.totalAmount.isNegative()) {
          errors.push('Discount: cannot be greater than subtotal plus tax');
        } else {
          totals = {
            subTotal: amounts.subTotal.toNumber(),
            totalTax: amounts.totalTax.toNumber(),
            totalDiscount: amounts.totalDiscount.toNumber(),
            totalAmount: amounts.totalAmount.toNumber(),
          };
        }
      }

      rows.push({
        rowNumber,
        valid: errors.length === 0,
        errors,
        invoice: instanceToPlain(dto) as Partial<CreateInvoiceDto>,
        totals,
      });
    }

    const validCount = rows.filter((row) => row.valid).length;
    return {
      totalRows: rows.length,
      validCount,
      invalidCount: rows.length - validCount,
      rows,
    };
  }

  /** Creates the reviewed rows as Drafts, all or nothing. */
  async commit(
    dto: ImportInvoicesDto,
    userId: string,
  ): Promise<ImportResultDto> {
    const created = await this.invoices.createMany(dto.invoices, userId);
    return { created: created.length, invoices: created };
  }
}
