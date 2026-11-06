-- Quran lessons are measured in safah (pages), e.g. 1 or 1.5, in a Para: not by ayah
-- range. Stored in quarters of a safah (6 = 1.5) so the amount stays a whole number.
-- Lessons already recorded by ayah range are kept exactly as they are.
ALTER TABLE "learning_records" ADD COLUMN "safahQuarters" SMALLINT;

ALTER TABLE "learning_records" DROP CONSTRAINT "learning_records_shape";
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_shape" CHECK (
  ("category" = 'QAIDA' AND "qaidaLesson" IS NOT NULL AND "surah" IS NULL AND "safahQuarters" IS NULL)
  OR ("category" <> 'QAIDA' AND "qaidaLesson" IS NULL AND (
    ("safahQuarters" IS NOT NULL AND "juz" IS NOT NULL)
    OR ("surah" IS NOT NULL AND "fromAyah" IS NOT NULL AND "toAyah" IS NOT NULL)
  ))
);
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_safah_range" CHECK ("safahQuarters" IS NULL OR "safahQuarters" BETWEEN 1 AND 400);
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_juz_range" CHECK ("juz" IS NULL OR "juz" BETWEEN 1 AND 30);
