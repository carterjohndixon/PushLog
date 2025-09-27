-- PushLog Row Level Security (RLS) Setup
-- Run this script in your Supabase SQL editor

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_workspaces ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Users can only access their own repositories
CREATE POLICY "Users can manage own repositories" ON repositories
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own integrations
CREATE POLICY "Users can manage own integrations" ON integrations
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own notifications
CREATE POLICY "Users can manage own notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access push events for their repositories
CREATE POLICY "Users can view own push events" ON push_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM repositories 
      WHERE repositories.id = push_events.repository_id 
      AND repositories.user_id = auth.uid()
    )
  );

-- Users can only access their own AI usage
CREATE POLICY "Users can view own AI usage" ON ai_usage
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own Stripe data
CREATE POLICY "Users can view own Stripe data" ON stripe_customers
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own payments" ON stripe_payments
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own Slack workspaces
CREATE POLICY "Users can manage own Slack workspaces" ON slack_workspaces
  FOR ALL USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
