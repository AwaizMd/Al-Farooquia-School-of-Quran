-- CreateEnum
CREATE TYPE "PayComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayComponentCalc" AS ENUM ('FIXED', 'PERCENT_OF_BASIC');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- AlterEnum
ALTER TYPE "Feature" ADD VALUE 'PAYROLL';

-- CreateTable
CREATE TABLE "payroll_configs" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_components" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PayComponentKind" NOT NULL,
    "calc" "PayComponentCalc" NOT NULL,
    "value" INTEGER NOT NULL,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pay_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_salaries" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "basicMinor" INTEGER NOT NULL,
    "exemptFromDeductions" BOOLEAN NOT NULL DEFAULT false,
    "componentValues" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedRunId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "rules" JSONB NOT NULL,
    "preparedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "paidOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "staffName" TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "basicMinor" INTEGER NOT NULL,
    "earningsMinor" INTEGER NOT NULL,
    "deductionsMinor" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "attendance" JSONB NOT NULL,
    "paidLeaveDays" SMALLINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_configs_madrasaId_key" ON "payroll_configs"("madrasaId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_components_madrasaId_name_key" ON "pay_components"("madrasaId", "name");

-- CreateIndex
CREATE INDEX "staff_salaries_madrasaId_idx" ON "staff_salaries"("madrasaId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_salaries_staffId_effectiveFrom_key" ON "staff_salaries"("staffId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "payroll_adjustments_madrasaId_idx" ON "payroll_adjustments"("madrasaId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_staffId_idx" ON "payroll_adjustments"("staffId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_appliedRunId_idx" ON "payroll_adjustments"("appliedRunId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_madrasaId_month_key" ON "payroll_runs"("madrasaId", "month");

-- CreateIndex
CREATE INDEX "payslips_madrasaId_idx" ON "payslips"("madrasaId");

-- CreateIndex
CREATE INDEX "payslips_staffId_idx" ON "payslips"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_runId_staffId_key" ON "payslips"("runId", "staffId");

-- AddForeignKey
ALTER TABLE "payroll_configs" ADD CONSTRAINT "payroll_configs_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salaries" ADD CONSTRAINT "staff_salaries_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salaries" ADD CONSTRAINT "staff_salaries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_appliedRunId_fkey" FOREIGN KEY ("appliedRunId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "staff_salaries" ADD CONSTRAINT "staff_salaries_amount" CHECK ("basicMinor" >= 0);
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_value" CHECK ("value" >= 0 AND ("calc" <> 'PERCENT_OF_BASIC' OR "value" <= 10000));
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_amounts" CHECK ("basicMinor" >= 0 AND "earningsMinor" >= 0 AND "deductionsMinor" >= 0 AND "paidLeaveDays" >= 0 AND "netMinor" = "earningsMinor" - "deductionsMinor");
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_month" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- A row and the rows it points to always share one madrasa.
CREATE TRIGGER "staff_salaries_madrasa_1_staff" BEFORE INSERT ON "staff_salaries" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'staffId');
CREATE TRIGGER "payroll_adjustments_madrasa_1_staff" BEFORE INSERT OR UPDATE ON "payroll_adjustments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'staffId');
CREATE TRIGGER "payroll_adjustments_madrasa_2_run" BEFORE INSERT OR UPDATE ON "payroll_adjustments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('payroll_runs', 'appliedRunId');
CREATE TRIGGER "payslips_madrasa_1_run" BEFORE INSERT ON "payslips" FOR EACH ROW EXECUTE FUNCTION madrasa_link('payroll_runs', 'runId');
CREATE TRIGGER "payslips_madrasa_2_staff" BEFORE INSERT ON "payslips" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'staffId');

-- Salary history is never rewritten: a change is a new row.
CREATE FUNCTION payroll_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed or deleted; add a new record instead', TG_TABLE_NAME;
END $$;
CREATE TRIGGER staff_salaries_immutable BEFORE UPDATE OR DELETE ON "staff_salaries" FOR EACH ROW EXECUTE FUNCTION payroll_block_change();

-- An adjustment can only be marked as applied, once.
CREATE FUNCTION payroll_adjustment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."appliedRunId" IS NOT NULL OR NEW."amountMinor" <> OLD."amountMinor" OR NEW."staffId" <> OLD."staffId" OR NEW."reason" <> OLD."reason" THEN
    RAISE EXCEPTION 'A payroll adjustment cannot be changed or deleted; add another adjustment instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payroll_adjustments_guard BEFORE UPDATE OR DELETE ON "payroll_adjustments" FOR EACH ROW EXECUTE FUNCTION payroll_adjustment_guard();

-- Once approved, a month's figures are final. The only further step is recording that it was paid.
CREATE FUNCTION payroll_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW."month" <> OLD."month" THEN RAISE EXCEPTION 'The month of a payroll cannot be changed'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR NOT (OLD."status" = 'APPROVED' AND NEW."status" = 'PAID' AND NEW."month" = OLD."month" AND NEW."approvedById" IS NOT DISTINCT FROM OLD."approvedById" AND NEW."rules" = OLD."rules") THEN
    RAISE EXCEPTION 'An approved payroll cannot be changed; add an adjustment to the next month instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payroll_runs_guard BEFORE UPDATE OR DELETE ON "payroll_runs" FOR EACH ROW EXECUTE FUNCTION payroll_run_guard();

CREATE FUNCTION payslip_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "PayrollRunStatus";
BEGIN
  SELECT "status" INTO s FROM "payroll_runs" WHERE id = COALESCE(NEW."runId", OLD."runId");
  IF s IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'A payslip of an approved payroll cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payslips_guard BEFORE INSERT OR UPDATE OR DELETE ON "payslips" FOR EACH ROW EXECUTE FUNCTION payslip_guard();
