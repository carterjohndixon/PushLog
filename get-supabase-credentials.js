#!/usr/bin/env node

/**
 * Helper script to get Supabase credentials
 *
 * This script helps you find your Supabase project reference and access token
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("🔍 Supabase Credentials Helper\n");

console.log("📋 To get your Supabase credentials:\n");

console.log("1️⃣ SUPABASE_PROJECT_REF:");
console.log("   • Go to your Supabase project dashboard");
console.log(
  "   • Look at the URL: https://supabase.com/dashboard/project/[PROJECT_REF]"
);
console.log("   • The PROJECT_REF is the part after /project/");
console.log(
  "   • Example: https://supabase.com/dashboard/project/abcdefghijklmnop"
);
console.log("   • Your PROJECT_REF would be: abcdefghijklmnop\n");

console.log("2️⃣ SUPABASE_ACCESS_TOKEN:");
console.log("   • Go to https://supabase.com/dashboard/account/tokens");
console.log('   • Click "Generate new token"');
console.log('   • Give it a name like "PushLog Security Setup"');
console.log("   • Copy the generated token\n");

console.log("3️⃣ Add to your .env file:");
console.log("   SUPABASE_PROJECT_REF=your_project_ref_here");
console.log("   SUPABASE_ACCESS_TOKEN=your_access_token_here\n");

console.log("4️⃣ Then run:");
console.log("   npm run enable:leaked-password-protection\n");

// Check if credentials are already in .env
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (projectRef && accessToken) {
  console.log("✅ Found credentials in .env file!");
  console.log(`   PROJECT_REF: ${projectRef.substring(0, 8)}...`);
  console.log(`   ACCESS_TOKEN: ${accessToken.substring(0, 8)}...`);
  console.log(
    "\n🚀 You can now run: npm run enable:leaked-password-protection"
  );
} else {
  console.log("❌ Credentials not found in .env file");
  console.log("   Please add them as shown above.");
}
