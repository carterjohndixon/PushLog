#!/bin/bash

# PushLog Production Deployment Script
# This script helps deploy PushLog to your production server

echo "🚀 PushLog Production Deployment Script"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the PushLog root directory"
    exit 1
fi

echo "📦 Building production application..."
npm run build:production

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix errors and try again."
    exit 1
fi

echo "✅ Build completed successfully!"

echo ""
echo "📋 Next Steps for Production Deployment:"
echo "========================================"
echo ""
echo "1. 📁 Copy files to your server:"
echo "   scp -r dist/public/* user@your-server:/var/www/pushlog/"
echo "   scp -r server user@your-server:/var/www/pushlog/"
echo "   scp package.json user@your-server:/var/www/pushlog/"
echo "   scp ecosystem.config.js user@your-server:/var/www/pushlog/"
echo ""
echo "2. 🔧 On your server, run:"
echo "   cd /var/www/pushlog"
echo "   npm install --production"
echo "   mkdir -p logs"
echo ""
echo "3. 🌐 Set up Nginx configuration:"
echo "   sudo nano /etc/nginx/sites-available/pushlog.ai"
echo "   (Use the configuration from nginx-deployment-guide.md)"
echo ""
echo "4. 🔒 Set up SSL certificates:"
echo "   sudo certbot --nginx -d pushlog.ai -d www.pushlog.ai"
echo ""
echo "5. 🚀 Start the application:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "6. ✅ Enable Nginx site:"
echo "   sudo ln -s /etc/nginx/sites-available/pushlog.ai /etc/nginx/sites-enabled/"
echo "   sudo nginx -t"
echo "   sudo systemctl restart nginx"
echo ""
echo "📚 For detailed instructions, see: nginx-deployment-guide.md"
echo ""
echo "🎉 Ready for production deployment!"
