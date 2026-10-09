-- Payment mode, the currency/amount actually received with its exchange rate,
-- and tax withheld by the customer (TDS / withholding tax).
-- Written by hand so existing payments are backfilled instead of failing.

CREATE TYPE "PaymentMethod" AS ENUM ('BankTransfer', 'Cash', 'BankRemittance');

ALTER TABLE "payments"
  ADD COLUMN "method" "PaymentMethod",
  ADD COLUMN "amount_received" DECIMAL(12,2),
  ADD COLUMN "currency" CHAR(3),
  ADD COLUMN "exchange_rate" DECIMAL(18,6),
  ADD COLUMN "tax_withheld" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Existing payments: a bank transfer in the invoice's own currency, no tax withheld
UPDATE "payments" p
SET "method" = 'BankTransfer',
    "amount_received" = p."amount",
    "currency" = i."currency",
    "exchange_rate" = 1
FROM "invoices" i
WHERE i."invoice_id" = p."invoice_id";

ALTER TABLE "payments"
  ALTER COLUMN "method" SET NOT NULL,
  ALTER COLUMN "amount_received" SET NOT NULL,
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "exchange_rate" SET NOT NULL;

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_received_check" CHECK ("amount_received" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_exchange_rate_check" CHECK ("exchange_rate" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_tax_withheld_check" CHECK ("tax_withheld" >= 0);
-- What's settled against the invoice is always the converted amount plus the tax withheld
ALTER TABLE "payments" ADD CONSTRAINT "payments_settled_amount_check"
  CHECK ("amount" = ROUND("amount_received" * "exchange_rate", 2) + "tax_withheld");
