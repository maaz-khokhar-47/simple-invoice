/**
 * Seeds the reviewer account, the invoice from the assessment brief,
 * two invoices closed with a write-off and ~40 generated invoices. Safe to run more than once - existing rows
 * (matched by email / invoice number) are left alone.
 *
 *   npm run seed
 */
import {
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  PrismaClient,
  WriteOffReason,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CURRENCY_SYMBOLS, CurrencyCode } from '../../invoices/currencies';
import { calculateInvoiceAmounts } from '../../invoices/invoice-calculator';
import { startOfTodayUtc } from '../../invoices/invoice-status';
import { CUSTOMERS, PRODUCTS } from './seed-data';

const GENERATED_COUNT = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

// The createdBy id from the mock dataset, reused so the sample invoice lines up
const REVIEWER_ID = 'ad1e0902-1928-4345-b513-60c86c94fc91';

try {
  process.loadEnvFile();
} catch {
  // no .env file - fine in docker where env vars are passed in directly
}

const prisma = new PrismaClient();

// Small seeded PRNG (mulberry32) so every run produces the same data
function createRandom(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) =>
      Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    chance: (probability: number) => next() < probability,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to run the seed (see .env.example)`);
  }
  return value;
}

async function seedUser() {
  const email = requireEnv('SEED_USER_EMAIL').toLowerCase();
  const password = requireEnv('SEED_USER_PASSWORD');

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      id: REVIEWER_ID,
      email,
      fullname: process.env.SEED_USER_NAME || 'Reviewer',
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  console.log(`User ready: ${user.email}`);
  return user.id;
}

// The invoice from Appendix A. It is stored as Pending; it shows as Overdue
// because its due date has passed.
function briefInvoice(userId: string): Prisma.InvoiceCreateInput {
  const amounts = calculateInvoiceAmounts({
    items: [{ quantity: 2, rate: 1000 }],
    taxRate: 10,
    discount: 20,
    totalPaid: 1451.34,
  });

  return {
    id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
    invoiceNumber: 'IV1780488206995',
    invoiceReference: '#5721662',
    invoiceDate: new Date('2026-06-03'),
    dueDate: new Date('2026-07-03'),
    currency: 'AUD',
    currencySymbol: 'AU$',
    description: 'Invoice is issued to Kanglee',
    status: InvoiceStatus.Pending,
    sentAt: new Date('2026-06-03T14:30:00.000Z'),
    customerName: 'Paul',
    customerEmail: 'paul@101digital.io',
    customerMobile: '947717364111',
    customerAddress: 'Singapore',
    taxRate: 10,
    ...toAmountColumns(amounts),
    createdAt: new Date('2026-06-03T12:03:26.995Z'),
    createdBy: { connect: { id: userId } },
    payments: {
      create: [
        {
          amount: 1451.34,
          method: PaymentMethod.BankRemittance,
          amountReceived: 1451.34,
          currency: 'AUD',
          exchangeRate: 1,
          paidAt: new Date('2026-06-20'),
          note: 'Part payment',
          createdBy: { connect: { id: userId } },
        },
      ],
    },
    items: {
      create: [
        {
          id: 'b1c2d3e4-0000-0000-0000-000000000001',
          name: 'Honda RC150',
          quantity: 2,
          rate: 1000,
        },
      ],
    },
  };
}

function generateInvoices(userId: string): Prisma.InvoiceCreateInput[] {
  const random = createRandom(20260603);
  const today = startOfTodayUtc();
  const invoices: Prisma.InvoiceCreateInput[] = [];

  for (let i = 1; i <= GENERATED_COUNT; i++) {
    const customer = random.pick(CUSTOMERS);
    const product = random.pick(PRODUCTS);
    const quantity = random.int(1, product.maxQty);

    const roll = random.next();
    const status =
      roll < 0.25
        ? InvoiceStatus.Draft
        : roll < 0.6
          ? InvoiceStatus.Pending
          : InvoiceStatus.Paid;

    // Paid invoices can be from any time in the last ~6 months. Unpaid ones are
    // mostly recent, with some older ones that will show up as Overdue.
    const daysAgo =
      status === InvoiceStatus.Paid || random.chance(0.35)
        ? random.int(0, 180)
        : random.int(0, 10);
    const invoiceDate = new Date(today.getTime() - daysAgo * DAY_MS);
    const dueDate = new Date(
      invoiceDate.getTime() + random.pick([14, 30, 30, 45, 60]) * DAY_MS,
    );

    const currency: CurrencyCode = random.chance(0.7)
      ? 'AUD'
      : random.pick(['USD', 'GBP', 'SGD', 'NZD'] as const);
    const taxRate = random.pick([10, 10, 10, 0, 7.5, 20]);
    const subTotal = quantity * product.rate;
    const discount = random.chance(0.3)
      ? Math.floor(subTotal * random.pick([0.02, 0.05, 0.1]))
      : 0;

    const preview = calculateInvoiceAmounts({
      items: [{ quantity, rate: product.rate }],
      taxRate,
      discount,
    });
    let totalPaid = 0;
    if (status === InvoiceStatus.Paid) {
      totalPaid = preview.totalAmount.toNumber();
    } else if (status === InvoiceStatus.Pending && random.chance(0.4)) {
      totalPaid =
        Math.round(preview.totalAmount.toNumber() * random.next() * 80) / 100;
    }

    const amounts = calculateInvoiceAmounts({
      items: [{ quantity, rate: product.rate }],
      taxRate,
      discount,
      totalPaid,
    });

    invoices.push({
      invoiceNumber: `INV-${String(i).padStart(4, '0')}`,
      invoiceReference: random.chance(0.5)
        ? `#${random.int(1000000, 9999999)}`
        : null,
      invoiceDate,
      dueDate,
      currency,
      currencySymbol: CURRENCY_SYMBOLS[currency],
      description: random.chance(0.5)
        ? `${product.name} for ${customer.fullname}`
        : null,
      status,
      // sent within a day or so of being created; Drafts haven't been sent
      sentAt:
        status === InvoiceStatus.Draft
          ? null
          : new Date(
              Math.min(
                Date.now(),
                invoiceDate.getTime() + random.int(1, 30) * 60 * 60 * 1000,
              ),
            ),
      customerName: customer.fullname,
      customerEmail: customer.email,
      customerMobile: customer.mobileNumber ?? null,
      customerAddress: customer.address ?? null,
      taxRate,
      ...toAmountColumns(amounts),
      createdAt: invoiceDate,
      createdBy: { connect: { id: userId } },
      items: {
        create: [{ name: product.name, quantity, rate: product.rate }],
      },
      // Every paid amount gets a matching payment record, dated after the
      // invoice and never in the future
      payments:
        totalPaid > 0
          ? {
              create: [
                {
                  amount: totalPaid,
                  method: random.pick([
                    PaymentMethod.BankTransfer,
                    PaymentMethod.BankTransfer,
                    PaymentMethod.Cash,
                    PaymentMethod.BankRemittance,
                  ]),
                  amountReceived: totalPaid,
                  currency,
                  exchangeRate: 1,
                  paidAt: new Date(
                    invoiceDate.getTime() +
                      random.int(0, Math.min(daysAgo, 40)) * DAY_MS,
                  ),
                  note: random.pick([
                    null,
                    null,
                    'Thanks!',
                    'Ref on remittance advice',
                  ]),
                  createdBy: { connect: { id: userId } },
                },
              ],
            }
          : undefined,
    });
  }

  return invoices;
}

