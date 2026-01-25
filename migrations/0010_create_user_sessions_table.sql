-- Create user_sessions table for express-session with connect-pg-simple
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

-- Only add primary key if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_sessions_pkey'
  ) THEN
    ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");

-- Enable RLS to silence Supabase warning
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;

-- Create restrictive policy if it doesn't exist (server uses service role which bypasses RLS anyway)
DROP POLICY IF EXISTS "user_sessions_server_only" ON "user_sessions";
CREATE POLICY "user_sessions_server_only" ON "user_sessions"
  FOR ALL
  USING (false);  -- No one can access via Data API (server uses service role)