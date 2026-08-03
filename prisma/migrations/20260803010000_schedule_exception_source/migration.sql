-- AlterTable
ALTER TABLE "ScheduleException" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- Backfill exceptions that were created by the Iran-holiday import flow.
UPDATE "ScheduleException"
SET "source" = 'IRAN_HOLIDAY'
WHERE "id" IN (
  SELECT "entityId"
  FROM "AuditLog"
  WHERE "action" = 'SCHEDULE_EXCEPTION_CREATED'
    AND json_extract("newValue", '$.importedFrom') = 'iran_holidays'
);
