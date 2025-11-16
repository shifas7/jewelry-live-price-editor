# 🏆 Shopify Jewelry Live Price Editor

A complete automated pricing system for jewelry e-commerce on Shopify. Updates product prices automatically based on daily metal rate fluctuations with support for complex multi-factor calculations.

## ✨ Features

- **Metal Price Management**: Update Gold (24K, 22K, 18K, 14K), Silver, and Platinum rates
- **Stone Price Configuration**: Slab-based pricing for diamonds and other gemstones
- **Product Configuration**: Configure individual products with:
  - Metal weight and type
  - Making charges (percentage-based)
  - Labour charges (percentage or fixed)
  - Wastage charges (percentage, fixed, or weight-based)
  - Stone costs
  - Tax percentage
- **Automated Price Calculation**: Real-time price calculation based on current metal rates
- **Bulk Price Updates**: One-click update of all product prices when metal rates change
- **Professional Admin UI**: Clean, Shopify Polaris-inspired interface

## 📐 Calculation Formula

Based on the provided calculation details:

```
Metal Cost = Metal Weight × Metal Rate

Making Charge = Metal Cost × (Making % / 100)

Labour Charge = 
  - If Percentage: Metal Cost × (Labour % / 100)
  - If Fixed: Labour Amount

Wastage Charge = 
  - If Percentage: Metal Cost × (Wastage % / 100)
  - If Fixed: Wastage Amount
  - If Weight: Waste Weight × Metal Rate

Subtotal = Metal Cost + Making + Labour + Wastage + Stone Cost

Tax Amount = Subtotal × (Tax % / 100)

Final Price = Subtotal + Tax Amount
```

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ installed
- A Shopify store
- Shopify Admin API access token with permissions:
  - `read_products`, `write_products`
  - `read_metaobjects`, `write_metaobjects`

### 1. Installation

```bash
# Clone or download the project
cd jewelry-price-app

# Install dependencies
npm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
```

Update `.env` file:

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_ACCESS_TOKEN=your_admin_access_token
SHOP_NAME=your-store.myshopify.com
PORT=3000
```

### 3. Setup Shopify Metaobjects

Run the setup script to create required metaobject and metafield definitions:

```bash
npm run setup
```

This will create:
- Metal Prices metaobject definition
- Stone Pricing metaobject definition
- Product metafield definitions for jewelry configuration
- Default metal prices

### 4. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### 5. Access the Admin Interface

Open your browser to:
```
http://localhost:3000/index.html
```

Or for production, access via your deployed URL.

## 📁 Project Structure

```
jewelry-price-app/
├── server/
│   ├── index.js              # Main Express server
│   ├── setup.js              # Shopify setup script
│   └── utils/
│       ├── priceCalculator.js    # Price calculation logic
│       └── shopifyAPI.js         # Shopify GraphQL API wrapper
├── public/
│   └── index.html            # Admin UI (React app)
├── package.json
├── .env.example
└── README.md
```

## 🔧 API Endpoints

### Metal Prices

```bash
# Get current metal prices
GET /api/metal-prices

# Update metal prices
POST /api/metal-prices
{
  "gold24kt": 7000,
  "gold22kt": 6500,
  "gold18kt": 5500,
  "gold14kt": 4500,
  "platinum": 3000,
  "silver": 80
}

# Bulk update all product prices
POST /api/refresh-prices
```

### Stone Prices

```bash
# Get all stone pricing
GET /api/stone-prices

# Create/update stone pricing
POST /api/stone-prices
{
  "stoneId": "VVS_1",
  "stoneType": "Diamond",
  "title": "DIAMOND",
  "clarity": "VVS1",
  "color": "D",
  "shape": "Round",
  "slabs": [
    {
      "fromWeight": 0,
      "toWeight": 0.5,
      "pricePerCarat": 50000
    },
    {
      "fromWeight": 0.5,
      "toWeight": 1.0,
      "pricePerCarat": 75000
    }
  ]
}
```

### Products

```bash
# Get all configured products
GET /api/products

# Get product configuration
GET /api/products/:id

# Configure product
POST /api/products/:id/configure
{
  "metalWeight": 4.54,
  "metalType": "gold22kt",
  "makingChargePercent": 10,
  "labourType": "percentage",
  "labourValue": 5,
  "wastageType": "percentage",
  "wastageValue": 3,
  "stoneCost": 160,
  "taxPercent": 3
}

