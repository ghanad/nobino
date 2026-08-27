-- Manual system schedule exceptions are superseded by CalendarDayOverride.
-- Keep imported official holidays and historical audit records intact.
DELETE FROM "ScheduleException"
WHERE "source" = 'MANUAL';
