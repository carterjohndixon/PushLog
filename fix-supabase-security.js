#!/usr/bin/env node

/**
 * Fix Supabase Security Issues
 * Addresses the security warnings from Supabase
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

// Step 1: Create Supabase security configuration
function createSupabaseSecurityConfig() {
  log("🔒 Creating Supabase security configuration...");

  const securityConfig = `# PushLog Supabase Security Configuration

## Security Issues to Fix

### 1. Auth OTP Long Expiry (WARN)
**Issue**: OTP expiry exceeds recommended threshold (> 1 hour)
**Fix**: Set OTP expiry to less than 1 hour

### 2. Leaked Password Protection Disabled (WARN)
**Issue**: Leaked password protection is currently disabled
**Fix**: Enable HaveIBeenPwned.org integration

### 3. Vulnerable Postgres Version (WARN)
**Issue**: Current postgres version has security patches available
**Fix**: Upgrade to latest postgres version

## Implementation Steps

### Step 1: Fix OTP Expiry
1. Go to Supabase Dashboard → Authentication → Settings
2. Find "OTP Expiry" setting
3. Change from current value to: **3600 seconds (1 hour)** or less
4. Save changes

### Step 2: Enable Leaked Password Protection
1. Go to Supabase Dashboard → Authentication → Settings
2. Find "Password Protection" section
3. Enable "Leaked Password Protection"
4. This will check passwords against HaveIBeenPwned.org
5. Save changes

### Step 3: Upgrade Postgres Version
1. Go to Supabase Dashboard → Settings → Database
2. Find "Database Version" section
3. Click "Upgrade Database"
4. Select the latest available version
5. Confirm the upgrade (this may require a maintenance window)

## Additional Security Recommendations

### 1. Enable Row Level Security (RLS)
\`\`\`sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_events ENABLE ROW LEVEL SECURITY;
\`\`\`

### 2. Create Security Policies
\`\`\`sql
-- Users can only access their own data
CREATE POLICY "Users can view own data" ON users
  FOR ALL USING (auth.uid() = id);

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
\`\`\`

### 3. Enable Database Encryption
- Go to Supabase Dashboard → Settings → Database
- Enable "Encryption at Rest"
- Enable "Encryption in Transit"

### 4. Configure API Security
- Go to Supabase Dashboard → Settings → API
- Enable "Enable API Key Restrictions"
- Set up IP allowlist if needed
- Configure CORS properly

### 5. Set Up Database Monitoring
- Go to Supabase Dashboard → Monitoring
- Enable "Database Monitoring"
- Set up alerts for:
  - High CPU usage
  - Memory usage
  - Connection count
  - Slow queries

## Security Checklist

### Authentication Security
- [ ] OTP expiry set to ≤ 1 hour
- [ ] Leaked password protection enabled
- [ ] Strong password requirements
- [ ] Email verification required
- [ ] Rate limiting on auth endpoints

### Database Security
- [ ] Postgres version upgraded
- [ ] Row Level Security enabled
- [ ] Security policies created
- [ ] Encryption at rest enabled
- [ ] Encryption in transit enabled

### API Security
- [ ] API key restrictions enabled
- [ ] CORS properly configured
- [ ] Rate limiting implemented
- [ ] Input validation enabled
- [ ] SQL injection protection

### Monitoring & Alerts
- [ ] Database monitoring enabled
- [ ] Security alerts configured
- [ ] Backup monitoring active
- [ ] Performance monitoring set up
- [ ] Error tracking enabled

## Testing Security

### 1. Test Authentication Security
\`\`\`bash
# Test rate limiting
curl -X POST https://your-app.com/api/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com","password":"wrong"}' \\
  --max-time 5

# Should be rate limited after multiple attempts
\`\`\`

### 2. Test Database Security
\`\`\`sql
-- Test RLS policies
-- This should fail if RLS is working
SELECT * FROM users WHERE id != auth.uid();
\`\`\`

### 3. Test API Security
\`\`\`bash
# Test without authentication
curl https://your-app.com/api/profile
# Should return 401 Unauthorized

# Test with invalid token
curl -H "Authorization: Bearer invalid-token" https://your-app.com/api/profile
# Should return 401 Unauthorized
\`\`\`

## Production Security Checklist

### Before Going Live
- [ ] All security warnings resolved
- [ ] RLS policies tested
- [ ] Authentication security verified
- [ ] API security tested
- [ ] Monitoring configured
- [ ] Backup system working
- [ ] SSL/TLS configured
- [ ] Security headers set
- [ ] Rate limiting active
- [ ] Error handling secure

### Ongoing Security
- [ ] Regular security audits
- [ ] Monitor for new vulnerabilities
- [ ] Keep dependencies updated
- [ ] Review access logs
- [ ] Test backup recovery
- [ ] Security training for team

## Support & Resources

### Supabase Documentation
- [Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod#security)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Security](https://supabase.com/docs/guides/database/security)

### Security Tools
- [OWASP Security Checklist](https://owasp.org/www-project-web-security-testing-guide/)
- [Security Headers](https://securityheaders.com/)
- [SSL Labs Test](https://www.ssllabs.com/ssltest/)

## Emergency Procedures

### If Security Breach Detected
1. **Immediate Response**
   - Change all API keys
   - Rotate database credentials
   - Review access logs
   - Notify users if needed

2. **Investigation**
   - Check database logs
   - Review authentication logs
   - Analyze attack vectors
   - Document findings

3. **Recovery**
   - Restore from clean backup
   - Update security measures
   - Patch vulnerabilities
   - Monitor for reoccurrence

## Contact Information
- **Security Issues**: security@pushlog.ai
- **Technical Support**: support@pushlog.ai
- **Emergency**: +1-XXX-XXX-XXXX
`;

  const configPath = join(__dirname, "SUPABASE-SECURITY-CONFIG.md");
  writeFileSync(configPath, securityConfig);

  log("✅ Supabase security configuration created");
  return configPath;
}

// Step 2: Create SQL scripts for security fixes
function createSecuritySQLScripts() {
  log("📝 Creating SQL scripts for security fixes...");

  const rlsScript = `-- PushLog Row Level Security (RLS) Setup
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
`;

  const rlsPath = join(__dirname, "setup-rls.sql");
  writeFileSync(rlsPath, rlsScript);

  log("✅ RLS setup script created: setup-rls.sql");
  return rlsPath;
}

// Step 3: Create security testing script
function createSecurityTestingScript() {
  log("🧪 Creating security testing script...");

  const testingScript = `#!/usr/bin/env node

/**
 * Security Testing Script
 * Tests various security measures for PushLog
 */

