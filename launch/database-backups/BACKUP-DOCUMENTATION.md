# PushLog Database Backup System

## Overview
This system provides automated database backups for your PushLog application using Supabase.

## Files Created
- `backup-database.sh` - Main backup script
- `restore-database.sh` - Database recovery script
- `monitor-backups.sh` - Backup monitoring script
- `backup-cron.txt` - Automated backup schedule

## Quick Start

### 1. Manual Backup
```bash
./backup-database.sh
```

### 2. Restore from Backup
```bash
./restore-database.sh backups/pushlog_backup_20250927_143022.sql.gz
```

### 3. Set Up Automated Backups
```bash
# Install cron job
crontab backup-cron.txt

# Check if installed
crontab -l
```

### 4. Monitor Backups
```bash
./monitor-backups.sh
```

## Backup Schedule
- **Daily backups**: 2:00 AM
- **Weekly full backups**: Sunday 3:00 AM
- **Retention**: 30 days

## Backup Location
- Local: `./backups/`
- Files: `pushlog_backup_YYYYMMDD_HHMMSS.sql.gz`

## Recovery Process
1. Stop your application
2. Run restore script with backup file
3. Verify data integrity
4. Restart application

## Monitoring
- Check backup logs: `tail -f backups/backup.log`
- Monitor disk space: `df -h`
- Verify recent backups: `ls -la backups/`

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
