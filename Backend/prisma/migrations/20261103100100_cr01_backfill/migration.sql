-- CR-01 step 2/3 (backfill): the existing installation becomes the organization's
-- first madrasa (code MAIN) and every existing row is assigned to it. Staff roles
-- move to madrasa memberships; existing administrators also become Super Admins.
-- On an empty database (nothing configured yet) no madrasa is created: setup does that.

DO $$
DECLARE
  inst RECORD;
  mid UUID;
  has_data BOOLEAN;
BEGIN
  SELECT * INTO inst FROM "institution_settings" WHERE "id" = 1;
  has_data := EXISTS (SELECT 1 FROM "groups") OR EXISTS (SELECT 1 FROM "students") OR EXISTS (SELECT 1 FROM "staff_profiles")
           OR EXISTS (SELECT 1 FROM "user_roles" WHERE "role" <> 'PARENT' AND "role" <> 'STUDENT') OR EXISTS (SELECT 1 FROM "fee_plans");
  IF inst IS NULL AND NOT has_data THEN
    -- Nothing configured yet: the defaults earlier migrations inserted (grading scale,
    -- reminder rules, message template, report schedule) are created per madrasa from now on.
    DELETE FROM "grade_bands";
    DELETE FROM "grading_scales";
    DELETE FROM "reminder_rules";
    DELETE FROM "message_templates";
    DELETE FROM "scheduled_report_config";
    RETURN;
  END IF;

  INSERT INTO "organizations" ("id", "name", "shortName", "nameArabic", "tagline", "address", "phone", "email", "updatedAt")
  VALUES (1, COALESCE(inst."brandName", 'Madarsa'), COALESCE(inst."shortName", 'Madarsa'), COALESCE(inst."brandArabic", ''), COALESCE(inst."tagline", ''),
          COALESCE(inst."address", ''), COALESCE(inst."phone", ''), COALESCE(inst."email", ''), now());

  mid := gen_random_uuid();
  INSERT INTO "madrasas" ("id", "organizationId", "code", "name", "shortName", "nameArabic", "address", "phone", "email", "updatedAt")
  VALUES (mid, 1, 'MAIN', COALESCE(inst."brandName", 'Main Madarsa'), COALESCE(inst."shortName", 'Main'), inst."brandArabic",
          COALESCE(inst."address", ''), COALESCE(inst."phone", ''), COALESCE(inst."email", ''), now());

  INSERT INTO "madrasa_settings" ("madrasaId", "currency", "timezone", "weeklyOff", "feeDueDay", "config", "updatedAt")
  VALUES (mid, COALESCE(inst."currency", 'INR'), COALESCE(inst."timezone", 'Asia/Kolkata'), COALESCE(inst."weeklyOff", 5), COALESCE(inst."feeDueDay", 10), '{}', now());

  -- Modules that existed before CR-01 stay on; new ones start off until configured.
  INSERT INTO "madrasa_features" ("madrasaId", "feature", "enabled", "updatedAt")
  SELECT mid, f::"Feature", f IN ('HOSTEL', 'FEES', 'ASSESSMENTS', 'SCHEDULED_REPORTS'), now()
  FROM unnest(ARRAY['HOSTEL', 'FEES', 'ACCOUNTS', 'NAMAZ_TRACKING', 'STAFF_ATTENDANCE', 'ASSESSMENTS', 'SCHEDULED_REPORTS', 'BIOMETRIC']) AS f;

  -- Fee records are append-only (triggers block UPDATE); lift that only for this one-time assignment.
  ALTER TABLE "payments" DISABLE TRIGGER "payments_immutable";
  ALTER TABLE "payment_allocations" DISABLE TRIGGER "payment_allocations_immutable";
  ALTER TABLE "receipts" DISABLE TRIGGER "receipts_immutable";
  ALTER TABLE "fee_adjustments" DISABLE TRIGGER "fee_adjustments_immutable";

  UPDATE "groups" SET "madrasaId" = mid;
  UPDATE "staff_profiles" SET "madrasaId" = mid;
  UPDATE "group_mentor_assignments" SET "madrasaId" = mid;
  UPDATE "students" SET "madrasaId" = mid;
  UPDATE "student_guardians" SET "madrasaId" = mid;
  UPDATE "group_enrollments" SET "madrasaId" = mid;
  UPDATE "attendance_sessions" SET "madrasaId" = mid;
  UPDATE "attendance_records" SET "madrasaId" = mid;
  UPDATE "attendance_corrections" SET "madrasaId" = mid;
  UPDATE "learning_records" SET "madrasaId" = mid;
  UPDATE "learning_record_revisions" SET "madrasaId" = mid;
  UPDATE "grading_scales" SET "madrasaId" = mid;
  UPDATE "grade_bands" SET "madrasaId" = mid;
  UPDATE "exams" SET "madrasaId" = mid;
  UPDATE "exam_groups" SET "madrasaId" = mid;
  UPDATE "exam_subjects" SET "madrasaId" = mid;
  UPDATE "exam_results" SET "madrasaId" = mid;
  UPDATE "exam_marks" SET "madrasaId" = mid;
  UPDATE "fee_plans" SET "madrasaId" = mid;
  UPDATE "invoices" SET "madrasaId" = mid;
  UPDATE "payments" SET "madrasaId" = mid;
  UPDATE "payment_allocations" SET "madrasaId" = mid;
  UPDATE "receipts" SET "madrasaId" = mid;
  UPDATE "receipt_sequences" SET "madrasaId" = mid;
  UPDATE "fee_adjustments" SET "madrasaId" = mid;
  UPDATE "refunds" SET "madrasaId" = mid;
  UPDATE "refund_allocations" SET "madrasaId" = mid;
  UPDATE "concessions" SET "madrasaId" = mid;
  UPDATE "hostel_rooms" SET "madrasaId" = mid;
  UPDATE "hostel_beds" SET "madrasaId" = mid;
  UPDATE "bed_assignments" SET "madrasaId" = mid;
  UPDATE "hostel_roll_entries" SET "madrasaId" = mid;
  UPDATE "reminder_rules" SET "madrasaId" = mid;
  UPDATE "message_templates" SET "madrasaId" = mid;
  UPDATE "scheduled_report_config" SET "madrasaId" = mid;
  UPDATE "report_runs" SET "madrasaId" = mid;
  UPDATE "payment_settings" SET "madrasaId" = mid;
  UPDATE "manual_payment_submissions" SET "madrasaId" = mid;
  UPDATE "notification_deliveries" SET "madrasaId" = mid;
  UPDATE "users" SET "homeMadrasaId" = mid;
  -- audit_logs are append-only and keep "madrasaId" NULL for entries written before CR-01.

  ALTER TABLE "payments" ENABLE TRIGGER "payments_immutable";
  ALTER TABLE "payment_allocations" ENABLE TRIGGER "payment_allocations_immutable";
  ALTER TABLE "receipts" ENABLE TRIGGER "receipts_immutable";
  ALTER TABLE "fee_adjustments" ENABLE TRIGGER "fee_adjustments_immutable";

  -- Staff roles become memberships of this madrasa.
  INSERT INTO "madrasa_memberships" ("id", "userId", "madrasaId", "role", "active", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), "userId", mid, "role", true, "grantedAt", now()
  FROM "user_roles" WHERE "role" IN ('MADRASA_ADMIN', 'PRINCIPAL', 'MENTOR', 'WARDEN');
  -- Whoever administered the single-madrasa installation now administers the organization.
  INSERT INTO "user_roles" ("userId", "role", "grantedAt")
  SELECT "userId", 'SUPER_ADMIN', now() FROM "user_roles" WHERE "role" = 'MADRASA_ADMIN'
  ON CONFLICT DO NOTHING;
  DELETE FROM "user_roles" WHERE "role" IN ('MADRASA_ADMIN', 'PRINCIPAL', 'MENTOR', 'WARDEN');
END $$;

-- The new staff and organization roles must use two-step verification, like the existing staff roles.
INSERT INTO "mfa_policies" ("role", "required", "updatedAt")
VALUES ('SUPER_ADMIN', true, now()), ('COMMITTEE_MEMBER', true, now()), ('CA', true, now()), ('ACCOUNTANT', true, now())
ON CONFLICT ("role") DO NOTHING;
