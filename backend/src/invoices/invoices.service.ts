import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus, Prisma, WriteOffReason } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CURRENCY_SYMBOLS, CurrencyCode } from './currencies';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateWriteOffDto } from './dto/create-write-off.dto';
import {
  InvoiceDetailDto,
  InvoiceListResponseDto,
} from './dto/invoice-response.dto';
import {
  InvoiceStatsDto,
  InvoiceStatsQueryDto,
  StatusStatsDto,
} from './dto/invoice-stats.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-status.dto';
import { calculateInvoiceAmounts } from './invoice-calculator';
import {
  applyPayment,
  assertDraft,
  settlePayment,
  assertTransition,
  writeOffBalance,
  InvoiceStateError,
  PaymentAmountError,
} from './invoice-lifecycle';
import { toInvoiceDetail, toInvoiceSummary } from './invoice.mapper';
import { InvoiceIssuer, renderInvoicePdf } from './invoice-pdf';
import {
  DisplayStatus,
  dueTodayFilter,
  INVOICE_STATUSES,
  outstandingFilter,
  startOfTodayUtc,
  statusFilter,
} from './invoice-status';

const UNIQUE_VIOLATION = 'P2002';

const DETAIL_INCLUDE = {
  items: true,
  payments: { orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] },
  writeOffs: { orderBy: [{ writtenOffAt: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.InvoiceInclude;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListInvoicesQueryDto): Promise<InvoiceListResponseDto> {
    const today = startOfTodayUtc();
    const where = this.buildWhere(query, today);
    const { page, pageSize, sortBy, ordering } = query;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        // id as a tie-breaker keeps paging stable when sort values are equal
        orderBy: [
          { [sortBy]: ordering === 'ASC' ? 'asc' : 'desc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: rows.map((row) => toInvoiceSummary(row, today)),
      paging: { page, pageSize, total },
    };
  }

  /**
   * Count and amounts per displayed status, for the dashboard cards and tabs.
   * Uses the same status rules as the list filter, so a tab's count always
   * matches the number of rows you get when you click it.
   */
  async stats(query: InvoiceStatsQueryDto): Promise<InvoiceStatsDto> {
    const today = startOfTodayUtc();
    const base = this.buildWhere(query, today);

    const groupByCurrency = (where: Prisma.InvoiceWhereInput) =>
      this.prisma.invoice.groupBy({
        by: ['currency'],
        where: { AND: [base, where] },
        _count: { _all: true },
        _sum: { balanceAmount: true, totalAmount: true, totalWrittenOff: true },
      });

    const [groups, dueTodayRows, outstandingRows] = await Promise.all([
      Promise.all(
        INVOICE_STATUSES.map((status) =>
          groupByCurrency(statusFilter(status, today)),
        ),
      ),
      groupByCurrency(dueTodayFilter(today)),
      groupByCurrency(outstandingFilter()),
    ]);

    type Row = (typeof groups)[number][number];
    // Paid: how much was invoiced; WrittenOff: how much was lost;
    // everything else: how much is still owed
    type Amount = 'balanceAmount' | 'totalAmount' | 'totalWrittenOff';
    const summarise = (rows: Row[], field: Amount): StatusStatsDto => ({
      count: rows.reduce((sum, row) => sum + row._count._all, 0),
      amounts: rows
        .map((row) => {
          const sum = row._sum[field];
          return {
            currency: row.currency,
            currencySymbol:
              CURRENCY_SYMBOLS[row.currency as CurrencyCode] ?? row.currency,
            amount: sum?.toNumber() ?? 0,
          };
        })
        .sort((a, b) => b.amount - a.amount),
    });

    const byStatus = {} as Record<DisplayStatus, StatusStatsDto>;
    INVOICE_STATUSES.forEach((status, i) => {
      const field: Amount =
        status === 'Paid'
          ? 'totalAmount'
          : status === 'WrittenOff'
            ? 'totalWrittenOff'
            : 'balanceAmount';
      byStatus[status] = summarise(groups[i], field);
    });

    const total = INVOICE_STATUSES.reduce(
      (sum, status) => sum + byStatus[status].count,
      0,
    );
    return {
      total,
      ...byStatus,
      dueToday: summarise(dueTodayRows, 'balanceAmount'),
      outstanding: summarise(outstandingRows, 'balanceAmount'),
    };
  }

  async findOne(id: string): Promise<InvoiceDetailDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return toInvoiceDetail(invoice, startOfTodayUtc());
  }

  /** PDF copy of a paid invoice, e.g. to send to the customer as a receipt. */
  async pdf(id: string): Promise<{ filename: string; content: Buffer }> {
    const invoice = await this.findOne(id);
    if (invoice.storedStatus !== InvoiceStatus.Paid) {
      throw new ConflictException(
        'Only paid invoices can be downloaded as PDF',
      );
    }
    // keep the file name safe for the Content-Disposition header
    const safeNumber = invoice.invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_');
    return {
      filename: `invoice-${safeNumber}.pdf`,
      content: await renderInvoicePdf(invoice, this.issuer()),
    };
  }

  /** The "From" block on the PDF. Empty values are left out. */
  private issuer(): InvoiceIssuer {
    const read = (key: string) =>
      this.config.get<string>(key)?.trim() || undefined;
    return {
      name: read('COMPANY_NAME') ?? 'SimpleInvoice',
      // .env files are single line, so "\n" in the value starts a new line
      address: read('COMPANY_ADDRESS')?.replace(/\\n/g, '\n'),
      email: read('COMPANY_EMAIL'),
      phone: read('COMPANY_PHONE'),
      taxId: read('COMPANY_TAX_ID'),
      paymentDetails: read('COMPANY_PAYMENT_DETAILS')?.replace(/\\n/g, '\n'),
    };
  }

  async create(
    dto: CreateInvoiceDto,
    userId: string,
  ): Promise<InvoiceDetailDto> {
    // Friendly check first; the unique index is what actually guarantees it
    await this.ensureNumberAvailable(this.prisma, dto.invoiceNumber);
    const fields = this.toInvoiceFields(dto);

    try {
      const invoice = await this.prisma.invoice.create({
        data: {
          ...fields,
          status: InvoiceStatus.Draft,
          createdById: userId,
          items: { create: this.toItems(dto) },
        },
        include: DETAIL_INCLUDE,
      });
      return toInvoiceDetail(invoice, startOfTodayUtc());
    } catch (err) {
      this.rethrowDuplicate(err, dto.invoiceNumber);
    }
  }

  /**
   * Creates several Draft invoices at once (bulk import). All or nothing: if
   * any invoice can't be created, none are.
   */
  async createMany(
    dtos: CreateInvoiceDto[],
    userId: string,
  ): Promise<{ invoiceId: string; invoiceNumber: string }[]> {
    const numbers = dtos.map((dto) => dto.invoiceNumber);
    const repeated = [
      ...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i)),
    ];
    if (repeated.length) {
      throw new BadRequestException([
        `Invoice numbers repeated in the import: ${repeated.join(', ')}`,
      ]);
    }

    // Recalculated here rather than trusting the preview
    const rows = dtos.map((dto) => ({
      fields: this.toInvoiceFields(dto),
      items: this.toItems(dto),
    }));

    const taken = await this.prisma.invoice.findMany({
      where: { invoiceNumber: { in: numbers } },
      select: { invoiceNumber: true },
    });
    if (taken.length) {
      throw new ConflictException(
        `Invoice numbers already exist: ${taken.map((t) => t.invoiceNumber).join(', ')}`,
      );
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const created: { invoiceId: string; invoiceNumber: string }[] = [];
          for (const { fields, items } of rows) {
            const invoice = await tx.invoice.create({
              data: {
                ...fields,
                status: InvoiceStatus.Draft,
                createdById: userId,
                items: { create: items },
              },
              select: { id: true, invoiceNumber: true },
            });
            created.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
            });
          }
          return created;
        },
        // up to 200 inserts; the default 5s can be tight on a slow database
        { timeout: 30_000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'Another invoice with one of these numbers was just created. Please review the import again.',
        );
      }
      throw err;
    }
  }

  /** Replaces a Draft invoice's details. Totals are recalculated from scratch. */
  async update(id: string, dto: CreateInvoiceDto): Promise<InvoiceDetailDto> {
    const fields = this.toInvoiceFields(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Locked so it can't be marked as sent halfway through the edit
        await this.lockInvoice(tx, id);
        const current = await tx.invoice.findUniqueOrThrow({
          where: { id },
          select: { status: true },
        });
        this.runRule(() => assertDraft(current.status, 'edited'));
        await this.ensureNumberAvailable(tx, dto.invoiceNumber, id);

        const invoice = await tx.invoice.update({
          where: { id },
          data: {
            ...fields,
            items: { deleteMany: {}, create: this.toItems(dto) },
          },
          include: DETAIL_INCLUDE,
        });
        return toInvoiceDetail(invoice, startOfTodayUtc());
      });
    } catch (err) {
      this.rethrowDuplicate(err, dto.invoiceNumber);
    }
  }

  async remove(id: string): Promise<void> {
    // Delete only if it's still a Draft, in one statement so there's no race
    const { count } = await this.prisma.invoice.deleteMany({
      where: { id, status: InvoiceStatus.Draft },
    });
    if (count > 0) {
      return;
    }

    // Nothing deleted: work out why so the caller gets the right error
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    this.runRule(() => assertDraft(invoice.status, 'deleted'));
  }

  async updateStatus(
    id: string,
    dto: UpdateInvoiceStatusDto,
  ): Promise<InvoiceDetailDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    this.runRule(() => assertTransition(invoice.status, dto.status));

    // Only update if nobody changed the status since we read it
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, status: invoice.status },
      // Draft -> Pending is the only allowed change, i.e. the invoice is being sent
      data: { status: dto.status, sentAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException(
        'Invoice was changed by someone else, please reload',
      );
    }
    return this.findOne(id);
  }

  async addPayment(
    id: string,
    dto: CreatePaymentDto,
    userId: string,
  ): Promise<InvoiceDetailDto> {
    return this.prisma.$transaction(async (tx) => {
      // Locked so two payments at once can't both pass the balance check
      await this.lockInvoice(tx, id);

      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
      const paidAt = new Date(dto.paidAt);
      if (paidAt < invoice.invoiceDate) {
        throw new BadRequestException([
          'paidAt cannot be before the invoice date',
        ]);
      }
      // Money can arrive in another currency; it's converted at the given rate
      const currency = dto.currency ?? invoice.currency;
      const sameCurrency = currency === invoice.currency;
      if (
        sameCurrency &&
        dto.exchangeRate !== undefined &&
        dto.exchangeRate !== 1
      ) {
        throw new BadRequestException([
          'exchangeRate must be 1 when paying in the invoice currency',
        ]);
      }
      if (!sameCurrency && dto.exchangeRate === undefined) {
        throw new BadRequestException([
          `exchangeRate is required: the payment is in ${currency} but the invoice is in ${invoice.currency}`,
        ]);
      }
      const exchangeRate = sameCurrency ? 1 : dto.exchangeRate!;
      const writeOffReason = this.shortfallReason(dto);

      const { settled } = this.runRule(() =>
        settlePayment({
          amountReceived: dto.amountReceived,
          exchangeRate,
          taxWithheld: dto.taxWithheld,
        }),
      );
      const { writtenOff, ...result } = this.runRule(() =>
        applyPayment(invoice, settled, dto.writeOffRest),
      );

      const payment = await tx.payment.create({
        data: {
          invoiceId: id,
          amount: settled,
          method: dto.method,
          amountReceived: dto.amountReceived,
          currency,
          exchangeRate,
          taxWithheld: dto.taxWithheld,
          paidAt,
          note: dto.note,
          createdById: userId,
        },
      });
      if (writtenOff.gt(0)) {
        await tx.writeOff.create({
          data: {
            invoiceId: id,
            paymentId: payment.id,
            amount: writtenOff,
            reason: writeOffReason!,
            note: dto.writeOffNote,
            writtenOffAt: paidAt,
            createdById: userId,
          },
        });
      }
      const updated = await tx.invoice.update({
        where: { id },
        data: result,
        include: DETAIL_INCLUDE,
      });
      return toInvoiceDetail(updated, startOfTodayUtc());
    });
  }

  /** Writes off the rest of the balance as uncollectable (bad debt, dispute). */
  async writeOff(
    id: string,
    dto: CreateWriteOffDto,
    userId: string,
  ): Promise<InvoiceDetailDto> {
    if (dto.reason === WriteOffReason.Other && !dto.note) {
      throw new BadRequestException(['note is required when reason is Other']);
    }
    return this.prisma.$transaction(async (tx) => {
      // Same lock as payments, so a payment and a write-off can't race
      await this.lockInvoice(tx, id);

      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
      const writtenOffAt = new Date(dto.writtenOffAt);
      if (writtenOffAt < invoice.invoiceDate) {
        throw new BadRequestException([
          'writtenOffAt cannot be before the invoice date',
        ]);
      }
      const { writtenOff, ...result } = this.runRule(() =>
        writeOffBalance(invoice),
      );

      await tx.writeOff.create({
        data: {
          invoiceId: id,
          amount: writtenOff,
          reason: dto.reason,
          note: dto.note,
          writtenOffAt,
          createdById: userId,
        },
      });
      const updated = await tx.invoice.update({
        where: { id },
        data: result,
        include: DETAIL_INCLUDE,
      });
      return toInvoiceDetail(updated, startOfTodayUtc());
    });
  }

  /** writeOffReason (and a note for Other) is needed when writing off the rest. */
  private shortfallReason(dto: CreatePaymentDto) {
    if (!dto.writeOffRest) {
      if (dto.writeOffReason || dto.writeOffNote) {
        throw new BadRequestException([
          'writeOffReason and writeOffNote are only used with writeOffRest',
        ]);
      }
      return undefined;
    }
    if (!dto.writeOffReason) {
      throw new BadRequestException([
        'writeOffReason is required to write off the rest of the balance',
      ]);
    }
    if (dto.writeOffReason === WriteOffReason.Other && !dto.writeOffNote) {
      throw new BadRequestException([
        'writeOffNote is required when writeOffReason is Other',
      ]);
    }
    return dto.writeOffReason;
  }

  /** Maps the create/update payload to invoice columns, with server-side totals. */
  private toInvoiceFields(dto: CreateInvoiceDto) {
    const amounts = calculateInvoiceAmounts({
      items: dto.items,
      taxRate: dto.taxRate,
      discount: dto.discount,
    });
    if (amounts.totalAmount.isNegative()) {
      throw new BadRequestException([
        'discount cannot be greater than subtotal plus tax',
      ]);
    }

    return {
      invoiceNumber: dto.invoiceNumber,
      invoiceReference: dto.invoiceReference ?? null,
      invoiceDate: new Date(dto.invoiceDate),
      dueDate: new Date(dto.dueDate),
      currency: dto.currency,
      currencySymbol: CURRENCY_SYMBOLS[dto.currency as CurrencyCode],
      description: dto.description ?? null,
      customerName: dto.customer.fullname,
      customerEmail: dto.customer.email,
      customerMobile: dto.customer.mobileNumber ?? null,
      customerAddress: dto.customer.address ?? null,
      taxRate: dto.taxRate,
      subTotal: amounts.subTotal,
      totalTax: amounts.totalTax,
      totalDiscount: amounts.totalDiscount,
      totalAmount: amounts.totalAmount,
      totalPaid: amounts.totalPaid,
      balanceAmount: amounts.balanceAmount,
    };
  }

  private toItems(dto: CreateInvoiceDto) {
    return dto.items.map(({ name, quantity, rate }) => ({
      name,
      quantity,
      rate,
    }));
  }

  /** Row lock for the rest of the transaction; 404 if the invoice doesn't exist. */
  private async lockInvoice(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT invoice_id AS id FROM invoices WHERE invoice_id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) {
      throw new NotFoundException('Invoice not found');
    }
  }

  private async ensureNumberAvailable(
    db: Prisma.TransactionClient,
    invoiceNumber: string,
    exceptId?: string,
  ) {
    const existing = await db.invoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    });
    if (existing && existing.id !== exceptId) {
      throw this.duplicateNumberError(invoiceNumber);
    }
  }

  /** Two requests with the same number can both pass the friendly check. */
  private rethrowDuplicate(err: unknown, invoiceNumber: string): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_VIOLATION
    ) {
      throw this.duplicateNumberError(invoiceNumber);
    }
    throw err;
  }

  /** Runs a lifecycle rule and turns its errors into HTTP errors. */
  private runRule<T>(rule: () => T): T {
    try {
      return rule();
    } catch (err) {
      if (err instanceof InvoiceStateError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof PaymentAmountError) {
        throw new BadRequestException([err.message]);
      }
      throw err;
    }
  }

  private buildWhere(
    query: Pick<
      ListInvoicesQueryDto,
      'keyword' | 'status' | 'fromDate' | 'toDate' | 'dueToday' | 'outstanding'
    >,
    today: Date,
  ): Prisma.InvoiceWhereInput {
    const conditions: Prisma.InvoiceWhereInput[] = [];

    if (query.keyword) {
      conditions.push({
        OR: [
          {
            invoiceNumber: { contains: query.keyword, mode: 'insensitive' },
          },
          { customerName: { contains: query.keyword, mode: 'insensitive' } },
        ],
      });
    }
    if (query.status) {
      conditions.push(statusFilter(query.status, today));
    }
    if (query.dueToday) {
      conditions.push(dueTodayFilter(today));
    }
    if (query.outstanding) {
      conditions.push(outstandingFilter());
    }
    if (query.fromDate) {
      conditions.push({ invoiceDate: { gte: new Date(query.fromDate) } });
    }
    if (query.toDate) {
      conditions.push({ invoiceDate: { lte: new Date(query.toDate) } });
    }

    return conditions.length ? { AND: conditions } : {};
  }

  private duplicateNumberError(invoiceNumber: string) {
    return new ConflictException(
      `Invoice number ${invoiceNumber} already exists`,
    );
  }
}
