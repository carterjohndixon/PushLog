CREATE TABLE "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"repository_id" integer NOT NULL,
	"slack_channel_id" text NOT NULL,
	"slack_channel_name" text NOT NULL,
	"notification_level" text DEFAULT 'all',
	"include_commit_summaries" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"repository_id" integer NOT NULL,
	"integration_id" integer NOT NULL,
	"commit_sha" text NOT NULL,
	"commit_message" text NOT NULL,
	"author" text NOT NULL,
	"branch" text NOT NULL,
	"pushed_at" timestamp NOT NULL,
	"notification_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"github_id" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"owner" text NOT NULL,
	"branch" text DEFAULT 'main',
	"is_active" boolean DEFAULT true,
	"webhook_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "slack_workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"access_token" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"github_id" text,
	"github_token" text,
	"slack_user_id" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
