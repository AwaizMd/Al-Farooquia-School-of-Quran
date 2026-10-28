-- CreateEnum
CREATE TYPE "HostelRollStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE');

-- CreateEnum
CREATE TYPE "LibraryAudience" AS ENUM ('ALL_STUDENTS', 'HIFZ', 'ALIM', 'STAFF_ONLY');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "hostel_rooms" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hostel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_beds" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hostel_beds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_assignments" (
    "id" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "assignedById" UUID,
    "endReason" TEXT,

    CONSTRAINT "bed_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_roll_entries" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "HostelRollStatus" NOT NULL,
    "note" TEXT,
    "markedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hostel_roll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_resources" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "pages" SMALLINT,
    "audience" "LibraryAudience" NOT NULL DEFAULT 'ALL_STUDENTS',
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "fileId" UUID,
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "library_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hostel_rooms_code_key" ON "hostel_rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_beds_roomId_label_key" ON "hostel_beds"("roomId", "label");

-- CreateIndex
CREATE INDEX "bed_assignments_studentId_idx" ON "bed_assignments"("studentId");

-- CreateIndex
CREATE INDEX "bed_assignments_bedId_idx" ON "bed_assignments"("bedId");

-- CreateIndex
CREATE INDEX "hostel_roll_entries_date_idx" ON "hostel_roll_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_roll_entries_studentId_date_key" ON "hostel_roll_entries"("studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "library_resources_fileId_key" ON "library_resources"("fileId");

-- CreateIndex
CREATE INDEX "library_resources_status_category_idx" ON "library_resources"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storageKey_key" ON "stored_files"("storageKey");

-- AddForeignKey
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "hostel_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "hostel_beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_roll_entries" ADD CONSTRAINT "hostel_roll_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_resources" ADD CONSTRAINT "library_resources_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A bed holds one student at a time and a student holds one bed at a time.
CREATE UNIQUE INDEX "bed_assignments_one_open_per_bed" ON "bed_assignments"("bedId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "bed_assignments_one_open_per_student" ON "bed_assignments"("studentId") WHERE "endedAt" IS NULL;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size" CHECK ("sizeBytes" > 0);