interface WriteOffExample {
  invoice: Prisma.InvoiceCreateInput;
  writeOff: Omit<Prisma.WriteOffUncheckedCreateInput, 'createdById'>;
}

// One of each kind of write-off: bank charges taken off a payment (Paid) and
// a bad debt after a part payment (WrittenOff).
function writeOffExamples(userId: string): WriteOffExample[] {
  const today = startOfTodayUtc();
  const daysAgo = (days: number) => new Date(today.getTime() - days * DAY_MS);
  const createdBy = { connect: { id: userId } };

  const shortPaid = calculateInvoiceAmounts({
    items: [{ quantity: 1, rate: 2500 }],
    taxRate: 10,
    discount: 0,
    totalPaid: 2735,
  });
  const badDebt = calculateInvoiceAmounts({
    items: [{ quantity: 3, rate: 450 }],
    taxRate: 10,
    discount: 0,
    totalPaid: 500,
  });

  return [
    {
      invoice: {
        id: '5e1f0c2a-7b3d-4c8e-9a10-000000000001',
        invoiceNumber: 'INV-WO-001',
        invoiceDate: daysAgo(45),
        dueDate: daysAgo(15),
        currency: 'USD',
        currencySymbol: CURRENCY_SYMBOLS.USD,
        description: 'Freight consolidation, paid by overseas transfer',
        status: InvoiceStatus.Paid,
        sentAt: daysAgo(45),
        createdAt: daysAgo(45),
        customerName: 'Harbour Freight Co',
        customerEmail: 'accounts@harbourfreight.example',
        customerAddress: 'Auckland, New Zealand',
        taxRate: 10,
        ...toAmountColumns(shortPaid),
        // USD 15 never arrived: the banks took it as fees
        totalWrittenOff: 15,
        balanceAmount: 0,
        createdBy,
        items: {
          create: [{ name: 'Freight consolidation', quantity: 1, rate: 2500 }],
        },
        payments: {
          create: [
            {
              id: '5e1f0c2a-7b3d-4c8e-9a10-0000000000a1',
              amount: 2735,
              method: PaymentMethod.BankRemittance,
              amountReceived: 2735,
              currency: 'USD',
              exchangeRate: 1,
              paidAt: daysAgo(20),
              note: 'SWIFT ref 44120',
              createdBy,
            },
          ],
        },
      },
      writeOff: {
        invoiceId: '5e1f0c2a-7b3d-4c8e-9a10-000000000001',
        paymentId: '5e1f0c2a-7b3d-4c8e-9a10-0000000000a1',
        amount: 15,
        reason: WriteOffReason.BankCharges,
        note: 'Intermediary bank fee',
        writtenOffAt: daysAgo(20),
      },
    },
    {
      invoice: {
        id: '5e1f0c2a-7b3d-4c8e-9a10-000000000002',
        invoiceNumber: 'INV-WO-002',
        invoiceDate: daysAgo(100),
        dueDate: daysAgo(70),
        currency: 'AUD',
        currencySymbol: CURRENCY_SYMBOLS.AUD,
        description: 'Catering equipment rental, 3 months',
        status: InvoiceStatus.WrittenOff,
        sentAt: daysAgo(100),
        createdAt: daysAgo(100),
        customerName: 'Coastal Cafe Group',
        customerEmail: 'owner@coastalcafe.example',
        customerAddress: 'Gold Coast, QLD',
        taxRate: 10,
        ...toAmountColumns(badDebt),
        totalWrittenOff: badDebt.balanceAmount,
        balanceAmount: 0,
        createdBy,
        items: {
          create: [
            { name: 'Equipment rental (month)', quantity: 3, rate: 450 },
          ],
        },
        payments: {
          create: [
            {
              amount: 500,
              method: PaymentMethod.Cash,
              amountReceived: 500,
              currency: 'AUD',
              exchangeRate: 1,
              paidAt: daysAgo(70),
              note: 'Part payment',
              createdBy,
            },
          ],
        },
      },
      writeOff: {
        invoiceId: '5e1f0c2a-7b3d-4c8e-9a10-000000000002',
        amount: badDebt.balanceAmount,
        reason: WriteOffReason.BadDebt,
        note: 'Business closed; no reply to three reminders',
        writtenOffAt: daysAgo(10),
      },
    },
  ];
}

function toAmountColumns(amounts: ReturnType<typeof calculateInvoiceAmounts>) {
  return {
    subTotal: amounts.subTotal,
    totalTax: amounts.totalTax,
    totalDiscount: amounts.totalDiscount,
    totalAmount: amounts.totalAmount,
    totalPaid: amounts.totalPaid,
    balanceAmount: amounts.balanceAmount,
  };
}

async function main() {
  const userId = await seedUser();
  const examples = writeOffExamples(userId);
  const invoices = [
    briefInvoice(userId),
    ...examples.map((example) => example.invoice),
    ...generateInvoices(userId),
  ];

  let created = 0;
  for (const invoice of invoices) {
    const exists = await prisma.invoice.findUnique({
      where: { invoiceNumber: invoice.invoiceNumber },
      select: { id: true },
    });
    if (!exists) {
      const example = examples.find((e) => e.invoice === invoice);
      await prisma.$transaction(async (tx) => {
        await tx.invoice.create({ data: invoice });
        if (example) {
          await tx.writeOff.create({
            data: { ...example.writeOff, createdById: userId },
          });
        }
      });
      created++;
    }
  }

  console.log(
    `Invoices: ${created} created, ${invoices.length - created} already existed`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
