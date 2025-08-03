-- Fix default values for created_at columns
ALTER TABLE "users" 
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "repositories" 
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "integrations" 
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "push_events" 
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "slack_workspaces" 
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP; 