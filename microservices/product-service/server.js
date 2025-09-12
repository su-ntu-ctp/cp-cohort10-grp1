require('dotenv').config();
const express = require('express');
const promClient = require('prom-client');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 3001;

// Prometheus metrics
promClient.collectDefaultMetrics({ prefix: 'product_service_' });
const httpRequests = new promClient.Counter({
  name: 'product_service_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const productViews = new promClient.Counter({
  name: 'product_service_views_total',
  help: 'Total product views'
});

app.use(express.json());

// Logging helper
const log = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
};

// Metrics and logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  log.info(`${req.method} ${req.path} - Request started`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequests.inc({ method: req.method, route: req.path, status_code: res.statusCode });
    log.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// DynamoDB setup
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const docClient = DynamoDBDocumentClient.from(client);
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || 'shopmate-eks-products-dev';
// Sample products for initialization
const sampleProducts = [
  {
    id: 1,
    name: 'Smartphone X12 Pro',
    price: 699.99,
    description: 'Latest flagship smartphone with advanced features',
    image: '/images/smartphone.jpg',
    stock: 50
  },
  {
    id: 2,
    name: 'UltraBook Pro 16',
    price: 1299.99,
    description: 'High-performance laptop for professionals',
    image: '/images/laptop.jpg',
    stock: 30
  },
  {
    id: 3,
    name: 'SoundWave Elite Headphones',
    price: 199.99,
    description: 'Premium wireless headphones with noise cancellation',
    image: '/images/headphones.jpg',
    stock: 100
  },
  {
    id: 4,
    name: 'FitTech Pro Smartwatch',
    price: 249.99,
    description: 'Advanced fitness tracking smartwatch',
    image: '/images/smartwatch.jpg',
    stock: 45
  },
  {
    id: 5,
    name: 'SlimTab Ultra',
    price: 499.99,
    description: 'Ultra-thin tablet for creativity and productivity',
    image: '/images/tablet.jpg',
    stock: 25
  }
];

// Initialize products if table is empty
const initializeProducts = async () => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: PRODUCTS_TABLE
    }));
    const existingProducts = result.Items || [];
    
    if (existingProducts.length === 0) {
      log.info('Initializing products...');
      
      // Add products one by one to avoid batch limits
      for (const product of sampleProducts) {
        await docClient.send(new PutCommand({
          TableName: PRODUCTS_TABLE,
          Item: product
        }));
      }
      
      log.info('Products initialized successfully');
    } else {
      log.info(`Found ${existingProducts.length} existing products`);
    }
  } catch (error) {
    log.error(`Error initializing products: ${error.message}`);
  }
};

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: PRODUCTS_TABLE
    }));
    productViews.inc();
    res.json(result.Items || []);
  } catch (error) {
    log.error(`Error getting products: ${error.message}`);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: PRODUCTS_TABLE,
      Key: { id: parseInt(req.params.id) }
    }));
    
    if (!result.Item) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    productViews.inc();
    res.json(result.Item);
  } catch (error) {
    log.error(`Error getting product: ${error.message}`);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// Update product stock
app.put('/api/products/:id/stock', async (req, res) => {
  try {
    const { stock } = req.body;
    const productId = parseInt(req.params.id);
    
    // Get current product first
    const result = await docClient.send(new GetCommand({
      TableName: PRODUCTS_TABLE,
      Key: { id: productId }
    }));
    
    if (!result.Item) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Update the entire product object (like monolith does)
    const updatedProduct = { ...result.Item, stock };
    await docClient.send(new PutCommand({
      TableName: PRODUCTS_TABLE,
      Item: updatedProduct
    }));
    
    res.json({ success: true });
  } catch (error) {
    log.error(`Error updating stock: ${error.message}`);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'product-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

// Service-specific metrics endpoint
app.get('/metrics/product', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

const server = app.listen(PORT, async () => {
  log.info(`Product service running on port ${PORT}`);
  await initializeProducts();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    log.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    log.info('Process terminated');
    process.exit(0);
  });
});