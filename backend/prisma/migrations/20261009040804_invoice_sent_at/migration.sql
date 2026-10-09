-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "sent_at" TIMESTAMP(3);

-- Added by hand: invoices already sent before this column existed get their
-- creation time as a best guess, then keep the column consistent with status
UPDATE "invoices" SET "sent_at" = "created_at" WHERE "status" <> 'Draft' AND "sent_at" IS NULL;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sent_at_check" CHECK (("status" = 'Draft') = ("sent_at" IS NULL));
