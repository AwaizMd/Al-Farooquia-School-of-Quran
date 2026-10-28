-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'ONLINE');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('WAIVER', 'CORRECTION');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "studentId" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "planId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "grossMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "issuedOn" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "unallocatedMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "receivedOn" DATE NOT NULL,
    "recordedById" UUID,
    "note" TEXT,
    "paymentAttemptId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("paymentId","invoiceId")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "fiscalYear" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("fiscalYear")
);

-- CreateTable
CREATE TABLE "fee_adjustments" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "providerRef" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_allocations" (
    "refundId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "refund_allocations_pkey" PRIMARY KEY ("refundId","invoiceId")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "studentId" UUID NOT NULL,
    "payerUserId" UUID NOT NULL,
    "invoiceIds" UUID[],
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "failureReason" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "result" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_studentId_status_idx" ON "invoices"("studentId", "status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_studentId_period_planId_key" ON "invoices"("studentId", "period", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptId_key" ON "payments"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentAttemptId_key" ON "payments"("paymentAttemptId");

-- CreateIndex
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");

-- CreateIndex
CREATE INDEX "payments_receivedOn_idx" ON "payments"("receivedOn");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");

-- CreateIndex
CREATE INDEX "fee_adjustments_invoiceId_idx" ON "fee_adjustments"("invoiceId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_reference_key" ON "payment_attempts"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_providerOrderId_key" ON "payment_attempts"("providerOrderId");

-- CreateIndex
CREATE INDEX "payment_attempts_studentId_status_idx" ON "payment_attempts"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "fee_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money is never negative and allocations never exceed what they split.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts" CHECK ("grossMinor" >= 0 AND "discountMinor" >= 0 AND "discountMinor" <= "grossMinor" AND "amountMinor" = "grossMinor" - "discountMinor");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_period" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "payments" ADD CONSTRAINT "payments_amounts" CHECK ("amountMinor" > 0 AND "unallocatedMinor" >= 0 AND "unallocatedMinor" <= "amountMinor");
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_positive" CHECK ("amountMinor" > 0);

-- Confirmed payments, allocations and receipts are immutable records.
CREATE FUNCTION fees_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed or deleted; record a refund or adjustment instead', TG_TABLE_NAME;
END $$;
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION fees_block_change();
CREATE TRIGGER payment_allocations_immutable BEFORE UPDATE OR DELETE ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION fees_block_change();
CREATE TRIGGER receipts_immutable BEFORE UPDATE OR DELETE ON "receipts" FOR EACH ROW EXECUTE FUNCTION fees_block_change();
CREATE TRIGGER fee_adjustments_immutable BEFORE UPDATE OR DELETE ON "fee_adjustments" FOR EACH ROW EXECUTE FUNCTION fees_block_change();

-- An invoice's amounts are fixed once issued (only status and void reason may change).
CREATE FUNCTION invoices_amounts_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."grossMinor" <> OLD."grossMinor" OR NEW."discountMinor" <> OLD."discountMinor" OR NEW."amountMinor" <> OLD."amountMinor"
     OR NEW."studentId" <> OLD."studentId" OR NEW."period" <> OLD."period" OR NEW."currency" <> OLD."currency" THEN
    RAISE EXCEPTION 'issued invoice amounts cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_fixed BEFORE UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION invoices_amounts_fixed();
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON "invoices" FOR EACH ROW EXECUTE FUNCTION fees_block_change();
