# 🚀 Automatic Deployment Setup Guide

This guide will help you set up automatic deployment from GitHub to your EC2 instance.

## 📋 Prerequisites

- Your app is already deployed to `/var/www/pushlog` (or your custom path)
- PM2 is installed and running your app
- You have SSH access to your EC2 instance

## 🔧 Step 1: Set Up Deployment Script on EC2

1. **SSH into your EC2 instance:**
   ```bash
   ssh user@your-ec2-instance
   ```

2. **Navigate to your app directory:**
   ```bash
   cd /var/www/pushlog
   ```

3. **Pull the latest code (to get the deploy.sh script):**
   ```bash
   git pull origin main
   ```

4. **Make the deploy script executable:**
   ```bash
   chmod +x deploy.sh
   ```

5. **Test the script manually (optional):**
   ```bash
   ./deploy.sh
   ```

## 🔐 Step 2: Set Up Environment Variables

1. **Add deployment secret to your `.env` file:**
   ```bash
   nano .env
   ```

2. **Add these variables:**
   ```env
   # Deployment webhook secret (generate a strong random string)
   DEPLOY_SECRET=your-super-secret-deployment-token-here
   
   # Optional: Custom app directory (defaults to /var/www/pushlog)
   APP_DIR=/var/www/pushlog
   ```

3. **Generate a secure secret:**
   ```bash
   # On your local machine or EC2:
   openssl rand -hex 32
   ```

4. **Restart your PM2 app to load new environment variables:**
   ```bash
   pm2 restart pushlog
   ```

## 🌐 Step 3: Set Up GitHub Webhook

1. **Go to your GitHub repository:**
   - Navigate to: `Settings` → `Webhooks` → `Add webhook`

2. **Configure the webhook:**
   - **Payload URL:** `https://pushlog.ai/api/webhooks/deploy`
   - **Content type:** `application/json`
   - **Secret:** Use the same `DEPLOY_SECRET` value from your `.env` file
   - **Which events:** Select "Just the push event" (or "Let me select individual events" and choose "Pushes")
   - **Active:** ✅ Checked

3. **Click "Add webhook"**

## 🔒 Step 4: Security (Important!)

The deployment endpoint is secured with:
1. **Secret token** (`X-Deploy-Secret` header) - Required
2. **GitHub webhook signature** (optional, if `GITHUB_WEBHOOK_SECRET` is set)

### How it works:
- GitHub sends a POST request with the `X-Hub-Signature-256` header
- Your server verifies the secret token in the `X-Deploy-Secret` header
- If both match, deployment starts

## 🧪 Step 5: Test the Deployment

1. **Make a test commit:**
   ```bash
   echo "test" >> test.txt
   git add test.txt
   git commit -m "Test auto-deployment"
   git push origin main
   ```

2. **Check GitHub webhook delivery:**
   - Go to your repository → `Settings` → `Webhooks`
   - Click on your webhook
   - Check "Recent Deliveries" to see if it succeeded

3. **Check deployment logs on EC2:**
   ```bash
   # View deployment log
   tail -f /var/www/pushlog/deploy.log
   
   # Or check PM2 logs
   pm2 logs pushlog
   ```

4. **Verify the deployment:**
   ```bash
   # Check if PM2 restarted
   pm2 list
   
   # Check git log to see latest commit
   cd /var/www/pushlog
   git log -1
   ```

## 📝 Troubleshooting

### Deployment not triggering:
- ✅ Check GitHub webhook delivery status
- ✅ Verify `DEPLOY_SECRET` matches in both `.env` and GitHub webhook secret
- ✅ Check server logs: `pm2 logs pushlog`
- ✅ Verify the webhook URL is correct: `https://pushlog.ai/api/webhooks/deploy`

### Deployment fails:
- ✅ Check deploy log: `cat /var/www/pushlog/deploy.log`
- ✅ Verify git permissions: `ls -la /var/www/pushlog/.git`
- ✅ Check npm/node versions: `node -v && npm -v`
- ✅ Verify PM2 is installed: `pm2 --version`

### Permission errors:
- ✅ Make sure deploy.sh is executable: `chmod +x deploy.sh`
- ✅ Verify git user has write access: `whoami` and check git config
- ✅ Check file ownership: `ls -la /var/www/pushlog`

## 🔄 Manual Deployment

If automatic deployment fails, you can always deploy manually:

```bash
cd /var/www/pushlog
git pull origin main
npm ci --production
npm run build
pm2 restart pushlog
```

## 📊 Monitoring

- **Deployment logs:** `/var/www/pushlog/deploy.log`
- **PM2 logs:** `pm2 logs pushlog`
- **GitHub webhook deliveries:** Repository → Settings → Webhooks → [Your webhook] → Recent Deliveries

## 🎉 You're Done!

Now every time you push to the `main` branch, your EC2 instance will automatically:
1. Pull the latest code
2. Install dependencies
3. Build the application
4. Restart PM2

No more manual deployments! 🚀

