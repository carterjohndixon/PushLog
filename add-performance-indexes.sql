-- Performance Indexes Migration
-- Add these indexes to improve database query performance

-- Index for user email lookups (login, password reset)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for user GitHub ID lookups (OAuth)
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- Index for user verification tokens (email verification)
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

-- Index for user reset password tokens (password reset)
CREATE INDEX IF NOT EXISTS idx_users_reset_password_token ON users(reset_password_token);

-- Index for repository user lookups
CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id);

-- Index for repository GitHub ID lookups (webhooks)
CREATE INDEX IF NOT EXISTS idx_repositories_github_id ON repositories(github_id);

-- Index for integration user lookups
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id);

-- Index for integration repository lookups
CREATE INDEX IF NOT EXISTS idx_integrations_repository_id ON integrations(repository_id);

-- Index for notification user lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Index for notification ordering (created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Index for push events repository lookups
CREATE INDEX IF NOT EXISTS idx_push_events_repository_id ON push_events(repository_id);

-- Index for push events ordering (pushed_at)
CREATE INDEX IF NOT EXISTS idx_push_events_pushed_at ON push_events(pushed_at);

-- Composite indexes for getStatsForUser COUNTs (repository_id + filter column)
CREATE INDEX IF NOT EXISTS idx_push_events_repo_pushed_at ON push_events(repository_id, pushed_at);
CREATE INDEX IF NOT EXISTS idx_push_events_repo_notification_sent ON push_events(repository_id, notification_sent);

-- Composite for notifications count by user + type
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_type ON notifications(user_id, type);

-- Index for AI usage user lookups
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);

-- Composite for AI usage by user + time (monthly/daily spend, analytics)
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id_created_at ON ai_usage(user_id, created_at);

-- Index for AI usage integration lookups
CREATE INDEX IF NOT EXISTS idx_ai_usage_integration_id ON ai_usage(integration_id);

-- Index for payments user lookups
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- Index for Slack workspaces user lookups
CREATE INDEX IF NOT EXISTS idx_slack_workspaces_user_id ON slack_workspaces(user_id);
