-- Migration: Update invalid GPT-5 model references to gpt-5.2 (latest working model)
-- Based on comprehensive testing:
--   - gpt-5.1 and gpt-5.2 WORK and are valid models
--   - gpt-5 (base) doesn't work (token parameter issue)
--   - gpt-5.2-codex doesn't work (not a chat model)
-- So we only migrate the invalid ones, keeping gpt-5.1 and gpt-5.2

-- Update integrations table - only migrate invalid models
UPDATE integrations
SET ai_model = 'gpt-5.2'
WHERE ai_model IN ('gpt-5', 'gpt-5.2-codex');

-- Update users table preferred AI model - only migrate invalid models
UPDATE users
SET preferred_ai_model = 'gpt-5.2'
WHERE preferred_ai_model IN ('gpt-5', 'gpt-5.2-codex');

-- Note: gpt-5.1 and gpt-5.2 are kept as they are valid working models
-- Note: ai_usage table stores historical data, so we leave it as-is for historical accuracy