-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('Draft', 'Pending', 'Paid');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "fullname" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "invoice_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_reference" TEXT,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currency_symbol" TEXT NOT NULL,
    "description" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Draft',
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "customer_mobile" TEXT,
    "customer_address" TEXT,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "sub_total" DECIMAL(12,2) NOT NULL,
    "total_tax" DECIMAL(12,2) NOT NULL,
    "total_discount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "total_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "invoices_total_amount_idx" ON "invoices"("total_amount");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Added by hand: rules Prisma can't express in schema.prisma
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_due_date_check" CHECK ("due_date" >= "invoice_date");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_check" CHECK (
    "sub_total" >= 0 AND "total_tax" >= 0 AND "total_discount" >= 0
    AND "total_amount" >= 0 AND "total_paid" >= 0
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_rate_check" CHECK ("tax_rate" BETWEEN 0 AND 100);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_rate_check" CHECK ("rate" > 0);

-- Trigram indexes so the ILIKE '%keyword%' search doesn't fall back to a full scan
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "invoices_invoice_number_trgm_idx" ON "invoices" USING GIN ("invoice_number" gin_trgm_ops);
CREATE INDEX "invoices_customer_name_trgm_idx" ON "invoices" USING GIN ("customer_name" gin_trgm_ops);
