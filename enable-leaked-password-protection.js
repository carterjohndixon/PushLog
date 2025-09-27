#!/usr/bin/env node

/**
 * Enable Leaked Password Protection via Supabase Management API
 *
 * This script uses the Supabase Management API to enable leaked password protection
 * for your project. You'll need your project reference ID and access token.
 */

import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

async function enableLeakedPasswordProtection() {
  console.log("🔐 Enabling Leaked Password Protection...\n");

  if (!SUPABASE_ACCESS_TOKEN) {
    console.error("❌ SUPABASE_ACCESS_TOKEN environment variable is required");
    console.log("\n📋 To get your access token:");
    console.log("1. Go to https://supabase.com/dashboard/account/tokens");
    console.log("2. Create a new access token");
    console.log(
      "3. Add it to your .env file: SUPABASE_ACCESS_TOKEN=your_token_here"
    );
    return;
  }

  if (!SUPABASE_PROJECT_REF) {
    console.error("❌ SUPABASE_PROJECT_REF environment variable is required");
    console.log("\n📋 To get your project reference:");
    console.log("1. Go to your Supabase project dashboard");
    console.log(
      "2. Look in the URL: https://supabase.com/dashboard/project/[PROJECT_REF]"
    );
    console.log(
      "3. Add it to your .env file: SUPABASE_PROJECT_REF=your_project_ref"
    );
    return;
  }

  try {
    console.log("🔍 Fetching current auth settings...");

    // Get current auth settings
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to fetch auth settings: ${response.status} ${error}`
      );
    }

    const currentSettings = await response.json();
    console.log("✅ Current auth settings retrieved");

    // Check if leaked password protection is already enabled
    if (currentSettings.leaked_password_protection) {
      console.log("✅ Leaked password protection is already enabled!");
      return;
    }

    console.log("🔧 Enabling leaked password protection...");

    // Update auth settings to enable leaked password protection
    const updateResponse = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leaked_password_protection: true,
        }),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      throw new Error(
        `Failed to update auth settings: ${updateResponse.status} ${error}`
      );
    }

    console.log("✅ Leaked password protection enabled successfully!");
    console.log(
      "\n🎉 Your Supabase project now has leaked password protection enabled."
    );
    console.log(
      "   This will check user passwords against the HaveIBeenPwned database."
    );
  } catch (error) {
    console.error(
      "❌ Error enabling leaked password protection:",
      error.message
    );
    console.log("\n🔧 Manual steps:");
    console.log("1. Go to your Supabase project dashboard");
    console.log("2. Navigate to Authentication > Settings");
    console.log('3. Enable "Leaked Password Protection"');
  }
}

// Run the script
enableLeakedPasswordProtection();
