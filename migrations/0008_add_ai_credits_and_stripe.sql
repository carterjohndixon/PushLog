-- Add AI credits and Stripe fields to users table
ALTER TABLE "users" ADD COLUMN "ai_credits" integer DEFAULT 1000;
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;
ALTER TABLE "users" ADD COLUMN "preferred_ai_model" text DEFAULT 'gpt-3.5-turbo';

-- Add AI settings to integrations table
ALTER TABLE "integrations" ADD COLUMN "ai_model" text DEFAULT 'gpt-3.5-turbo';
ALTER TABLE "integrations" ADD COLUMN "max_tokens" integer DEFAULT 350;

-- Create ai_usage table
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"integration_id" integer NOT NULL,
	"push_event_id" integer NOT NULL,
	"model" text NOT NULL,
	"tokens_used" integer NOT NULL,
	"cost" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Create payments table
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stripe_payment_intent_id" text NOT NULL,
	"amount" integer NOT NULL,
	"credits" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
