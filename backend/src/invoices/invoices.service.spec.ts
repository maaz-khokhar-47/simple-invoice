import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

const USER_ID = 'ad1e0902-1928-4345-b513-60c86c94fc91';

type CreateArgs = { data: Prisma.InvoiceUncheckedCreateInput };

const buildDto = (
  overrides: Partial<CreateInvoiceDto> = {},
): CreateInvoiceDto => ({
  invoiceNumber: 'INV-1001',
  invoiceDate: '2026-10-01',
  dueDate: '2026-10-31',
  currency: 'AUD',
  customer: { fullname: 'Paul', email: 'paul@101digital.io' },
  items: [{ name: 'Honda RC150', quantity: 2, rate: 1000 }],
  taxRate: 10,
  discount: 20,
  ...overrides,
});

// Builds the row Prisma would return from the data we passed to create()
const echoCreatedRow = ({ data }: CreateArgs) => {
  const items = (data.items?.create ?? []) as Array<{
    name: string;
    quantity: number;
    rate: number;
  }>;
  return Promise.resolve({
    ...data,
    id: 'f2b6c1de-1111-4a3b-9c2d-000000000001',
    createdAt: new Date('2026-10-08T10:00:00Z'),
    taxRate: new Prisma.Decimal(data.taxRate as number),
    items: items.map((item, i) => ({
      ...item,
      id: `item-${i}`,
      invoiceId: 'f2b6c1de-1111-4a3b-9c2d-000000000001',
      rate: new Prisma.Decimal(item.rate),
    })),
    totalWrittenOff: new Prisma.Decimal(0),
    payments: [],
    writeOffs: [],
  });
};

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: {
    invoice: {
      findUnique: jest.Mock;
      create: jest.Mock<Promise<unknown>, [CreateArgs]>;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn<Promise<unknown>, [CreateArgs]>()
          .mockImplementation(echoCreatedRow),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: new ConfigService({}) },
      ],
    }).compile();

    service = moduleRef.get(InvoicesService);
  });

  describe('create', () => {
    it('calculates totals on the server and saves as Draft', async () => {
      const result = await service.create(buildDto(), USER_ID);

      const { data } = prisma.invoice.create.mock.calls[0][0];
      expect(data.status).toBe('Draft');
      expect(data.createdById).toBe(USER_ID);
      expect(data.currencySymbol).toBe('AU$');

      expect(result.invoiceSubTotal).toBe(2000);
      expect(result.totalTax).toBe(200);
      expect(result.totalDiscount).toBe(20);
      expect(result.totalAmount).toBe(2180);
      expect(result.totalPaid).toBe(0);
      expect(result.balanceAmount).toBe(2180);
    });

    it('rejects an invoice number that is already taken', async () => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(buildDto(), USER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('turns a unique constraint violation into a 409', async () => {
      // e.g. two requests racing with the same number
      prisma.invoice.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.create(buildDto(), USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows other database errors untouched', async () => {
      const boom = new Error('connection lost');
      prisma.invoice.create.mockRejectedValue(boom);

      await expect(service.create(buildDto(), USER_ID)).rejects.toBe(boom);
    });

    it('rejects a discount larger than subtotal plus tax', async () => {
      await expect(
        service.create(buildDto({ discount: 5000 }), USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('throws NotFound for an unknown id', async () => {
      await expect(
        service.findOne('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(new NotFoundException('Invoice not found'));
    });
  });

  describe('updateStatus', () => {
    const ID = 'f2b6c1de-1111-4a3b-9c2d-000000000001';

    it('only updates if the status has not changed since it was read', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ status: 'Draft' });
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus(ID, { status: 'Pending' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: ID, status: 'Draft' },
        data: { status: 'Pending', sentAt: expect.any(Date) as Date },
      });
    });

    it('returns 409 for a transition that is not allowed', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ status: 'Paid' });

      await expect(
        service.updateStatus(ID, { status: 'Draft' }),
      ).rejects.toThrow(
        new ConflictException('Cannot change status from Paid to Draft'),
      );
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown invoice', async () => {
      await expect(
        service.updateStatus(ID, { status: 'Pending' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const ID = 'f2b6c1de-1111-4a3b-9c2d-000000000001';

    it('deletes only while the invoice is a Draft', async () => {
      await service.remove(ID);
      expect(prisma.invoice.deleteMany).toHaveBeenCalledWith({
        where: { id: ID, status: 'Draft' },
      });
    });

    it('returns 409 when the invoice has been sent', async () => {
      prisma.invoice.deleteMany.mockResolvedValue({ count: 0 });
      prisma.invoice.findUnique.mockResolvedValueOnce({ status: 'Pending' });

      await expect(service.remove(ID)).rejects.toThrow(
        new ConflictException(
          'Only Draft invoices can be deleted (this one is Pending)',
        ),
      );
    });

    it('returns 404 when the invoice does not exist', async () => {
      prisma.invoice.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('pdf', () => {
    it('refuses invoices that are not paid yet', async () => {
      const d = (n: number) => new Prisma.Decimal(n);
      prisma.invoice.findUnique.mockResolvedValueOnce({
        id: 'f2b6c1de-1111-4a3b-9c2d-000000000001',
        invoiceNumber: 'INV-1001',
        invoiceReference: null,
        invoiceDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-31'),
        currency: 'AUD',
        currencySymbol: 'AU$',
        description: null,
        status: 'Pending',
        sentAt: new Date('2026-10-01T10:00:00Z'),
        customerName: 'Paul',
        customerEmail: 'paul@101digital.io',
        customerMobile: null,
        customerAddress: null,
        taxRate: d(10),
        subTotal: d(100),
        totalTax: d(10),
        totalDiscount: d(0),
        totalAmount: d(110),
        totalPaid: d(0),
        totalWrittenOff: d(0),
        balanceAmount: d(110),
        createdAt: new Date('2026-10-01T09:00:00Z'),
        createdById: USER_ID,
        items: [],
        payments: [],
        writeOffs: [],
      });

      await expect(
        service.pdf('f2b6c1de-1111-4a3b-9c2d-000000000001'),
      ).rejects.toThrow(
        new ConflictException('Only paid invoices can be downloaded as PDF'),
      );
    });
  });
});
