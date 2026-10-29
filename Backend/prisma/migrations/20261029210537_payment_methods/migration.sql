-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('LIBRARY', 'PAYMENT_PROOF', 'UPI_QR');

-- CreateEnum
CREATE TYPE "RazorpayMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "ManualPaymentMethod" AS ENUM ('BANK_TRANSFER', 'UPI');

-- CreateEnum
CREATE TYPE "ManualPaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'NEEDS_INFO', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "PaymentSource" ADD VALUE 'VERIFIED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN     "purpose" "FilePurpose" NOT NULL DEFAULT 'LIBRARY';

-- CreateTable
CREATE TABLE "payment_settings" (
    "institutionId" INTEGER NOT NULL DEFAULT 1,
    "razorpayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "razorpayMode" "RazorpayMode" NOT NULL DEFAULT 'TEST',
    "razorpayKeyId" TEXT,
    "razorpaySecret" BYTEA,
    "razorpayWebhookSecret" BYTEA,
    "razorpayValidatedAt" TIMESTAMPTZ(3),
    "razorpayWebhookVerifiedKeyId" TEXT,
    "razorpayWebhookVerifiedAt" TIMESTAMPTZ(3),
    "bankEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bankAccountName" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankBranch" TEXT,
    "bankAccountType" TEXT,
    "bankInstructions" TEXT,
    "bankReferenceHint" TEXT,
    "bankProofRequired" BOOLEAN NOT NULL DEFAULT false,
    "upiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "upiQrFileId" UUID,
    "upiId" TEXT,
    "upiPayeeName" TEXT,
    "upiInstructions" TEXT,
    "upiProofRequired" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("institutionId")
);

-- CreateTable
CREATE TABLE "manual_payment_submissions" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "method" "ManualPaymentMethod" NOT NULL,
    "invoiceIds" UUID[],
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "paidOn" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "note" TEXT,
    "proofFileId" UUID,
    "status" "ManualPaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "approvedAmountMinor" INTEGER,
    "paymentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manual_payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_settings_upiQrFileId_key" ON "payment_settings"("upiQrFileId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_submissions_proofFileId_key" ON "manual_payment_submissions"("proofFileId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_submissions_paymentId_key" ON "manual_payment_submissions"("paymentId");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_status_createdAt_idx" ON "manual_payment_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_studentId_idx" ON "manual_payment_submissions"("studentId");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_referenceKey_idx" ON "manual_payment_submissions"("referenceKey");

-- AddForeignKey
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institution_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_upiQrFileId_fkey" FOREIGN KEY ("upiQrFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity rules Prisma cannot express (reviewed by hand).
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_amount_positive" CHECK ("amountMinor" > 0 AND ("approvedAmountMinor" IS NULL OR "approvedAmountMinor" > 0));
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_approved_has_payment" CHECK ("status" <> 'APPROVED' OR "paymentId" IS NOT NULL);
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_reference_key" CHECK ("referenceKey" ~ '^[A-Z0-9]{6,35}$');
-- One live claim per UTR/reference: a rejected submission's reference can be used again.
CREATE UNIQUE INDEX "manual_payment_submissions_reference_active" ON "manual_payment_submissions" ("referenceKey") WHERE "status" IN ('PENDING_VERIFICATION', 'NEEDS_INFO', 'APPROVED');
-- A bank/UPI reference or gateway payment id is applied to the ledger at most once.
CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" ("reference") WHERE "reference" IS NOT NULL;
