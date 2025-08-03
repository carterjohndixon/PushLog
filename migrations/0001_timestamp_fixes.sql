-- Update timestamp columns to use timestamptz and ensure they're not null
ALTER TABLE "users" 
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "repositories" 
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "integrations" 
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "push_events" 
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "slack_workspaces" 
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN "created_at" SET NOT NULL; 