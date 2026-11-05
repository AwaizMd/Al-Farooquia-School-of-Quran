-- CR-01 step 3/3 (contract): "madrasaId" becomes required, keys become per-madrasa,
-- triggers keep every child row in its parent's madrasa, and the payment gateway
-- and digital library are removed.

-- Refuse to drop anything that holds real records: stop and ask the owner instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "library_resources") THEN
    RAISE EXCEPTION 'CR-01: library_resources holds data. Removing the library needs the owner''s approval first.';
  END IF;
  IF EXISTS (SELECT 1 FROM "payments" WHERE "method" = 'ONLINE' OR "source" = 'ONLINE') OR EXISTS (SELECT 1 FROM "payment_attempts" WHERE "status" = 'SUCCEEDED') THEN
    RAISE EXCEPTION 'CR-01: online gateway payments exist. Removing the gateway needs the owner''s approval first.';
  END IF;
  IF EXISTS (SELECT 1 FROM "groups" WHERE "madrasaId" IS NULL) OR EXISTS (SELECT 1 FROM "students" WHERE "madrasaId" IS NULL) THEN
    RAISE EXCEPTION 'CR-01: rows without a madrasa after the backfill.';
  END IF;
END $$;

-- ---------- Payment gateway (Razorpay) ----------
ALTER TABLE "payments" DROP CONSTRAINT "payments_paymentAttemptId_fkey";
DROP INDEX "payments_paymentAttemptId_key";
ALTER TABLE "payments" DISABLE TRIGGER "payments_immutable";
ALTER TABLE "payments" DROP COLUMN "paymentAttemptId";
ALTER TABLE "payments" ENABLE TRIGGER "payments_immutable";
DROP TABLE "payment_attempts";
DROP TABLE "webhook_events";
DROP TYPE "PaymentAttemptStatus";
ALTER TABLE "refunds" DROP COLUMN "providerRef";
ALTER TABLE "payment_settings" DROP CONSTRAINT "payment_settings_institutionId_fkey";
ALTER TABLE "payment_settings" DROP CONSTRAINT "payment_settings_pkey",
  DROP COLUMN "institutionId",
  DROP COLUMN "razorpayEnabled",
  DROP COLUMN "razorpayKeyId",
  DROP COLUMN "razorpayMode",
  DROP COLUMN "razorpaySecret",
  DROP COLUMN "razorpayValidatedAt",
  DROP COLUMN "razorpayWebhookSecret",
  DROP COLUMN "razorpayWebhookVerifiedAt",
  DROP COLUMN "razorpayWebhookVerifiedKeyId";
DROP TYPE "RazorpayMode";

