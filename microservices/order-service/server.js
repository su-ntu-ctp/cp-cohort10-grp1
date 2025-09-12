require('dotenv').config();
const express = require('express');
const axios = require('axios');
const uuid = require('uuid');
const promClient = require('prom-client');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 3003;

// Prometheus metrics
promClient.collectDefaultMetrics({ prefix: 'order_service_' });
const httpRequests = new promClient.Counter({
  name: 'order_service_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const ordersCreated = new promClient.Counter({
  name: 'order_service_orders_created_total',
  help: 'Total orders created'
});

const orderValue = new promClient.Counter({
  name: 'order_service_value_total',
  help: 'Total order value'
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
const ORDERS_TABLE = process.env.ORDERS_TABLE || 'shopmate-eks-orders-dev';

const BASE_URL = process.env.BASE_URL || 'https://shopmate-eks.dev.sctp-sandbox.com';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || BASE_URL;
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || BASE_URL;

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { userId, customer } = req.body;
    
    // Get cart items
    const cartResponse = await axios.get(`${CART_SERVICE_URL}/api/cart/${userId}`);
    const cartItems = cartResponse.data;
    
    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // Calculate total and get product details
    let total = 0;
    const orderItems = [];
    
    for (const item of cartItems) {
      const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${item.productId}`);
      const product = productResponse.data;
      
      const itemTotal = product.price * item.quantity;
      total += itemTotal;
      
      orderItems.push({
        product: {
          id: product.id,
          name: product.name,
          price: product.price
        },
        quantity: item.quantity,
        itemTotal
      });
    }
    
    // Create order
    const orderId = uuid.v4();
    const order = {
      id: orderId,
      userId,
      date: new Date().toISOString(),
      customer,
      items: orderItems,
      total,
      status: 'Confirmed'
    };
    
    // Save order
    await docClient.send(new PutCommand({
      TableName: ORDERS_TABLE,
      Item: order
    }));
    
    // Clear cart
    await axios.delete(`${CART_SERVICE_URL}/api/cart/${userId}`);
    
    ordersCreated.inc();
    orderValue.inc(total);
    res.json(order);
  } catch (error) {
    log.error(`Error creating order: ${error.message}`);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get order by ID
app.get('/api/orders/:id', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: ORDERS_TABLE,
      Key: { id: req.params.id }
    }));
    
    if (!result.Item) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(result.Item);
  } catch (error) {
    log.error(`Error getting order: ${error.message}`);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// Get orders by user
app.get('/api/orders/user/:userId', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: ORDERS_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': req.params.userId
      }
    }));
    
    res.json(result.Items || []);
  } catch (error) {
    log.error(`Error getting orders: ${error.message}`);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

// Service-specific metrics endpoint
app.get('/metrics/order', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

const server = app.listen(PORT, () => {
  log.info(`Order service running on port ${PORT}`);
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