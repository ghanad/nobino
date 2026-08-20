-- Store the batch timestamp on the survey so one conditional update can gate
-- every reminder batch, including batches with no remaining recipients.
ALTER TABLE "Survey" ADD COLUMN "lastReminderAt" DATETIME;
