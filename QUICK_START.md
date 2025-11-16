# ⚡ Quick Start Guide - Get Running in 5 Minutes

This is the fastest way to get your Jewelry Price App running locally.

## Prerequisites

- ✅ Node.js 16 or higher installed
- ✅ Shopify store with admin access
- ✅ 5 minutes of your time

## Step 1: Get Shopify Credentials (2 minutes)

### Create a Custom App in Shopify Admin

1. Log into your Shopify admin
2. Go to: **Settings** → **Apps and sales channels** → **Develop apps**
3. Click **"Create an app"**
4. Name it: `Jewelry Price Manager`
5. Click **Configure Admin API scopes**
6. Select these permissions:
   - ✅ `read_products`
   - ✅ `write_products`
   - ✅ `read_metaobjects`
   - ✅ `write_metaobjects`
7. Click **Save**
8. Click **Install app**
9. **Reveal token once** and copy it (you can't see it again!)

### You'll need:
- **Admin API access token** (the one you just revealed)
- **Shop name** (e.g., `bhima-jewellery.myshopify.com`)

## Step 2: Install & Configure (1 minute)

```bash
# Navigate to the project folder
cd jewelry-price-app

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env` file and add your credentials:

```env
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
SHOP_NAME=your-store-name.myshopify.com
PORT=3000
```

## Step 3: Setup Shopify (1 minute)

```bash
# Run the setup script - this creates all necessary metaobjects
npm run setup
```

You should see:
```
✅ Metal Prices metaobject created
✅ Stone Pricing metaobject created
✅ Product metafield definitions created
✅ Default metal prices initialized
```

## Step 4: Start the Server (30 seconds)

```bash
# Start in development mode
npm run dev
```

You should see:
```
🚀 Jewelry Price App Server running on port 3000
📍 Health check: http://localhost:3000/api/health
✅ Price calculator initialized
```

## Step 5: Open Admin Interface (30 seconds)

Open your browser to:
```
http://localhost:3000/index.html
```

You should see the **Live Gold Price Editor** interface!

## First Steps in the App

### Update Metal Prices

1. Click the **Dashboard** tab
2. Enter current metal prices:
   - Gold 24K: e.g., `7000` INR/gram
   - Gold 22K: e.g., `6500` INR/gram
   - Gold 18K: e.g., `5500` INR/gram
   - Gold 14K: e.g., `4500` INR/gram
   - Silver: e.g., `80` INR/gram
   - Platinum: e.g., `3000` INR/gram
3. The prices are automatically saved!

### Configure Your First Product

1. Click the **Products** tab
2. Click **Search Products** to load products from your store
3. Click **Edit** on any product
4. Fill in the configuration:
   - **Metal Type**: Select metal type
   - **Metal Weight**: Enter weight in grams
   - **Making Charge**: Enter percentage (e.g., `10`)
   - **Labour Type**: Choose Percentage or Fixed
   - **Labour Value**: Enter value
   - **Wastage Type**: Choose type
   - **Wastage Value**: Enter value
   - **Stone Cost**: Enter total stone cost in INR
   - **Tax**: Enter tax percentage (e.g., `3`)
5. Watch the **real-time price calculation** at the bottom!
6. Click **Done** to save

### Update All Prices

After updating metal rates:
1. Go to **Dashboard**
2. Click **🔄 Refresh Prices** button
3. All configured products will be updated automatically!

## Testing the Calculation

Let's test with a sample product:

**22K Gold Ring - 4.54 grams**

Configuration:
- Metal Weight: `4.54`
- Metal Type: `gold22kt`
- Making Charge: `10` %
- Labour Type: `percentage`
- Labour Value: `5` %
- Wastage Type: `percentage`
- Wastage Value: `3` %
- Stone Cost: `160` INR
- Tax: `3` %

If Gold 22K = ₹6,500/gram, you should see:
- Metal Cost: ₹29,510.00
- Making Charge: ₹2,951.00
- Labour Charge: ₹1,475.50
- Wastage Charge: ₹885.30
- Stone Cost: ₹160.00
- Subtotal: ₹34,981.80
- Tax Amount: ₹1,049.45
- **Final Price: ₹36,031.25**

## Common Issues & Solutions

### "Error loading metal prices"
**Solution:** Check your `.env` file has correct credentials and shop name format

### "Cannot find module 'dotenv'"
**Solution:** Run `npm install` again

### "Port 3000 already in use"
**Solution:** Change PORT in `.env` to `3001` or kill the process using port 3000

### Products not showing
**Solution:** Click the "Search Products" button or ensure you have products in your Shopify store

### Real-time calculation not working
**Solution:** Ensure all fields are filled with valid numbers

## API Endpoints for Testing

Test if the server is running:

```bash
# Health check
curl http://localhost:3000/api/health

# Get metal prices
curl http://localhost:3000/api/metal-prices

# Get products
curl http://localhost:3000/api/products
```

## Next Steps

Once you have it running locally:

1. ✅ Configure all your products
2. ✅ Test price calculations
3. ✅ Set up stone pricing if needed
4. 🚀 Deploy to production (see DEPLOYMENT.md)

## Video Tutorial (Conceptual)

If you prefer video instructions:

1. **Part 1**: Getting Shopify credentials (2 min)
2. **Part 2**: Installation and setup (2 min)
3. **Part 3**: Using the interface (3 min)
4. **Part 4**: Deployment (5 min)

## File Structure Reference

```
jewelry-price-app/
├── 📄 README.md              ← Full documentation
├── 📄 QUICK_START.md         ← You are here!
├── 📄 DEPLOYMENT.md          ← Deployment guide
├── 📦 package.json
├── 🔒 .env                   ← Your credentials (create this)
├── 📂 server/
│   ├── index.js              ← Main server
│   ├── setup.js              ← Setup script
│   └── utils/                ← Helper functions
└── 📂 public/
    └── index.html            ← Admin interface
```

## Getting Help

**Having issues?**

1. Check the error message in terminal
2. Review the logs
3. Make sure all environment variables are set
4. Try the troubleshooting section in README.md

**Still stuck?**

- Check Shopify API status
- Verify your API token has correct permissions
- Make sure your shop name is correct format

## Development Commands

```bash
# Start server (development mode with auto-reload)
npm run dev

# Start server (production mode)
npm start

# Run setup again (if needed)
npm run setup

# Check Node version
node --version

# Check npm version
npm --version
```

## What Happens When You Update Metal Prices?

1. You enter new prices in Dashboard
2. Prices saved to Shopify Metaobject
3. Calculator updates with new rates
4. Click "Refresh Prices"
5. Server fetches all configured products
6. Calculates new prices for each
7. Updates product prices via Shopify API
8. All products now show new prices! ✅

## Important Notes

- 🔒 **Never commit `.env` file** to Git
- 💾 Always backup before bulk updates
- 🧪 Test with one product first
- 📊 Monitor Shopify API rate limits
- ⏰ Update metal prices during low-traffic hours

## Success Indicators

You know it's working when:

- ✅ Server starts without errors
- ✅ Dashboard loads in browser
- ✅ Metal prices can be saved
- ✅ Products list loads
- ✅ Configuration modal opens
- ✅ Price calculations work in real-time
- ✅ Prices update in Shopify admin

## Production Checklist

Before going to production:

- [ ] Test all calculations thoroughly
- [ ] Configure at least 3-5 products
- [ ] Test bulk price refresh
- [ ] Set realistic metal prices
- [ ] Add stone pricing (if needed)
- [ ] Choose deployment platform
- [ ] Set up monitoring
- [ ] Configure custom domain
- [ ] Enable HTTPS
- [ ] Train staff on usage

---

## 🎉 That's It!

You should now have a fully functional jewelry price management system running locally.

**Time spent:** ~5 minutes  
**Products managed:** Unlimited  
**Manual calculations:** Zero  
**Your stress level:** Minimal 😊

For production deployment, see **DEPLOYMENT.md**.

For detailed documentation, see **README.md**.

Happy pricing! 💰✨
