-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'WrittenOff';

-- CreateEnum
CREATE TYPE "WriteOffReason" AS ENUM ('BadDebt', 'Dispute', 'BankCharges', 'ExchangeDifference', 'Rounding', 'SettlementDiscount', 'Other');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "total_written_off" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "write_offs" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" "WriteOffReason" NOT NULL,
    "note" TEXT,
    "written_off_at" DATE NOT NULL,
    "payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "write_offs_payment_id_key" ON "write_offs"("payment_id");

-- CreateIndex
CREATE INDEX "write_offs_invoice_id_idx" ON "write_offs"("invoice_id");

-- AddForeignKey
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Added by hand: the balance always adds up, and closed invoices owe nothing.
-- (The enum value added above can't be used in this transaction, hence the cast to text.)
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_amount_check" CHECK ("amount" > 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_written_off_check" CHECK ("total_written_off" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_balance_check"
  CHECK ("balance_amount" >= 0 AND "balance_amount" = "total_amount" - "total_paid" - "total_written_off");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_closed_balance_check"
  CHECK ("status"::text NOT IN ('Paid', 'WrittenOff') OR "balance_amount" = 0);
