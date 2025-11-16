# 🚀 Deployment Guide - Jewelry Price App

This guide covers deploying your Jewelry Price App to various platforms.

## Table of Contents

1. [Render.com Deployment (Easiest)](#rendercom-deployment)
2. [Heroku Deployment](#heroku-deployment)
3. [VPS Deployment (DigitalOcean, AWS, etc.)](#vps-deployment)
4. [Vercel Deployment](#vercel-deployment)

---

## Render.com Deployment (Recommended)

Render offers free tier with automatic HTTPS and easy deployment.

### Step 1: Prepare Your Code

```bash
# Make sure your code is in a Git repository
git init
git add .
git commit -m "Initial commit"

# Push to GitHub
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 2: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Step 3: Create Web Service

1. Click "New +" → "Web Service"
2. Connect your repository
3. Configure:
   - **Name**: `jewelry-price-app`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for production)

### Step 4: Add Environment Variables

In Render dashboard, add these environment variables:

```
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_ACCESS_TOKEN=your_access_token
SHOP_NAME=your-store.myshopify.com
PORT=3000
```

### Step 5: Deploy

1. Click "Create Web Service"
2. Wait for deployment (5-10 minutes)
3. Your app will be available at: `https://jewelry-price-app.onrender.com`

### Step 6: Run Setup

After deployment, you need to run the setup script once:

```bash
# Using Render Shell (in dashboard)
cd /opt/render/project/src
npm run setup
```

Or trigger it via a one-time command in Render's settings.

### Step 7: Access Admin UI

Your admin interface will be at:
```
https://jewelry-price-app.onrender.com/index.html
```

### Important Notes for Render:

- **Free tier sleeps after 15 min** of inactivity
- **First request after sleep** takes ~30 seconds
- For production, use paid tier ($7/month) for always-on service
- Automatic HTTPS provided
- Auto-deploys on git push

---

## Heroku Deployment

### Step 1: Install Heroku CLI

```bash
# macOS
brew tap heroku/brew && brew install heroku

# Windows
# Download from: https://devcenter.heroku.com/articles/heroku-cli

# Ubuntu
curl https://cli-assets.heroku.com/install.sh | sh
```

### Step 2: Login and Create App

```bash
heroku login
heroku create jewelry-price-app
```

### Step 3: Add Node.js Buildpack

```bash
heroku buildpacks:set heroku/nodejs
```

### Step 4: Configure Environment Variables

```bash
heroku config:set SHOPIFY_API_KEY=your_api_key
heroku config:set SHOPIFY_API_SECRET=your_api_secret
heroku config:set SHOPIFY_ACCESS_TOKEN=your_access_token
heroku config:set SHOP_NAME=your-store.myshopify.com
```

### Step 5: Create Procfile

Create a file named `Procfile` in your project root:

```
web: node server/index.js
```

### Step 6: Deploy

```bash
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main
```

### Step 7: Run Setup

```bash
heroku run npm run setup
```

### Step 8: Open App

```bash
heroku open
# Navigate to /index.html
```

### Heroku Notes:

- Free tier discontinued (starts at $5/month)
- Includes SSL/HTTPS
- Easy scaling options
- Automatic restarts

---

## VPS Deployment (DigitalOcean, AWS EC2, Linode)

### Step 1: Create VPS

- **DigitalOcean**: Create $5/month droplet with Ubuntu 22.04
- **AWS**: Create t2.micro EC2 instance
- **Linode**: Create Nanode 1GB instance

### Step 2: Connect to Server

```bash
ssh root@your-server-ip
```

### Step 3: Install Node.js

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 4: Install PM2 (Process Manager)

```bash
npm install -g pm2
```

### Step 5: Setup Application

```bash
# Clone your repository
git clone <your-repo-url>
cd jewelry-price-app

# Install dependencies
npm install

# Create .env file
nano .env
# Paste your environment variables, save (Ctrl+X, Y, Enter)
```

### Step 6: Run Setup

```bash
npm run setup
```

### Step 7: Start with PM2

```bash
# Start the app
pm2 start server/index.js --name jewelry-app

# Save PM2 configuration
pm2 save

# Setup PM2 to start on server reboot
pm2 startup
# Run the command it outputs

# Check status
pm2 status
```

### Step 8: Setup Nginx (Reverse Proxy)

```bash
# Install Nginx
apt install -y nginx

# Create Nginx configuration
nano /etc/nginx/sites-available/jewelry-app
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration:

```bash
# Enable site
ln -s /etc/nginx/sites-available/jewelry-app /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

### Step 9: Setup SSL with Let's Encrypt

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

### Step 10: Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

### VPS Management Commands:

```bash
# View logs
pm2 logs jewelry-app

# Restart app
pm2 restart jewelry-app

# Stop app
pm2 stop jewelry-app

# Update app
cd jewelry-price-app
git pull
npm install
pm2 restart jewelry-app
```

---

## Vercel Deployment (Alternative)

Vercel is great for static sites but requires some adjustments for this Node.js app.

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Create vercel.json

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/index.js",
      "use": "@vercel/node"
    },
    {
      "src": "public/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "public/$1"
    }
  ]
}
```

### Step 3: Deploy

```bash
vercel

# Follow prompts
# Add environment variables when prompted
```

### Vercel Notes:

- Free tier available
- Serverless functions (may have cold starts)
- Automatic HTTPS
- Good for side projects

---

## Post-Deployment Checklist

After deploying to any platform:

- [ ] Verify the app is accessible
- [ ] Run setup script (`npm run setup`)
- [ ] Test metal price updates
- [ ] Configure at least one product
- [ ] Test price calculation
- [ ] Test bulk price refresh
- [ ] Set up monitoring/alerts
- [ ] Configure custom domain (optional)
- [ ] Set up SSL/HTTPS
- [ ] Test from multiple devices

## Domain Configuration

### Connecting Custom Domain

**Render.com:**
1. Go to Settings → Custom Domain
2. Add your domain
3. Update DNS records as instructed

**Heroku:**
```bash
heroku domains:add www.yourdomain.com
```

**VPS:**
- Point A record to your server IP
- Configure Nginx server_name
- Setup SSL with certbot

## Monitoring & Logs

**Render:**
- View logs in dashboard
- Set up log drains if needed

**Heroku:**
```bash
heroku logs --tail
```

**VPS:**
```bash
pm2 logs jewelry-app
journalctl -u nginx -f
```

## Backup Strategy

### Database Backup (if using)

Since we're using Shopify as the data store, your data is automatically backed up by Shopify.

### Configuration Backup

Regularly backup:
1. `.env` file (keep secure!)
2. Metal prices configuration
3. Stone pricing configuration

### Code Backup

- Keep code in Git repository
- Use multiple remotes (GitHub + GitLab)
- Tag releases

```bash
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0
```

## Scaling Considerations

### For High Traffic:

1. **Render/Heroku**: Scale up to paid tier
2. **VPS**: 
   - Increase droplet size
   - Add load balancer
   - Use Redis for caching
3. **Add CDN**: CloudFlare for static assets

### Performance Optimization:

```javascript
// Add caching to frequently accessed data
// In server/index.js

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.get('/api/metal-prices', async (req, res) => {
  const cacheKey = 'metal-prices';
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }
  
  // Fetch fresh data
  const prices = await shopifyAPI.getMetalPrices();
  cache.set(cacheKey, {
    data: { success: true, data: prices },
    timestamp: Date.now()
  });
  
  res.json({ success: true, data: prices });
});
```

## Troubleshooting Deployment Issues

### Common Issues:

**Port Already in Use:**
```bash
# Find process using port 3000
lsof -i :3000
# Kill it
kill -9 <PID>
```

**Environment Variables Not Loading:**
- Verify `.env` file exists
- Check file permissions: `chmod 600 .env`
- Restart the application

**SSL Certificate Issues:**
```bash
# Renew certificate
certbot renew
systemctl reload nginx
```

**App Crashes on Startup:**
```bash
# Check logs
pm2 logs jewelry-app --err
# Common causes: missing .env, wrong permissions, port conflicts
```

## Security Checklist

- [ ] HTTPS enabled
- [ ] Environment variables secured
- [ ] API rate limiting implemented
- [ ] CORS configured properly
- [ ] Regular security updates
- [ ] Firewall configured
- [ ] SSH key authentication (VPS)
- [ ] Strong passwords
- [ ] Regular backups

## Maintenance Schedule

**Daily:**
- Monitor application logs
- Check error rates

**Weekly:**
- Review metal price updates
- Check product configurations

**Monthly:**
- Update dependencies: `npm update`
- Review security advisories
- Backup configurations

**Quarterly:**
- Review and optimize performance
- Update Node.js version
- Security audit

---

## Getting Help

If you encounter issues:

1. Check logs first
2. Review this deployment guide
3. Check platform-specific documentation
4. Verify environment variables
5. Test locally first

## Additional Resources

- [Shopify Admin API Docs](https://shopify.dev/docs/api/admin-graphql)
- [Render Documentation](https://render.com/docs)
- [Heroku Node.js Guide](https://devcenter.heroku.com/articles/deploying-nodejs)
- [DigitalOcean Tutorials](https://www.digitalocean.com/community/tutorials)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Configuration](https://nginx.org/en/docs/)

---

**Happy Deploying! 🚀**
