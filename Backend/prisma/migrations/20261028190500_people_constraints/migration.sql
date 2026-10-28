-- One current mentor per halqa, one open concession per student.
CREATE UNIQUE INDEX "group_mentor_assignments_one_open_per_group" ON "group_mentor_assignments"("groupId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "concessions_one_open_per_student" ON "concessions"("studentId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "group_enrollments_one_open_per_student" ON "group_enrollments"("studentId") WHERE "endedOn" IS NULL;
CREATE UNIQUE INDEX "student_guardians_one_primary" ON "student_guardians"("studentId") WHERE "isPrimary";

ALTER TABLE "concessions" ADD CONSTRAINT "concessions_percent_range" CHECK ("percent" BETWEEN 1 AND 100);
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_amount_nonnegative" CHECK ("amountMinor" >= 0);

-- Admission, staff and guardian numbers are issued from sequences so they are never reused.
CREATE SEQUENCE "admission_no_seq" START 1001;
CREATE SEQUENCE "staff_code_seq" START 1;
CREATE SEQUENCE "guardian_code_seq" START 1;
