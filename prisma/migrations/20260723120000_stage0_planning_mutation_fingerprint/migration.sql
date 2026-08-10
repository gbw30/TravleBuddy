-- Bind idempotent planning replays to their normalized validated request.
ALTER TABLE "planning_mutations"
ADD COLUMN "request_fingerprint" CHAR(64);