ALTER TABLE "payments" DISABLE TRIGGER "payments_immutable";
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE');
ALTER TABLE "payments" ALTER COLUMN "method" TYPE "PaymentMethod_new" USING ("method"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "PaymentMethod_old";
CREATE TYPE "PaymentSource_new" AS ENUM ('MANUAL', 'VERIFIED');
ALTER TABLE "payments" ALTER COLUMN "source" TYPE "PaymentSource_new" USING ("source"::text::"PaymentSource_new");
ALTER TYPE "PaymentSource" RENAME TO "PaymentSource_old";
ALTER TYPE "PaymentSource_new" RENAME TO "PaymentSource";
DROP TYPE "PaymentSource_old";
ALTER TABLE "payments" ENABLE TRIGGER "payments_immutable";

-- ---------- Digital library ----------
ALTER TABLE "library_resources" DROP CONSTRAINT "library_resources_fileId_fkey";
DROP TABLE "library_resources";
DROP TYPE "LibraryAudience";
DROP TYPE "ResourceStatus";
CREATE TYPE "FilePurpose_new" AS ENUM ('PAYMENT_PROOF', 'UPI_QR');
ALTER TABLE "stored_files" ALTER COLUMN "purpose" DROP DEFAULT;
DELETE FROM "stored_files" WHERE "purpose" = 'LIBRARY';
ALTER TABLE "stored_files" ALTER COLUMN "purpose" TYPE "FilePurpose_new" USING ("purpose"::text::"FilePurpose_new");
ALTER TYPE "FilePurpose" RENAME TO "FilePurpose_old";
ALTER TYPE "FilePurpose_new" RENAME TO "FilePurpose";
DROP TYPE "FilePurpose_old";

-- ---------- madrasaId required ----------
ALTER TABLE "groups" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "staff_profiles" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "group_mentor_assignments" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "students" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "student_guardians" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "group_enrollments" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "attendance_sessions" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "attendance_records" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "attendance_corrections" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "learning_records" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "learning_record_revisions" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "grading_scales" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "grade_bands" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "exams" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "exam_groups" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "exam_subjects" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "exam_results" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "exam_marks" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "fee_plans" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "payment_allocations" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "receipts" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "receipt_sequences" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "fee_adjustments" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "refunds" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "refund_allocations" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "concessions" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "hostel_rooms" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "hostel_beds" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "bed_assignments" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "hostel_roll_entries" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "reminder_rules" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "message_templates" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "scheduled_report_config" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "report_runs" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "payment_settings" ALTER COLUMN "madrasaId" SET NOT NULL;
ALTER TABLE "manual_payment_submissions" ALTER COLUMN "madrasaId" SET NOT NULL;

-- ---------- Keys ----------
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("madrasaId");
ALTER TABLE "receipt_sequences" DROP CONSTRAINT "receipt_sequences_pkey", ADD CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("madrasaId", "fiscalYear");
ALTER TABLE "reminder_rules" DROP CONSTRAINT "reminder_rules_pkey", ADD CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("madrasaId", "key");
ALTER TABLE "message_templates" DROP CONSTRAINT "message_templates_pkey", ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("madrasaId", "key");
ALTER TABLE "scheduled_report_config" DROP CONSTRAINT "scheduled_report_config_pkey", DROP COLUMN "id", ADD CONSTRAINT "scheduled_report_config_pkey" PRIMARY KEY ("madrasaId");

DROP INDEX "groups_code_key";
DROP INDEX "staff_profiles_code_key";
DROP INDEX "staff_profiles_userId_key";
DROP INDEX "students_admissionNo_key";
DROP INDEX "grading_scales_version_key";
DROP INDEX "grading_scales_one_active";
DROP INDEX "exams_code_key";
DROP INDEX "fee_plans_code_key";
DROP INDEX "invoices_number_key";
DROP INDEX "receipts_number_key";
DROP INDEX "hostel_rooms_code_key";
DROP INDEX "report_runs_periodKey_key";
DROP INDEX "manual_payment_submissions_reference_active";
DROP INDEX "payments_reference_unique";

CREATE UNIQUE INDEX "groups_madrasaId_code_key" ON "groups"("madrasaId", "code");
CREATE UNIQUE INDEX "staff_profiles_madrasaId_code_key" ON "staff_profiles"("madrasaId", "code");
CREATE UNIQUE INDEX "staff_profiles_madrasaId_userId_key" ON "staff_profiles"("madrasaId", "userId");
CREATE UNIQUE INDEX "students_madrasaId_admissionNo_key" ON "students"("madrasaId", "admissionNo");
CREATE UNIQUE INDEX "grading_scales_madrasaId_version_key" ON "grading_scales"("madrasaId", "version");
CREATE UNIQUE INDEX "grading_scales_one_active" ON "grading_scales"("madrasaId") WHERE "active";
CREATE UNIQUE INDEX "exams_madrasaId_code_key" ON "exams"("madrasaId", "code");
CREATE UNIQUE INDEX "fee_plans_madrasaId_code_key" ON "fee_plans"("madrasaId", "code");
CREATE UNIQUE INDEX "invoices_madrasaId_number_key" ON "invoices"("madrasaId", "number");
CREATE UNIQUE INDEX "receipts_madrasaId_number_key" ON "receipts"("madrasaId", "number");
CREATE UNIQUE INDEX "hostel_rooms_madrasaId_code_key" ON "hostel_rooms"("madrasaId", "code");
CREATE UNIQUE INDEX "report_runs_madrasaId_periodKey_key" ON "report_runs"("madrasaId", "periodKey");
-- One live claim per UTR / cheque reference in each madrasa; one payment per reference.
CREATE UNIQUE INDEX "manual_payment_submissions_reference_active" ON "manual_payment_submissions" ("madrasaId", "referenceKey") WHERE "status" IN ('PENDING_VERIFICATION', 'NEEDS_INFO', 'APPROVED');
CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" ("madrasaId", "reference") WHERE "reference" IS NOT NULL;

CREATE INDEX "groups_madrasaId_idx" ON "groups"("madrasaId");
CREATE INDEX "staff_profiles_madrasaId_idx" ON "staff_profiles"("madrasaId");
CREATE INDEX "group_mentor_assignments_madrasaId_idx" ON "group_mentor_assignments"("madrasaId");
CREATE INDEX "students_madrasaId_idx" ON "students"("madrasaId");
CREATE INDEX "student_guardians_madrasaId_idx" ON "student_guardians"("madrasaId");
CREATE INDEX "group_enrollments_madrasaId_idx" ON "group_enrollments"("madrasaId");
CREATE INDEX "attendance_sessions_madrasaId_idx" ON "attendance_sessions"("madrasaId");
CREATE INDEX "attendance_records_madrasaId_idx" ON "attendance_records"("madrasaId");
CREATE INDEX "attendance_corrections_madrasaId_idx" ON "attendance_corrections"("madrasaId");
CREATE INDEX "learning_records_madrasaId_idx" ON "learning_records"("madrasaId");
CREATE INDEX "learning_record_revisions_madrasaId_idx" ON "learning_record_revisions"("madrasaId");
CREATE INDEX "grading_scales_madrasaId_idx" ON "grading_scales"("madrasaId");
CREATE INDEX "grade_bands_madrasaId_idx" ON "grade_bands"("madrasaId");
CREATE INDEX "exams_madrasaId_idx" ON "exams"("madrasaId");
CREATE INDEX "exam_groups_madrasaId_idx" ON "exam_groups"("madrasaId");
CREATE INDEX "exam_subjects_madrasaId_idx" ON "exam_subjects"("madrasaId");
CREATE INDEX "exam_results_madrasaId_idx" ON "exam_results"("madrasaId");
CREATE INDEX "exam_marks_madrasaId_idx" ON "exam_marks"("madrasaId");
CREATE INDEX "fee_plans_madrasaId_idx" ON "fee_plans"("madrasaId");
CREATE INDEX "invoices_madrasaId_idx" ON "invoices"("madrasaId");
CREATE INDEX "payments_madrasaId_idx" ON "payments"("madrasaId");
CREATE INDEX "payment_allocations_madrasaId_idx" ON "payment_allocations"("madrasaId");
CREATE INDEX "receipts_madrasaId_idx" ON "receipts"("madrasaId");
CREATE INDEX "fee_adjustments_madrasaId_idx" ON "fee_adjustments"("madrasaId");
CREATE INDEX "refunds_madrasaId_idx" ON "refunds"("madrasaId");
CREATE INDEX "refund_allocations_madrasaId_idx" ON "refund_allocations"("madrasaId");
CREATE INDEX "concessions_madrasaId_idx" ON "concessions"("madrasaId");
CREATE INDEX "hostel_rooms_madrasaId_idx" ON "hostel_rooms"("madrasaId");
CREATE INDEX "hostel_beds_madrasaId_idx" ON "hostel_beds"("madrasaId");
CREATE INDEX "bed_assignments_madrasaId_idx" ON "bed_assignments"("madrasaId");
CREATE INDEX "hostel_roll_entries_madrasaId_idx" ON "hostel_roll_entries"("madrasaId");
CREATE INDEX "report_runs_madrasaId_idx" ON "report_runs"("madrasaId");
CREATE INDEX "manual_payment_submissions_madrasaId_idx" ON "manual_payment_submissions"("madrasaId");
CREATE INDEX "audit_logs_madrasaId_at_idx" ON "audit_logs"("madrasaId", "at" DESC);

-- ---------- Foreign keys ----------
ALTER TABLE "groups" ADD CONSTRAINT "groups_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_mentor_assignments" ADD CONSTRAINT "group_mentor_assignments_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_record_revisions" ADD CONSTRAINT "learning_record_revisions_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exams" ADD CONSTRAINT "exams_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_groups" ADD CONSTRAINT "exam_groups_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hostel_roll_entries" ADD CONSTRAINT "hostel_roll_entries_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scheduled_report_config" ADD CONSTRAINT "scheduled_report_config_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- A row and the rows it points to always share one madrasa ----------
-- madrasa_link(parent_table, fk_column): copies "madrasaId" from the parent when the
-- row has none (child rows, nested creates) and rejects a row whose madrasa differs
-- from the parent's. Triggers fire in name order, so the "_1_" one derives first.
CREATE FUNCTION madrasa_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_madrasa UUID;
  ref UUID;
BEGIN
  EXECUTE format('SELECT ($1).%I::uuid', TG_ARGV[1]) INTO ref USING NEW;
  IF ref IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT "madrasaId" FROM %I WHERE "id" = $1', TG_ARGV[0]) INTO parent_madrasa USING ref;
  IF parent_madrasa IS NULL THEN
    RETURN NEW; -- the foreign key reports a missing parent
  END IF;
  IF NEW."madrasaId" IS NULL THEN
    NEW."madrasaId" := parent_madrasa;
  ELSIF NEW."madrasaId" <> parent_madrasa THEN
    RAISE EXCEPTION 'madrasa mismatch: % row and its % belong to different madrasas', TG_TABLE_NAME, TG_ARGV[0] USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "students_madrasa_1_group" BEFORE INSERT OR UPDATE OF "groupId", "madrasaId" ON "students" FOR EACH ROW EXECUTE FUNCTION madrasa_link('groups', 'groupId');
CREATE TRIGGER "students_madrasa_2_plan" BEFORE INSERT OR UPDATE OF "feePlanId", "madrasaId" ON "students" FOR EACH ROW EXECUTE FUNCTION madrasa_link('fee_plans', 'feePlanId');
CREATE TRIGGER "group_mentor_assignments_madrasa_1_group" BEFORE INSERT OR UPDATE ON "group_mentor_assignments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('groups', 'groupId');
CREATE TRIGGER "group_mentor_assignments_madrasa_2_staff" BEFORE INSERT OR UPDATE ON "group_mentor_assignments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'staffId');
CREATE TRIGGER "student_guardians_madrasa_1_student" BEFORE INSERT OR UPDATE ON "student_guardians" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "group_enrollments_madrasa_1_student" BEFORE INSERT OR UPDATE ON "group_enrollments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "group_enrollments_madrasa_2_group" BEFORE INSERT OR UPDATE ON "group_enrollments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('groups', 'groupId');
CREATE TRIGGER "attendance_sessions_madrasa_1_group" BEFORE INSERT OR UPDATE ON "attendance_sessions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('groups', 'groupId');
CREATE TRIGGER "attendance_records_madrasa_1_session" BEFORE INSERT OR UPDATE ON "attendance_records" FOR EACH ROW EXECUTE FUNCTION madrasa_link('attendance_sessions', 'sessionId');
CREATE TRIGGER "attendance_records_madrasa_2_student" BEFORE INSERT OR UPDATE ON "attendance_records" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "attendance_corrections_madrasa_1_record" BEFORE INSERT ON "attendance_corrections" FOR EACH ROW EXECUTE FUNCTION madrasa_link('attendance_records', 'recordId');
CREATE TRIGGER "learning_records_madrasa_1_student" BEFORE INSERT OR UPDATE ON "learning_records" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "learning_records_madrasa_2_mentor" BEFORE INSERT OR UPDATE ON "learning_records" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'mentorId');
CREATE TRIGGER "learning_record_revisions_madrasa_1_record" BEFORE INSERT ON "learning_record_revisions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('learning_records', 'recordId');
CREATE TRIGGER "grade_bands_madrasa_1_scale" BEFORE INSERT OR UPDATE ON "grade_bands" FOR EACH ROW EXECUTE FUNCTION madrasa_link('grading_scales', 'scaleId');
CREATE TRIGGER "exams_madrasa_1_examiner" BEFORE INSERT OR UPDATE ON "exams" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'examinerId');
CREATE TRIGGER "exams_madrasa_2_scale" BEFORE INSERT OR UPDATE ON "exams" FOR EACH ROW EXECUTE FUNCTION madrasa_link('grading_scales', 'gradingScaleId');
CREATE TRIGGER "exam_groups_madrasa_1_exam" BEFORE INSERT OR UPDATE ON "exam_groups" FOR EACH ROW EXECUTE FUNCTION madrasa_link('exams', 'examId');
CREATE TRIGGER "exam_groups_madrasa_2_group" BEFORE INSERT OR UPDATE ON "exam_groups" FOR EACH ROW EXECUTE FUNCTION madrasa_link('groups', 'groupId');
CREATE TRIGGER "exam_subjects_madrasa_1_exam" BEFORE INSERT OR UPDATE ON "exam_subjects" FOR EACH ROW EXECUTE FUNCTION madrasa_link('exams', 'examId');
CREATE TRIGGER "exam_results_madrasa_1_exam" BEFORE INSERT OR UPDATE ON "exam_results" FOR EACH ROW EXECUTE FUNCTION madrasa_link('exams', 'examId');
CREATE TRIGGER "exam_results_madrasa_2_student" BEFORE INSERT OR UPDATE ON "exam_results" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "exam_marks_madrasa_1_result" BEFORE INSERT OR UPDATE ON "exam_marks" FOR EACH ROW EXECUTE FUNCTION madrasa_link('exam_results', 'resultId');
CREATE TRIGGER "exam_marks_madrasa_2_subject" BEFORE INSERT OR UPDATE ON "exam_marks" FOR EACH ROW EXECUTE FUNCTION madrasa_link('exam_subjects', 'subjectId');
CREATE TRIGGER "invoices_madrasa_1_student" BEFORE INSERT ON "invoices" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "invoices_madrasa_2_plan" BEFORE INSERT ON "invoices" FOR EACH ROW EXECUTE FUNCTION madrasa_link('fee_plans', 'planId');
CREATE TRIGGER "payments_madrasa_1_student" BEFORE INSERT ON "payments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "payments_madrasa_2_receipt" BEFORE INSERT ON "payments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('receipts', 'receiptId');
CREATE TRIGGER "payment_allocations_madrasa_1_payment" BEFORE INSERT ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION madrasa_link('payments', 'paymentId');
CREATE TRIGGER "payment_allocations_madrasa_2_invoice" BEFORE INSERT ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION madrasa_link('invoices', 'invoiceId');
CREATE TRIGGER "fee_adjustments_madrasa_1_invoice" BEFORE INSERT ON "fee_adjustments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('invoices', 'invoiceId');
CREATE TRIGGER "refunds_madrasa_1_payment" BEFORE INSERT ON "refunds" FOR EACH ROW EXECUTE FUNCTION madrasa_link('payments', 'paymentId');
CREATE TRIGGER "refund_allocations_madrasa_1_refund" BEFORE INSERT ON "refund_allocations" FOR EACH ROW EXECUTE FUNCTION madrasa_link('refunds', 'refundId');
CREATE TRIGGER "refund_allocations_madrasa_2_invoice" BEFORE INSERT ON "refund_allocations" FOR EACH ROW EXECUTE FUNCTION madrasa_link('invoices', 'invoiceId');
CREATE TRIGGER "concessions_madrasa_1_student" BEFORE INSERT ON "concessions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "hostel_beds_madrasa_1_room" BEFORE INSERT OR UPDATE ON "hostel_beds" FOR EACH ROW EXECUTE FUNCTION madrasa_link('hostel_rooms', 'roomId');
CREATE TRIGGER "bed_assignments_madrasa_1_bed" BEFORE INSERT ON "bed_assignments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('hostel_beds', 'bedId');
CREATE TRIGGER "bed_assignments_madrasa_2_student" BEFORE INSERT ON "bed_assignments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "hostel_roll_entries_madrasa_1_student" BEFORE INSERT OR UPDATE ON "hostel_roll_entries" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "manual_payment_submissions_madrasa_1_student" BEFORE INSERT ON "manual_payment_submissions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
