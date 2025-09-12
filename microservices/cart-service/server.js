require('dotenv').config();
const express = require('express');
const axios = require('axios');
const promClient = require('prom-client');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 3002;

// Prometheus metrics
promClient.collectDefaultMetrics({ prefix: 'cart_service_' });
const httpRequests = new promClient.Counter({
  name: 'cart_service_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const cartItemsAdded = new promClient.Counter({
  name: 'cart_service_items_added_total',
  help: 'Total items added to cart'
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
const CARTS_TABLE = process.env.CARTS_TABLE || 'shopmate-eks-carts-dev';

const BASE_URL = process.env.BASE_URL || 'https://shopmate-eks.dev.sctp-sandbox.com';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || BASE_URL;

// Get cart
app.get('/api/cart/:userId', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CARTS_TABLE,
      Key: { userId: req.params.userId },
      ConsistentRead: true
    }));
    
    const cart = result.Item ? result.Item.items || [] : [];
    res.json(cart);
  } catch (error) {
    log.error(`Error getting cart: ${error.message}`);
    res.status(500).json({ error: 'Failed to get cart' });
  }
});

// Add to cart
app.post('/api/cart/:userId/add', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.params.userId;
    
    // Get product details from product service
    const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
    const product = productResponse.data;
    
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    
    // Get current cart
    const cartResult = await docClient.send(new GetCommand({
      TableName: CARTS_TABLE,
      Key: { userId },
      ConsistentRead: true
    }));
    
    let cartItems = cartResult.Item ? cartResult.Item.items || [] : [];
    
    // Update cart
    const existingItemIndex = cartItems.findIndex(item => item.productId === productId);
    if (existingItemIndex >= 0) {
      cartItems[existingItemIndex].quantity += quantity;
    } else {
      cartItems.push({ productId, quantity });
    }
    
    // Save cart
    await docClient.send(new PutCommand({
      TableName: CARTS_TABLE,
      Item: {
        userId,
        items: cartItems,
        updatedAt: new Date().toISOString()
      }
    }));
    
    // Update product stock
    await axios.put(`${PRODUCT_SERVICE_URL}/api/products/${productId}/stock`, {
      stock: product.stock - quantity
    });
    
    cartItemsAdded.inc();
    res.json({ success: true, cart: cartItems });
  } catch (error) {
    log.error(`Error adding to cart: ${error.message}`);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// Update cart
app.put('/api/cart/:userId', async (req, res) => {
  try {
    const { items } = req.body;
    
    await docClient.send(new PutCommand({
      TableName: CARTS_TABLE,
      Item: {
        userId: req.params.userId,
        items: items || [],
        updatedAt: new Date().toISOString()
      }
    }));
    
    res.json({ success: true, cart: items });
  } catch (error) {
    log.error(`Error updating cart: ${error.message}`);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// Clear cart
app.delete('/api/cart/:userId', async (req, res) => {
  try {
    await docClient.send(new PutCommand({
      TableName: CARTS_TABLE,
      Item: {
        userId: req.params.userId,
        items: [],
        updatedAt: new Date().toISOString()
      }
    }));
    
    res.json({ success: true });
  } catch (error) {
    log.error(`Error clearing cart: ${error.message}`);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'cart-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

// Service-specific metrics endpoint
app.get('/metrics/cart', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

const server = app.listen(PORT, () => {
  log.info(`Cart service running on port ${PORT}`);
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