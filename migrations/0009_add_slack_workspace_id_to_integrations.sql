-- Add slack_workspace_id column to integrations table
-- This links integrations to specific Slack workspaces for multi-workspace support
ALTER TABLE "integrations" ADD COLUMN "slack_workspace_id" integer;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "integrations_slack_workspace_id_idx" ON "integrations" ("slack_workspace_id");
