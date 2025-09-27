#!/bin/bash

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
