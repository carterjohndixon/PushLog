-- Add AI summary fields to push_events table
ALTER TABLE "push_events" ADD COLUMN "ai_summary" text;
ALTER TABLE "push_events" ADD COLUMN "ai_impact" text;
ALTER TABLE "push_events" ADD COLUMN "ai_category" text;
ALTER TABLE "push_events" ADD COLUMN "ai_details" text;
ALTER TABLE "push_events" ADD COLUMN "ai_generated" boolean DEFAULT false;
