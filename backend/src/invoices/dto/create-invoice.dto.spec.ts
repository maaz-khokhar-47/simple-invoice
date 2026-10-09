import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvoiceDto } from './create-invoice.dto';

const validPayload = () => ({
  invoiceNumber: 'INV-1001',
  invoiceDate: '2026-10-01',
  dueDate: '2026-10-31',
  currency: 'AUD',
  customer: { fullname: 'Paul', email: 'paul@101digital.io' },
  items: [{ name: 'Honda RC150', quantity: 2, rate: 1000 }],
});

async function errorsFor(payload: object) {
  const dto = plainToInstance(CreateInvoiceDto, payload);
  const errors = await validate(dto);
  // flatten nested errors into plain messages
  const messages: string[] = [];
  const walk = (list: typeof errors) =>
    list.forEach((e) => {
      messages.push(...Object.values(e.constraints ?? {}));
      walk(e.children ?? []);
    });
  walk(errors);
  return messages;
}

describe('CreateInvoiceDto', () => {
  it('accepts a valid payload and applies defaults', async () => {
    const dto = plainToInstance(CreateInvoiceDto, validPayload());
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.taxRate).toBe(10);
    expect(dto.discount).toBe(0);
  });

  describe('due date', () => {
    it('rejects a due date before the invoice date', async () => {
      const messages = await errorsFor({
        ...validPayload(),
        dueDate: '2026-09-30',
      });
      expect(messages).toContain('dueDate must be on or after invoiceDate');
    });

    it('allows the due date to equal the invoice date', async () => {
      const messages = await errorsFor({
        ...validPayload(),
        dueDate: '2026-10-01',
      });
      expect(messages).toHaveLength(0);
    });

    it('rejects dates that do not exist', async () => {
      const messages = await errorsFor({
        ...validPayload(),
        invoiceDate: '2026-02-30',
      });
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  it('requires a valid customer email', async () => {
    const payload = validPayload();
    payload.customer.email = 'not-an-email';
    expect(await errorsFor(payload)).toContain('email must be an email');
  });

  it('rejects a blank customer name', async () => {
    const payload = validPayload();
    payload.customer.fullname = '   ';
    expect(await errorsFor(payload)).toContain('fullname should not be empty');
  });

  it('rejects a non-integer quantity and a zero rate', async () => {
    const messages = await errorsFor({
      ...validPayload(),
      items: [{ name: 'Thing', quantity: 1.5, rate: 0 }],
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        'quantity must be an integer number',
        'rate must be a positive number',
      ]),
    );
  });

  it('only allows exactly one item', async () => {
    const item = { name: 'Thing', quantity: 1, rate: 10 };
    expect(await errorsFor({ ...validPayload(), items: [] })).toContain(
      'items must contain at least 1 elements',
    );
    expect(
      await errorsFor({ ...validPayload(), items: [item, item] }),
    ).toContain('items must contain no more than 1 elements');
  });

  it('rejects negative tax and discount', async () => {
    const messages = await errorsFor({
      ...validPayload(),
      taxRate: -1,
      discount: -5,
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        'taxRate must not be less than 0',
        'discount must not be less than 0',
      ]),
    );
  });

  it('rejects unsupported currencies', async () => {
    const messages = await errorsFor({ ...validPayload(), currency: 'XYZ' });
    expect(messages.length).toBe(1);
  });
});