# Calculate price (preview without saving)
POST /api/calculate-price
{
  ... same as configure
}
```

## 🎨 Using the Admin Interface

### Dashboard Tab

1. **Update Metal Prices**: Enter current rates for all metals
2. **Add Stone Pricing**: Configure slab-based pricing for stones
3. **Refresh Prices**: Click to update all product prices based on current rates

### Products Tab

1. **View Products**: See all products and their configuration status
2. **Configure Product**: Click "Edit" to set up pricing parameters
3. **Real-time Preview**: See calculated price as you configure

### Product Configuration

For each product, configure:

1. **Metal Details**:
   - Type (Gold 24K/22K/18K/14K, Silver, Platinum)
   - Weight in grams

2. **Making Charge**:
   - Percentage of metal cost

3. **Labour Charge**:
   - Type: Percentage or Fixed amount
   - Value accordingly

4. **Wastage Charge**:
   - Type: Percentage, Fixed amount, or Weight in grams
   - Value accordingly

5. **Stone Cost**:
   - Total stone cost in INR

6. **Tax**:
   - GST/VAT percentage

## 🚀 Deployment Options

### Option 1: Render.com (Recommended)

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your repository
4. Add environment variables
5. Deploy!

### Option 2: Heroku

```bash
# Install Heroku CLI
heroku login
heroku create jewelry-price-app

# Set environment variables
heroku config:set SHOPIFY_ACCESS_TOKEN=xxx
heroku config:set SHOP_NAME=xxx

# Deploy
git push heroku main
```

### Option 3: VPS (DigitalOcean, AWS, etc.)

```bash
# Clone on server
git clone <your-repo>
cd jewelry-price-app

# Install dependencies
npm install

# Set up PM2 for process management
npm install -g pm2
pm2 start server/index.js --name jewelry-app
pm2 save
pm2 startup
```

## 🔐 Security Considerations

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Use HTTPS in production** - Protect API communication
3. **Restrict API access** - Use Shopify's built-in authentication
4. **Regular token rotation** - Update access tokens periodically

## 🐛 Troubleshooting

### "Error loading metal prices"
- Check your Shopify access token has correct permissions
- Verify `SHOP_NAME` format: `store-name.myshopify.com`
- Run setup script if metaobjects don't exist

### "Product prices not updating"
- Ensure products have been configured first
- Check that metafields are properly set
- Verify variant IDs are correct

### "API errors"
- Check Shopify API rate limits
- Verify GraphQL query syntax
- Check API version compatibility (using 2024-10)

## 📝 How It Works

### Data Flow

1. **Metal prices** stored in Shopify metaobjects
2. **Product configurations** stored in product metafields
3. **Price calculations** happen on the server using current rates
4. **Product prices** updated via Shopify Admin API

### When You Update Metal Rates

1. Admin updates metal prices in Dashboard
2. Prices saved to Shopify metaobject
3. Click "Refresh Prices" button
4. Server:
   - Fetches all configured products
   - Retrieves their configurations from metafields
   - Calculates new prices using updated rates
   - Updates product variant prices
5. Prices immediately reflect in your store

### Configuring a New Product

1. Go to Products tab
2. Click "Edit" on a product
3. Fill in all configuration fields
4. See real-time price calculation
5. Click "Done"
6. Configuration saved as metafields
7. Product price automatically updated

## 🎯 Best Practices

1. **Test with one product first** - Verify calculations are correct
2. **Back up your data** - Before bulk price updates
3. **Set realistic metal rates** - Check market prices daily
4. **Use consistent units** - Always use grams for weight
5. **Monitor API usage** - Stay within Shopify rate limits

## 📊 Example Configuration

For a **22K Gold Ring** weighing **4.54 grams**:

```json
{
  "metalWeight": 4.54,
  "metalType": "gold22kt",
  "makingChargePercent": 10,
  "labourType": "percentage",
  "labourValue": 5,
  "wastageType": "percentage",
  "wastageValue": 3,
  "stoneCost": 160,
  "taxPercent": 3
}
```

With Gold 22K at ₹6,500/gram:
- Metal Cost: ₹29,510
- Making Charge (10%): ₹2,951
- Labour (5%): ₹1,475.50
- Wastage (3%): ₹885.30
- Stone Cost: ₹160
- **Subtotal: ₹34,981.80**
- Tax (3%): ₹1,049.45
- **Final Price: ₹36,031.25**

## 🤝 Support

For issues or questions:
1. Check troubleshooting section
2. Review Shopify API documentation
3. Check server logs for detailed errors

## 📄 License

This project is provided as-is for your jewelry e-commerce needs.

## 🔄 Updates & Maintenance

- Keep Node.js dependencies updated
- Monitor Shopify API version changes
- Regular backups of configuration data
- Test price calculations after updates

---

**Built for Bhima Jewellery** 🏆

Made with ❤️ for automated jewelry pricing
