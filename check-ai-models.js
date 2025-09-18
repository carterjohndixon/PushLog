import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkAiModels() {
  try {
    console.log("🔍 Checking AI Models for all users...\n");

    // Check user AI model preferences
    const userQuery = `
      SELECT 
        id, 
        username, 
        email, 
        ai_credits,
        preferred_ai_model
      FROM users 
      WHERE preferred_ai_model IS NOT NULL
      ORDER BY id
    `;

    const userResult = await pool.query(userQuery);

    if (userResult.rows.length > 0) {
      console.log("👤 User AI Model Preferences:");
      userResult.rows.forEach((user) => {
        console.log(`  User ${user.id} (${user.username}):`);
        console.log(`    Email: ${user.email}`);
        console.log(`    Credits: ${user.ai_credits || 0}`);
        console.log(`    Preferred Model: ${user.preferred_ai_model}`);
        console.log("");
      });
    } else {
      console.log("❌ No users have preferred AI models set");
    }

    // Check integration AI model settings
    const integrationQuery = `
      SELECT 
        i.id,
        i.slack_channel_name,
        i.ai_model,
        i.max_tokens,
        i.is_active,
        u.username,
        r.name as repository_name
      FROM integrations i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN repositories r ON i.repository_id = r.id
      WHERE i.ai_model IS NOT NULL
      ORDER BY u.id, i.id
    `;

    const integrationResult = await pool.query(integrationQuery);

    if (integrationResult.rows.length > 0) {
      console.log("🔗 Integration AI Model Settings:");
      integrationResult.rows.forEach((integration) => {
        console.log(
          `  Integration ${integration.id} (${integration.username}):`
        );
        console.log(`    Repository: ${integration.repository_name}`);
        console.log(`    Channel: #${integration.slack_channel_name}`);
        console.log(`    AI Model: ${integration.ai_model}`);
        console.log(`    Max Tokens: ${integration.max_tokens}`);
        console.log(`    Active: ${integration.is_active ? "Yes" : "No"}`);
        console.log("");
      });
    } else {
      console.log("❌ No integrations have AI models configured");
    }

    // Check recent AI usage
    const usageQuery = `
      SELECT 
        au.id,
        au.model,
        au.tokens_used,
        au.cost,
        au.created_at,
        u.username,
        r.name as repository_name,
        i.slack_channel_name
      FROM ai_usage au
      JOIN users u ON au.user_id = u.id
      LEFT JOIN integrations i ON au.integration_id = i.id
      LEFT JOIN repositories r ON i.repository_id = r.id
      ORDER BY au.created_at DESC
      LIMIT 10
    `;

    const usageResult = await pool.query(usageQuery);

    if (usageResult.rows.length > 0) {
      console.log("📊 Recent AI Usage:");
      usageResult.rows.forEach((usage) => {
        console.log(
          `  ${usage.created_at.toISOString().split("T")[0]} - ${
            usage.username
          }:`
        );
        console.log(`    Model: ${usage.model}`);
        console.log(`    Tokens: ${usage.tokens_used}`);
        console.log(`    Cost: $${usage.cost}`);
        console.log(`    Repository: ${usage.repository_name || "N/A"}`);
        console.log(`    Channel: #${usage.slack_channel_name || "N/A"}`);
        console.log("");
      });
    } else {
      console.log("❌ No AI usage recorded yet");
    }
  } catch (error) {
    console.error("❌ Error checking AI models:", error);
  } finally {
    await pool.end();
  }
}

checkAiModels();
