#!/bin/bash

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
