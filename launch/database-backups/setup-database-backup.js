#!/usr/bin/env node

/**
 * Database Backup Setup
 * Sets up automated database backups and recovery procedures
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
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

// Step 1: Create backup script
function createBackupScript() {
  log("📝 Creating database backup script...");

  const backupScript = `#!/bin/bash

# PushLog Database Backup Script
# This script creates automated backups of your Supabase database

# Configuration
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="pushlog_backup_\${DATE}.sql"
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "🔄 Starting database backup..."

# Create backup using pg_dump
pg_dump "$DATABASE_URL" > "$BACKUP_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup created successfully: $BACKUP_FILE"
    
    # Compress the backup
    gzip "$BACKUP_DIR/$BACKUP_FILE"
    echo "📦 Backup compressed: $BACKUP_FILE.gz"
    
    # Get backup size
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE.gz" | cut -f1)
    echo "📊 Backup size: $BACKUP_SIZE"
    
    # Clean up old backups (older than retention period)
    echo "🧹 Cleaning up old backups (older than $RETENTION_DAYS days)..."
    find "$BACKUP_DIR" -name "pushlog_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    
    echo "✅ Backup process completed successfully"
else
    echo "❌ Backup failed"
    exit 1
fi
`;

  const scriptPath = join(__dirname, "backup-database.sh");
  writeFileSync(scriptPath, backupScript);

  // Make it executable
  try {
    execSync(`chmod +x ${scriptPath}`);
    log("✅ Backup script created and made executable");
  } catch (error) {
    log("⚠️  Could not make script executable, but it's ready to use");
  }

  return scriptPath;
}

// Step 2: Create recovery script
function createRecoveryScript() {
  log("📝 Creating database recovery script...");

  const recoveryScript = `#!/bin/bash

# PushLog Database Recovery Script
# This script restores your database from a backup

# Configuration
BACKUP_DIR="./backups"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "❌ Error: Please provide backup file name"
    echo "Usage: $0 <backup_file.sql.gz>"
    echo "Available backups:"
    ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "⚠️  WARNING: This will overwrite your current database!"
echo "Are you sure you want to continue? (yes/no)"
read -r confirmation

if [ "$confirmation" != "yes" ]; then
    echo "❌ Recovery cancelled"
    exit 1
fi

echo "🔄 Starting database recovery from: $BACKUP_FILE"

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "📦 Decompressing backup..."
    gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
else
    echo "📄 Restoring from uncompressed backup..."
    psql "$DATABASE_URL" < "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
    echo "✅ Database recovery completed successfully"
else
    echo "❌ Recovery failed"
    exit 1
fi
`;

  const scriptPath = join(__dirname, "restore-database.sh");
  writeFileSync(scriptPath, recoveryScript);

  // Make it executable
  try {
    execSync(`chmod +x ${scriptPath}`);
    log("✅ Recovery script created and made executable");
  } catch (error) {
    log("⚠️  Could not make script executable, but it's ready to use");
  }

  return scriptPath;
}

// Step 3: Create automated backup cron job
function createCronJob() {
  log("⏰ Creating automated backup cron job...");

  const cronJob = `# PushLog Database Backup Cron Job
# Run daily at 2 AM
0 2 * * * cd /Users/carterdixon_1/Desktop/React/PushLog && ./backup-database.sh >> ./backups/backup.log 2>&1

# Run weekly full backup on Sundays at 3 AM
0 3 * * 0 cd /Users/carterdixon_1/Desktop/React/PushLog && ./backup-database.sh >> ./backups/backup.log 2>&1
`;

  const cronPath = join(__dirname, "backup-cron.txt");
  writeFileSync(cronPath, cronJob);

  log("✅ Cron job configuration created");
  log("💡 To install the cron job, run: crontab backup-cron.txt");

  return cronPath;
}

// Step 4: Create backup monitoring script
function createMonitoringScript() {
  log("📊 Creating backup monitoring script...");

  const monitoringScript = `#!/bin/bash

# PushLog Backup Monitoring Script
# Checks backup status and sends alerts if needed

BACKUP_DIR="./backups"
ALERT_EMAIL="your-email@example.com"  # Change this to your email

# Check if backups directory exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Backup directory not found: $BACKUP_DIR"
    exit 1
fi

# Check for recent backups (within last 24 hours)
RECENT_BACKUPS=$(find "$BACKUP_DIR" -name "pushlog_backup_*.sql.gz" -mtime -1 | wc -l)

if [ "$RECENT_BACKUPS" -eq 0 ]; then
    echo "⚠️  WARNING: No recent backups found!"
    echo "Last backup check: $(date)"
    # In production, you would send an email alert here
    # echo "No recent backups found" | mail -s "PushLog Backup Alert" "$ALERT_EMAIL"
else
    echo "✅ Found $RECENT_BACKUPS recent backup(s)"
fi

# Check backup sizes
echo "📊 Backup status:"
ls -lah "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -5

# Check disk space
DISK_USAGE=$(df -h "$BACKUP_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "⚠️  WARNING: Disk usage is high: $DISK_USAGE%"
fi

echo "✅ Backup monitoring completed"
`;

  const scriptPath = join(__dirname, "monitor-backups.sh");
  writeFileSync(scriptPath, monitoringScript);

  // Make it executable
  try {
    execSync(`chmod +x ${scriptPath}`);
    log("✅ Backup monitoring script created and made executable");
  } catch (error) {
    log("⚠️  Could not make script executable, but it's ready to use");
  }

  return scriptPath;
}

// Step 5: Create backup documentation
function createBackupDocumentation() {
  log("📚 Creating backup documentation...");

  const documentation = `# PushLog Database Backup System

## Overview
This system provides automated database backups for your PushLog application using Supabase.

## Files Created
- \`backup-database.sh\` - Main backup script
- \`restore-database.sh\` - Database recovery script
- \`monitor-backups.sh\` - Backup monitoring script
- \`backup-cron.txt\` - Automated backup schedule

## Quick Start

### 1. Manual Backup
\`\`\`bash
./backup-database.sh
\`\`\`

### 2. Restore from Backup
\`\`\`bash
./restore-database.sh backups/pushlog_backup_20250927_143022.sql.gz
\`\`\`

### 3. Set Up Automated Backups
\`\`\`bash
# Install cron job
crontab backup-cron.txt

# Check if installed
crontab -l
\`\`\`

### 4. Monitor Backups
\`\`\`bash
./monitor-backups.sh
\`\`\`

## Backup Schedule
- **Daily backups**: 2:00 AM
- **Weekly full backups**: Sunday 3:00 AM
- **Retention**: 30 days

## Backup Location
- Local: \`./backups/\`
- Files: \`pushlog_backup_YYYYMMDD_HHMMSS.sql.gz\`

## Recovery Process
1. Stop your application
2. Run restore script with backup file
3. Verify data integrity
4. Restart application

## Monitoring
- Check backup logs: \`tail -f backups/backup.log\`
- Monitor disk space: \`df -h\`
- Verify recent backups: \`ls -la backups/\`

## Troubleshooting

### Backup Fails
- Check DATABASE_URL environment variable
- Verify database connectivity
- Check disk space
- Review backup logs

### Recovery Issues
- Verify backup file integrity
- Check database permissions
- Ensure application is stopped
- Test with small backup first

## Security Notes
- Backup files contain sensitive data
- Store backups securely
- Consider encryption for production
- Regular backup testing recommended

## Production Recommendations
1. **Multiple backup locations** (local + cloud)
2. **Encryption** for sensitive data
3. **Regular testing** of recovery procedures
4. **Monitoring alerts** for backup failures
5. **Documentation** for team members

## Support
For issues with backups, check:
- Application logs
- Database connectivity
- Disk space availability
- Cron job execution
`;

  const docPath = join(__dirname, "BACKUP-DOCUMENTATION.md");
  writeFileSync(docPath, documentation);

  log("✅ Backup documentation created");
  return docPath;
}

// Main setup function
async function setupDatabaseBackup() {
  log("🚀 Starting Database Backup Setup...");

  try {
    // Step 1: Create backup script
    const backupScript = createBackupScript();

    // Step 2: Create recovery script
    const recoveryScript = createRecoveryScript();

    // Step 3: Create cron job
    const cronJob = createCronJob();

    // Step 4: Create monitoring script
    const monitoringScript = createMonitoringScript();

    // Step 5: Create documentation
    const documentation = createBackupDocumentation();

    // Summary
    log("\n🎉 Database Backup Setup Complete!");
    log("=".repeat(50));
    log("✅ Backup script created: backup-database.sh");
    log("✅ Recovery script created: restore-database.sh");
    log("✅ Monitoring script created: monitor-backups.sh");
    log("✅ Cron job configured: backup-cron.txt");
    log("✅ Documentation created: BACKUP-DOCUMENTATION.md");

    log("\n📋 Next Steps:");
    log("1. Test manual backup: ./backup-database.sh");
    log("2. Install automated backups: crontab backup-cron.txt");
    log("3. Set up monitoring: ./monitor-backups.sh");
    log("4. Review documentation: BACKUP-DOCUMENTATION.md");

    return true;
  } catch (error) {
    log("❌ Database backup setup failed:", error.message);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabaseBackup()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Setup failed:", error);
      process.exit(1);
    });
}

export { setupDatabaseBackup };