import fetch from "node-fetch";

const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    \`[\${timestamp}] \${message}\`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

async function testAuthenticationSecurity() {
  log("🔐 Testing authentication security...");
  
  // Test rate limiting
  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetch(\`\${BASE_URL}/api/login\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "wrongpassword"
        })
      })
    );
  }
  
  const responses = await Promise.all(requests);
  const rateLimited = responses.filter(r => r.status === 429).length;
  
  if (rateLimited > 0) {
    log("✅ Rate limiting is working");
  } else {
    log("⚠️  Rate limiting may not be active");
  }
}

async function testAPISecurity() {
  log("🛡️  Testing API security...");
  
  // Test without authentication
  const response = await fetch(\`\${BASE_URL}/api/profile\`);
  
  if (response.status === 401) {
    log("✅ API requires authentication");
  } else {
    log("❌ API should require authentication");
  }
}

async function testCORS() {
  log("🌐 Testing CORS configuration...");
  
  const response = await fetch(\`\${BASE_URL}/api/profile\`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://malicious-site.com",
      "Access-Control-Request-Method": "GET"
    }
  });
  
  const corsHeaders = response.headers.get("Access-Control-Allow-Origin");
  
  if (corsHeaders && corsHeaders !== "*") {
    log("✅ CORS is properly configured");
  } else {
    log("⚠️  CORS may be too permissive");
  }
}

async function testSecurityHeaders() {
  log("🔒 Testing security headers...");
  
  const response = await fetch(\`\${BASE_URL}/health\`);
  const headers = Object.fromEntries(response.headers.entries());
  
  const securityHeaders = [
    "x-content-type-options",
    "x-frame-options",
    "x-xss-protection",
    "strict-transport-security"
  ];
  
  const presentHeaders = securityHeaders.filter(header => headers[header]);
  
  log(\`📊 Security headers present: \${presentHeaders.length}/\${securityHeaders.length}\`);
  
  if (presentHeaders.length >= 3) {
    log("✅ Good security headers");
  } else {
    log("⚠️  Consider adding more security headers");
  }
}

async function runSecurityTests() {
  log("🚀 Starting Security Tests...");
  
  try {
    await testAuthenticationSecurity();
    await testAPISecurity();
    await testCORS();
    await testSecurityHeaders();
    
    log("\\n🎉 Security testing completed!");
    
  } catch (error) {
    log("❌ Security testing failed:", error.message);
  }
}

// Run if called directly
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  runSecurityTests();
}

export { runSecurityTests };
`;

  const testingPath = join(__dirname, "test-security.js");
  writeFileSync(testingPath, testingScript);

  // Make it executable
  try {
    execSync(`chmod +x ${testingPath}`);
    log("✅ Security testing script created and made executable");
  } catch (error) {
    log("⚠️  Could not make script executable, but it's ready to use");
  }

  return testingPath;
}

// Main setup function
async function fixSupabaseSecurity() {
  log("🚀 Starting Supabase Security Fixes...");

  try {
    // Step 1: Create security configuration
    const securityConfig = createSupabaseSecurityConfig();

    // Step 2: Create SQL scripts
    const rlsScript = createSecuritySQLScripts();

    // Step 3: Create testing script
    const testingScript = createSecurityTestingScript();

    // Summary
    log("\n🎉 Supabase Security Fixes Complete!");
    log("=".repeat(50));
    log("✅ Security configuration created: SUPABASE-SECURITY-CONFIG.md");
    log("✅ RLS setup script created: setup-rls.sql");
    log("✅ Security testing script created: test-security.js");

    log("\n📋 Next Steps:");
    log("1. Fix OTP expiry in Supabase Dashboard (≤ 1 hour)");
    log("2. Enable leaked password protection in Supabase Dashboard");
    log("3. Upgrade Postgres version in Supabase Dashboard");
    log("4. Run RLS setup: Execute setup-rls.sql in Supabase SQL editor");
    log("5. Test security: node test-security.js");

    log("\n🔒 Critical Security Actions Required:");
    log("1. Go to Supabase Dashboard → Authentication → Settings");
    log("2. Set OTP expiry to 3600 seconds (1 hour) or less");
    log("3. Enable 'Leaked Password Protection'");
    log("4. Go to Settings → Database → Upgrade Postgres");
    log("5. Run the RLS SQL script in Supabase SQL editor");

    return true;
  } catch (error) {
    log("❌ Supabase security fixes failed:", error.message);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixSupabaseSecurity()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Setup failed:", error);
      process.exit(1);
    });
}

export { fixSupabaseSecurity };
