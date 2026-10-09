import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { configureApp } from '../src/setup-app';

/**
 * Runs against the database in DATABASE_URL (migrations must be applied).
 * Uses its own user and invoice numbers and removes them afterwards.
 */
describe('Invoices (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  const runId = Date.now().toString(36);
  const email = `e2e-${runId}@test.local`;
  const password = 'e2e-password';
  const invoiceNumber = `E2E-${runId}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email,
        fullname: 'E2E User',
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({
      where: { createdBy: { email } },
    });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('rejects invoice requests without a token', async () => {
    const res = await request(app.getHttpServer()).get('/invoices');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      statusCode: 401,
      message: 'Invalid email or password',
      error: 'Unauthorized',
    });
  });

  it('logs in and returns the profile', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    token = (login.body as { accessToken: string }).accessToken;
    expect(token).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, fullname: 'E2E User' });
  });

  it('creates an invoice and finds it in the list', async () => {
    const created = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        invoiceNumber,
        invoiceDate: '2099-01-01',
        dueDate: '2099-01-31',
        currency: 'AUD',
        customer: { fullname: 'E2E Customer', email: 'customer@test.local' },
        items: [{ name: 'Widget', quantity: 3, rate: 50 }],
        discount: 5,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      invoiceNumber,
      status: 'Draft',
      invoiceSubTotal: 150,
      totalTax: 15,
      totalDiscount: 5,
      totalAmount: 160,
      balanceAmount: 160,
    });

    const list = await request(app.getHttpServer())
      .get('/invoices')
      .query({ keyword: invoiceNumber.toLowerCase(), status: 'Draft' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toMatchObject({
      paging: { page: 1, pageSize: 10, total: 1 },
      data: [{ invoiceNumber, status: 'Draft', totalAmount: 160 }],
    });

    const { invoiceId } = created.body as { invoiceId: string };
    const detail = await request(app.getHttpServer())
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      invoiceId,
      items: [{ name: 'Widget', quantity: 3, rate: 50 }],
    });
  });

  it('returns 409 when the invoice number is reused', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        invoiceNumber,
        invoiceDate: '2099-01-01',
        dueDate: '2099-01-31',
        currency: 'AUD',
        customer: { fullname: 'Someone', email: 'someone@test.local' },
        items: [{ name: 'Widget', quantity: 1, rate: 1 }],
      });

    expect(res.status).toBe(409);
  });

  it('returns a structured 400 when due date is before invoice date', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        invoiceNumber: `${invoiceNumber}-B`,
        invoiceDate: '2099-02-01',
        dueDate: '2099-01-01',
        currency: 'AUD',
        customer: { fullname: 'Someone', email: 'someone@test.local' },
        items: [{ name: 'Widget', quantity: 1, rate: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      message: ['dueDate must be on or after invoiceDate'],
      error: 'Bad Request',
    });
  });

  it('moves an invoice from Draft to Pending to Paid', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(server)
      .post('/invoices')
      .set(auth)
      .send({
        invoiceNumber: `${invoiceNumber}-L`,
        invoiceDate: '2026-01-01',
        dueDate: '2099-01-31',
        currency: 'AUD',
        customer: { fullname: 'Lifecycle', email: 'life@test.local' },
        items: [{ name: 'Widget', quantity: 2, rate: 100 }],
      })
      .expect(201);
    const { invoiceId } = created.body as { invoiceId: string };
    const pay = (amount: number) =>
      request(server).post(`/invoices/${invoiceId}/payments`).set(auth).send({
        amountReceived: amount,
        method: 'BankTransfer',
        paidAt: '2026-02-01',
      });

    // Drafts can't take payments, and Paid can't be set by hand
    expect((await pay(10)).status).toBe(409);
    await request(server)
      .patch(`/invoices/${invoiceId}/status`)
      .set(auth)
      .send({ status: 'Paid' })
      .expect(409);

    const sent = await request(server)
      .patch(`/invoices/${invoiceId}/status`)
      .set(auth)
      .send({ status: 'Pending' })
      .expect(200);
    expect(sent.body).toMatchObject({
      status: 'Pending',
      storedStatus: 'Pending',
    });
    expect((sent.body as { sentAt: string | null }).sentAt).not.toBeNull();

    // No PDF until it's paid
    await request(server)
      .get(`/invoices/${invoiceId}/pdf`)
      .set(auth)
      .expect(409);

    // total is 220 (200 + 10% tax)
    const tooMuch = await pay(300);
    expect(tooMuch.status).toBe(400);
    expect((tooMuch.body as { message: string[] }).message).toEqual([
      'amount cannot be more than the balance of 220.00',
    ]);

    const partial = await pay(120);
    expect(partial.status).toBe(201);
    expect(partial.body).toMatchObject({
      status: 'Pending',
      totalPaid: 120,
      balanceAmount: 100,
      payments: [{ amount: 120, paidAt: '2026-02-01' }],
    });

    // Two payments for the remaining 100 at the same time: only one may succeed
    const results = await Promise.all([pay(100), pay(100)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);

    const detail = await request(server)
      .get(`/invoices/${invoiceId}`)
      .set(auth)
      .expect(200);
    expect(detail.body).toMatchObject({
      status: 'Paid',
      totalPaid: 220,
      balanceAmount: 0,
    });
    expect((detail.body as { payments: unknown[] }).payments).toHaveLength(2);

    const pdf = await request(server)
      .get(`/invoices/${invoiceId}/pdf`)
      .set(auth)
      .responseType('blob')
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe(
      `attachment; filename="invoice-${invoiceNumber}-L.pdf"`,
    );
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    await request(server)
      .patch(`/invoices/${invoiceId}/status`)
      .set(auth)
      .send({ status: 'Draft' })
      .expect(409);
  });

  it('records payments in another currency and with tax withheld', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };

    // AUD invoice: 1000 + 10% tax = 1100
    const created = await request(server)
      .post('/invoices')
      .set(auth)
      .send({
        invoiceNumber: `${invoiceNumber}-FX`,
        invoiceDate: '2026-01-01',
        dueDate: '2099-01-31',
        currency: 'AUD',
        customer: { fullname: 'Overseas Ltd', email: 'fx@test.local' },
        items: [{ name: 'Consulting', quantity: 1, rate: 1000 }],
      })
      .expect(201);
    const { invoiceId } = created.body as { invoiceId: string };
    await request(server)
      .patch(`/invoices/${invoiceId}/status`)
      .set(auth)
      .send({ status: 'Pending' })
      .expect(200);
    const pay = (body: object) =>
      request(server)
        .post(`/invoices/${invoiceId}/payments`)
        .set(auth)
        .send({ paidAt: '2026-02-01', ...body });

    // a foreign payment needs a rate; a same-currency one can't have a different one
    const noRate = await pay({
      method: 'BankRemittance',
      amountReceived: 500,
      currency: 'USD',
    });
    expect(noRate.status).toBe(400);
    expect((noRate.body as { message: string[] }).message).toEqual([
      'exchangeRate is required: the payment is in USD but the invoice is in AUD',
    ]);
    await pay({ method: 'Cash', amountReceived: 10, exchangeRate: 2 }).expect(
      400,
    );
    await pay({ method: 'Cheque', amountReceived: 10 }).expect(400);

    // USD 500 at 1.52 = AUD 760, plus AUD 76 withheld by the customer = AUD 836 settled
    const fx = await pay({
      method: 'BankRemittance',
      amountReceived: 500,
      currency: 'USD',
      exchangeRate: 1.52,
      taxWithheld: 76,
      note: 'TDS certificate to follow',
    }).expect(201);
    expect(fx.body).toMatchObject({
      status: 'Pending',
      totalPaid: 836,
      balanceAmount: 264,
      payments: [
        {
          method: 'BankRemittance',
          amountReceived: 500,
          currency: 'USD',
          exchangeRate: 1.52,
          taxWithheld: 76,
          amount: 836,
        },
      ],
    });

    // the rest in cash, net of tax withheld: 240 received + 24 withheld = 264, so Paid
    const last = await pay({
      method: 'Cash',
      amountReceived: 240,
      taxWithheld: 24,
    }).expect(201);
    expect(last.body).toMatchObject({ status: 'Paid', balanceAmount: 0 });
  });

  it('writes off a payment shortfall and a bad debt', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };

    // two sent AUD invoices of 1000 + 10% tax = 1100
    const sentInvoice = async (suffix: string) => {
      const created = await request(server)
        .post('/invoices')
        .set(auth)
        .send({
          invoiceNumber: `${invoiceNumber}-${suffix}`,
          invoiceDate: '2026-01-01',
          dueDate: '2026-01-31',
          currency: 'AUD',
          customer: { fullname: 'Short Payer', email: 'wo@test.local' },
          items: [{ name: 'Consulting', quantity: 1, rate: 1000 }],
        })
        .expect(201);
      const { invoiceId } = created.body as { invoiceId: string };
      await request(server)
        .patch(`/invoices/${invoiceId}/status`)
        .set(auth)
        .send({ status: 'Pending' })
        .expect(200);
      return invoiceId;
    };

    // 1) 1090 arrives, 10 lost to bank charges: written off and Paid
    const shortId = await sentInvoice('WO1');
    const pay = (body: object) =>
      request(server)
        .post(`/invoices/${shortId}/payments`)
        .set(auth)
        .send({ method: 'BankTransfer', paidAt: '2026-02-01', ...body });

    await pay({ amountReceived: 1090, writeOffRest: true }).expect(400);
    await pay({
      amountReceived: 1090,
      writeOffRest: true,
      writeOffReason: 'BadDebt',
    }).expect(400);
    await pay({ amountReceived: 1090, writeOffReason: 'Rounding' }).expect(400);

    const short = await pay({
      amountReceived: 1090,
      writeOffRest: true,
      writeOffReason: 'BankCharges',
      writeOffNote: 'Intermediary bank fee',
    }).expect(201);
    expect(short.body).toMatchObject({
      status: 'Paid',
      totalPaid: 1090,
      totalWrittenOff: 10,
      balanceAmount: 0,
      writeOffs: [
        {
          amount: 10,
          reason: 'BankCharges',
          note: 'Intermediary bank fee',
          writtenOffAt: '2026-02-01',
          paymentId: (short.body as { payments: { id: string }[] }).payments[0]
            .id,
        },
      ],
    });

    // 2) 400 paid, then the customer goes under: 700 written off as bad debt
    const badId = await sentInvoice('WO2');
    await request(server)
      .post(`/invoices/${badId}/payments`)
      .set(auth)
      .send({ method: 'Cash', amountReceived: 400, paidAt: '2026-02-01' })
      .expect(201);

    const writeOff = (body: object) =>
      request(server).post(`/invoices/${badId}/write-off`).set(auth).send(body);
    await writeOff({
      reason: 'BankCharges',
      writtenOffAt: '2026-03-01',
    }).expect(400);
    await writeOff({ reason: 'Other', writtenOffAt: '2026-03-01' }).expect(400);

    const bad = await writeOff({
      reason: 'BadDebt',
      writtenOffAt: '2026-03-01',
      note: 'Customer went into liquidation',
    }).expect(201);
    expect(bad.body).toMatchObject({
      status: 'WrittenOff',
      totalPaid: 400,
      totalWrittenOff: 700,
      balanceAmount: 0,
      writeOffs: [{ amount: 700, reason: 'BadDebt', paymentId: null }],
    });

    // closed for good: no more payments or write-offs, and never Overdue
    await writeOff({ reason: 'BadDebt', writtenOffAt: '2026-03-02' }).expect(
      409,
    );
    await request(server)
      .post(`/invoices/${badId}/payments`)
      .set(auth)
      .send({ method: 'Cash', amountReceived: 1, paidAt: '2026-03-02' })
      .expect(409);
    await request(server)
      .post(`/invoices/${shortId}/write-off`)
      .set(auth)
      .send({ reason: 'BadDebt', writtenOffAt: '2026-03-02' })
      .expect(409);

    const list = await request(server)
      .get('/invoices')
      .query({ keyword: `${invoiceNumber}-WO`, status: 'WrittenOff' })
      .set(auth)
      .expect(200);
    expect(
      (list.body as { data: { invoiceId: string }[] }).data.map(
        (row) => row.invoiceId,
      ),
    ).toEqual([badId]);
  });

  it('edits and deletes Drafts, but not invoices that have been sent', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    const body = (number: string, overrides: object = {}) => ({
      invoiceNumber: number,
      invoiceDate: '2099-03-01',
      dueDate: '2099-03-31',
      currency: 'AUD',
      customer: { fullname: 'Editable', email: 'edit@test.local' },
      items: [{ name: 'Widget', quantity: 1, rate: 100 }],
      ...overrides,
    });

    const created = await request(server)
      .post('/invoices')
      .set(auth)
      .send(body(`${invoiceNumber}-E`))
      .expect(201);
    const { invoiceId } = created.body as { invoiceId: string };

    // Edit: new number, new item, totals recalculated on the server
    const edited = await request(server)
      .put(`/invoices/${invoiceId}`)
      .set(auth)
      .send(
        body(`${invoiceNumber}-E2`, {
          currency: 'GBP',
          items: [{ name: 'Gadget', quantity: 3, rate: 50 }],
          discount: 15,
        }),
      )
      .expect(200);
    expect(edited.body).toMatchObject({
      invoiceId,
      invoiceNumber: `${invoiceNumber}-E2`,
      currencySymbol: '£',
      status: 'Draft',
      invoiceSubTotal: 150,
      totalTax: 15,
      totalAmount: 150,
      items: [{ name: 'Gadget', quantity: 3, rate: 50 }],
    });
    expect((edited.body as { items: unknown[] }).items).toHaveLength(1);

    // Can't take a number another invoice already uses
    await request(server)
      .put(`/invoices/${invoiceId}`)
      .set(auth)
      .send(body(invoiceNumber))
      .expect(409);

    // Once sent, no more edits or deletes
    await request(server)
      .patch(`/invoices/${invoiceId}/status`)
      .set(auth)
      .send({ status: 'Pending' })
      .expect(200);
    const blockedEdit = await request(server)
      .put(`/invoices/${invoiceId}`)
      .set(auth)
      .send(body(`${invoiceNumber}-E2`));
    expect(blockedEdit.status).toBe(409);
    expect(blockedEdit.body).toMatchObject({
      message: 'Only Draft invoices can be edited (this one is Pending)',
    });
    await request(server)
      .delete(`/invoices/${invoiceId}`)
      .set(auth)
      .expect(409);

    // A fresh Draft can be deleted, and is gone afterwards
    const draft = await request(server)
      .post('/invoices')
      .set(auth)
      .send(body(`${invoiceNumber}-D`))
      .expect(201);
    const draftId = (draft.body as { invoiceId: string }).invoiceId;
    await request(server).delete(`/invoices/${draftId}`).set(auth).expect(204);
    await request(server).get(`/invoices/${draftId}`).set(auth).expect(404);
    await request(server).delete(`/invoices/${draftId}`).set(auth).expect(404);
  });

  it('stats counts match what the list returns for each status', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    const listTotal = async (query: object) => {
      const res = await request(server)
        .get('/invoices')
        .query({ ...query, pageSize: 1 })
        .set(auth)
        .expect(200);
      return (res.body as { paging: { total: number } }).paging.total;
    };

    for (const filters of [{}, { keyword: 'e2e' }]) {
      const res = await request(server)
        .get('/invoices/stats')
        .query(filters)
        .set(auth)
        .expect(200);
      const stats = res.body as Record<string, { count: number }> & {
        total: number;
      };

      expect(stats.total).toBe(await listTotal(filters));
      for (const status of [
        'Draft',
        'Pending',
        'Overdue',
        'Paid',
        'WrittenOff',
      ]) {
        expect(stats[status].count).toBe(
          await listTotal({ ...filters, status }),
        );
      }
    }
  });

  it('suggests customers from previous invoices', async () => {
    const res = await request(app.getHttpServer())
      .get('/customers')
      .query({ keyword: 'LIFE@test' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        fullname: 'Lifecycle',
        email: 'life@test.local',
        mobileNumber: null,
        address: null,
      },
    ]);
  });

  it('bulk imports invoices from the Excel template', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };

    // 1. download the template and fill it in like a user would
    const template = await request(server)
      .get('/invoices/import/template')
      .set(auth)
      .responseType('blob')
      .expect(200);
    expect(template.headers['content-disposition']).toContain(
      'invoice-import-template.xlsx',
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template.body as ArrayBuffer);
    const sheet = workbook.getWorksheet('Invoices')!;
    // Type into rows 2, 3, 4 like a person would (addRow would append after
    // the 200 pre-formatted template rows)
    let nextRow = 2;
    const fill = (values: (string | number | Date | null)[]) => {
      sheet.getRow(nextRow++).values = values;
    };
    // Invoice number, Ref, Invoice date, Due date, Currency, Description,
    // Customer name, email, mobile, address, Item, Qty, Rate, Tax %, Discount
    fill([
      `${invoiceNumber}-X1`,
      null,
      new Date(Date.UTC(2099, 0, 1)),
      new Date(Date.UTC(2099, 0, 31)),
      'AUD',
      null,
      'Import One',
      'one@test.local',
      null,
      null,
      'Widget',
      2,
      100,
      null,
      null,
    ]);
    fill([
      `${invoiceNumber}-X2`,
      'PO-9',
      '2099-02-01',
      '2099-02-28',
      'USD',
      'Second',
      'Import Two',
      'two@test.local',
      null,
      null,
      'Gadget',
      1,
      50,
      0,
      5,
    ]);
    fill([
      `${invoiceNumber}-X3`,
      null,
      '2099-03-01',
      '2099-02-01',
      'AUD',
      null,
      'Bad Dates',
      'not-an-email',
      null,
      null,
      'Thing',
      1,
      10,
      null,
      null,
    ]);
    const upload = Buffer.from(await workbook.xlsx.writeBuffer());

    // 2. preview: nothing saved yet, every row checked
    const preview = await request(server)
      .post('/invoices/import/preview')
      .set(auth)
      .attach('file', upload, 'invoices.xlsx')
      .expect(201);
    const result = preview.body as {
      validCount: number;
      invalidCount: number;
      rows: {
        rowNumber: number;
        valid: boolean;
        errors: string[];
        invoice: object;
      }[];
    };
    expect(result).toMatchObject({ validCount: 2, invalidCount: 1 });
    expect(result.rows[2]).toMatchObject({ rowNumber: 4, valid: false });
    expect(result.rows[2].errors).toEqual(
      expect.arrayContaining([
        'Customer email: must be an email',
        'Due date: must be on or after Invoice date',
      ]),
    );
    await request(server)
      .get('/invoices')
      .query({ keyword: `${invoiceNumber}-X` })
      .set(auth)
      .expect(200)
      .expect((res) =>
        expect((res.body as { paging: { total: number } }).paging.total).toBe(
          0,
        ),
      );

    // 3. import the valid rows
    const valid = result.rows.filter((r) => r.valid).map((r) => r.invoice);
    const imported = await request(server)
      .post('/invoices/import')
      .set(auth)
      .send({ invoices: valid })
      .expect(201);
    expect(imported.body).toMatchObject({ created: 2 });

    const list = await request(server)
      .get('/invoices')
      .query({
        keyword: `${invoiceNumber}-X`,
        status: 'Draft',
        sortBy: 'invoiceDate',
        ordering: 'ASC',
      })
      .set(auth)
      .expect(200);
    expect(list.body).toMatchObject({
      paging: { total: 2 },
      data: [
        { invoiceNumber: `${invoiceNumber}-X1`, totalAmount: 220 },
        {
          invoiceNumber: `${invoiceNumber}-X2`,
          currencySymbol: 'US$',
          totalAmount: 45,
        },
      ],
    });

    // 4. importing the same rows again is refused as a whole
    await request(server)
      .post('/invoices/import')
      .set(auth)
      .send({ invoices: valid })
      .expect(409);
  });

  it('rejects uploads that are not .xlsx', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices/import/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('a,b,c'), 'invoices.csv');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: 'Only .xlsx files are supported',
    });
  });

  it('finds unpaid invoices due today', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    // the server's "today" is UTC
    const today = new Date().toISOString().slice(0, 10);

    await request(server)
      .post('/invoices')
      .set(auth)
      .send({
        invoiceNumber: `${invoiceNumber}-T`,
        invoiceDate: today,
        dueDate: today,
        currency: 'AUD',
        customer: { fullname: 'Due Today', email: 'today@test.local' },
        items: [{ name: 'Widget', quantity: 1, rate: 100 }],
      })
      .expect(201);

    const list = await request(server)
      .get('/invoices')
      .query({ dueToday: true, pageSize: 100 })
      .set(auth)
      .expect(200);
    const rows = (
      list.body as {
        data: { invoiceNumber: string; dueDate: string; status: string }[];
      }
    ).data;
    expect(rows.map((r) => r.invoiceNumber)).toContain(`${invoiceNumber}-T`);
    // everything returned is due today and still unpaid (not yet Overdue)
    for (const row of rows) {
      expect(row.dueDate).toBe(today);
      expect(['Draft', 'Pending']).toContain(row.status);
    }

    const stats = await request(server)
      .get('/invoices/stats')
      .set(auth)
      .expect(200);
    expect((stats.body as { dueToday: { count: number } }).dueToday.count).toBe(
      rows.length,
    );
  });

  it('totals outstanding receivables from sent invoices only', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };

    // an overdue Draft: shows as Overdue, but hasn't been sent, so it isn't owed yet
    await request(server)
      .post('/invoices')
      .set(auth)
      .send({
        invoiceNumber: `${invoiceNumber}-OD`,
        invoiceDate: '2020-01-01',
        dueDate: '2020-01-31',
        currency: 'AUD',
        customer: { fullname: 'Old Draft', email: 'old@test.local' },
        items: [{ name: 'Widget', quantity: 1, rate: 100 }],
      })
      .expect(201);

    const list = await request(server)
      .get('/invoices')
      .query({ outstanding: true, pageSize: 100 })
      .set(auth)
      .expect(200);
    const body = list.body as {
      data: { invoiceNumber: string; status: string }[];
      paging: { total: number };
    };
    expect(body.data.map((r) => r.invoiceNumber)).not.toContain(
      `${invoiceNumber}-OD`,
    );
    // sent invoices show as Pending, or Overdue once past due
    for (const row of body.data) {
      expect(['Pending', 'Overdue']).toContain(row.status);
    }

    const stats = await request(server)
      .get('/invoices/stats')
      .set(auth)
      .expect(200);
    expect(
      (stats.body as { outstanding: { count: number } }).outstanding.count,
    ).toBe(body.paging.total);
  });

  it('returns 404 for an unknown invoice', async () => {
    const res = await request(app.getHttpServer())
      .get('/invoices/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      message: 'Invoice not found',
      error: 'Not Found',
    });
  });
});
