# PushLog Nginx Deployment Guide

## 🚀 **Production Deployment Setup**

### **Prerequisites:**
- ✅ EC2 server with Nginx installed
- ✅ Domain: `pushlog.ai` 
- ✅ SSL certificates (Let's Encrypt)
- ✅ Node.js and PM2 installed

---

## 📋 **Step 1: Build Your Application**

```bash
# Build the production version
npm run build:production

# This creates:
# - dist/public/ (frontend assets)
# - server/ (backend code)
```

---

## 📋 **Step 2: Nginx Configuration**

### **Create Nginx Config File:**
```bash
sudo nano /etc/nginx/sites-available/pushlog.ai
```

### **Nginx Configuration Content:**
```nginx
server {
    listen 80;
    server_name pushlog.ai www.pushlog.ai;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pushlog.ai www.pushlog.ai;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/pushlog.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pushlog.ai/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Client Max Body Size
    client_max_body_size 10M;
    
    # Static Files (Frontend)
    location / {
        root /var/www/pushlog/dist/public;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API Routes (Backend)
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Webhooks (GitHub, Stripe)
    location /api/webhooks/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
    
    # Health Check
    location /health {
        proxy_pass http://localhost:5001;
        access_log off;
    }
}
```

---

## 📋 **Step 3: SSL Certificate Setup**

### **Install Certbot:**
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

### **Get SSL Certificate:**
```bash
sudo certbot --nginx -d pushlog.ai -d www.pushlog.ai
```

---

## 📋 **Step 4: Deploy Application**

### **Create Application Directory:**
```bash
sudo mkdir -p /var/www/pushlog
sudo chown -R $USER:$USER /var/www/pushlog
```

### **Copy Application Files:**
```bash
# Copy your built application
scp -r /Users/carterdixon_1/Desktop/React/PushLog/dist/public/* user@your-server:/var/www/pushlog/
scp -r /Users/carterdixon_1/Desktop/React/PushLog/server user@your-server:/var/www/pushlog/
scp /Users/carterdixon_1/Desktop/React/PushLog/package.json user@your-server:/var/www/pushlog/
```

### **Install Dependencies on Server:**
```bash
cd /var/www/pushlog
npm install --production
```

---

## 📋 **Step 5: PM2 Process Management**

### **Install PM2:**
```bash
sudo npm install -g pm2
```

### **Create PM2 Ecosystem File:**
```bash
nano ecosystem.config.js
```

### **PM2 Configuration:**
```javascript
module.exports = {
  apps: [{
    name: 'pushlog',
    script: './server/index.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
```

### **Start Application:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 📋 **Step 6: Enable Nginx Site**

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/pushlog.ai /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## 📋 **Step 7: Environment Variables**

### **Create Production .env:**
```bash
nano /var/www/pushlog/.env
```

### **Production Environment Variables:**
```env
NODE_ENV=production
PORT=5001
DATABASE_URL=your_production_database_url
JWT_SECRET=your_production_jwt_secret
SESSION_SECRET=your_production_session_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
OPENAI_API_KEY=your_openai_api_key
SENTRY_DSN=your_sentry_dsn
```

---

## 📋 **Step 8: Firewall Configuration**

```bash
# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable
```

---

## 📋 **Step 9: Monitoring and Logs**

### **View Application Logs:**
```bash
pm2 logs pushlog
```

### **View Nginx Logs:**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### **Monitor Application:**
```bash
pm2 monit
```

---

## 🎯 **Deployment Checklist**

- [ ] Build application (`npm run build:production`)
- [ ] Set up SSL certificates
- [ ] Configure Nginx
- [ ] Deploy application files
- [ ] Set up PM2 process management
- [ ] Configure environment variables
- [ ] Test application functionality
- [ ] Set up monitoring and logging

---

## 🚨 **Troubleshooting**

### **Common Issues:**
1. **502 Bad Gateway**: Check if Node.js app is running on port 5001
2. **SSL Issues**: Verify certificate paths and permissions
3. **Static Files Not Loading**: Check file permissions and paths
4. **API Not Working**: Verify proxy configuration and app startup

### **Debug Commands:**
```bash
# Check if app is running
pm2 status

# Check Nginx status
sudo systemctl status nginx

# Test Nginx config
sudo nginx -t

# Check logs
pm2 logs pushlog
sudo tail -f /var/log/nginx/error.log
```
