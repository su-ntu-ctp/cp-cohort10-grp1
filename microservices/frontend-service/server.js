require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const uuid = require('uuid');
const path = require('path');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs - use internal services for service-to-service communication
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3001';
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://cart-service:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3003';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Prometheus metrics
promClient.collectDefaultMetrics({ prefix: 'frontend_service_' });
const httpRequests = new promClient.Counter({
  name: 'frontend_service_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

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

// Session configuration
const DynamoDBStore = require('connect-dynamodb')(session);
app.use(session({
  secret: process.env.SESSION_SECRET || 'shopmate-default-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  },
  store: new DynamoDBStore({
    table: process.env.SESSIONS_TABLE || 'shopmate-eks-sessions-dev',
    AWSConfigJSON: {
      region: process.env.AWS_REGION || 'ap-southeast-1'
    }
  })
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper to get user ID
const getUserId = (req) => {
  if (!req.session.userId) {
    req.session.userId = uuid.v4();
  }
  return req.session.userId;
};

// Helper to get cart count
const getCartCount = async (userId) => {
  try {
    const response = await axios.get(`${CART_SERVICE_URL}/api/cart/${userId}`);
    return response.data.length;
  } catch (error) {
    return 0;
  }
};

// Routes
app.get('/', async (req, res) => {
  const userId = getUserId(req);
  const cartCount = await getCartCount(userId);
  res.render('layout', { 
    content: 'home',
    cartCount
  });
});

// Products
app.get('/products', async (req, res) => {
  try {
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/api/products`);
    res.render('layout', { 
      content: 'products',
      products: response.data,
      cartCount
    });
  } catch (error) {
    log.error(`Error getting products: ${error.message}`);
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    res.render('layout', { 
      content: 'products',
      products: [],
      cartCount
    });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${req.params.id}`);
    res.render('layout', { 
      content: 'product-details',
      product: response.data,
      cartCount
    });
  } catch (error) {
    log.error(`Error getting product: ${error.message}`);
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    res.status(404).render('layout', { 
      content: 'error',
      message: 'Product not found',
      cartCount
    });
  }
});

// Cart
app.get('/cart', async (req, res) => {
  try {
    const userId = getUserId(req);
    const cartResponse = await axios.get(`${CART_SERVICE_URL}/api/cart/${userId}`);
    const cartItems = cartResponse.data;
    
    let total = 0;
    const cart = [];
    
    for (const item of cartItems) {
      const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${item.productId}`);
      const product = productResponse.data;
      const itemTotal = product.price * item.quantity;
      total += itemTotal;
      
      cart.push({
        ...product,
        quantity: item.quantity,
        itemTotal
      });
    }
    
    res.render('layout', { 
      content: 'cart',
      cart,
      total,
      cartCount: cartItems.length
    });
  } catch (error) {
    log.error(`Error getting cart: ${error.message}`);
    res.render('layout', { 
      content: 'cart',
      cart: [],
      total: 0,
      cartCount: 0
    });
  }
});

app.post('/cart/add', async (req, res) => {
  try {
    const userId = getUserId(req);
    await axios.post(`${CART_SERVICE_URL}/api/cart/${userId}/add`, {
      productId: parseInt(req.body.productId),
      quantity: parseInt(req.body.quantity) || 1
    });
    res.redirect('/cart');
  } catch (error) {
    log.error(`Error adding to cart: ${error.message}`);
    res.redirect('/products?error=Failed to add item to cart');
  }
});

app.post('/cart/update/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const productId = parseInt(req.params.id);
    const newQuantity = parseInt(req.body.quantity);
    
    // Get current cart to calculate stock difference
    const cartResponse = await axios.get(`${CART_SERVICE_URL}/api/cart/${userId}`);
    const cartItems = cartResponse.data;
    const currentItem = cartItems.find(item => item.productId === productId);
    
    if (currentItem) {
      const quantityDiff = currentItem.quantity - newQuantity;
      
      if (newQuantity <= 0) {
        // Remove item - restore all stock
        const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
        const product = productResponse.data;
        await axios.put(`${PRODUCT_SERVICE_URL}/api/products/${productId}/stock`, {
          stock: product.stock + currentItem.quantity
        });
        
        // Remove from cart
        const updatedItems = cartItems.filter(item => item.productId !== productId);
        await axios.put(`${CART_SERVICE_URL}/api/cart/${userId}`, { items: updatedItems });
      } else {
        // Update quantity - adjust stock
        const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
        const product = productResponse.data;
        await axios.put(`${PRODUCT_SERVICE_URL}/api/products/${productId}/stock`, {
          stock: product.stock + quantityDiff
        });
        
        // Update cart
        const updatedItems = cartItems.map(item => 
          item.productId === productId ? { ...item, quantity: newQuantity } : item
        );
        await axios.put(`${CART_SERVICE_URL}/api/cart/${userId}`, { items: updatedItems });
      }
    }
    
    res.redirect('/cart');
  } catch (error) {
    log.error(`Error updating cart: ${error.message}`);
    res.redirect('/cart');
  }
});

app.get('/cart/remove/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const productId = parseInt(req.params.id);
    
    // Get current cart
    const cartResponse = await axios.get(`${CART_SERVICE_URL}/api/cart/${userId}`);
    const cartItems = cartResponse.data;
    const itemToRemove = cartItems.find(item => item.productId === productId);
    
    if (itemToRemove) {
      // Restore stock
      const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
      const product = productResponse.data;
      await axios.put(`${PRODUCT_SERVICE_URL}/api/products/${productId}/stock`, {
        stock: product.stock + itemToRemove.quantity
      });
      
      // Remove from cart
      const updatedItems = cartItems.filter(item => item.productId !== productId);
      await axios.put(`${CART_SERVICE_URL}/api/cart/${userId}`, { items: updatedItems });
    }
    
    res.redirect('/cart');
  } catch (error) {
    log.error(`Error removing from cart: ${error.message}`);
    res.redirect('/cart');
  }
});

app.get('/cart/clear', async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Get current cart to restore stock
    const cartResponse = await axios.get(`${CART_SERVICE_URL}/api/cart/${userId}`);
    const cartItems = cartResponse.data;
    
    // Restore stock for all items
    for (const item of cartItems) {
      const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${item.productId}`);
      const product = productResponse.data;
      await axios.put(`${PRODUCT_SERVICE_URL}/api/products/${item.productId}/stock`, {
        stock: product.stock + item.quantity
      });
    }
    
    // Clear cart
    await axios.delete(`${CART_SERVICE_URL}/api/cart/${userId}`);
    res.redirect('/cart');
  } catch (error) {
    log.error(`Error clearing cart: ${error.message}`);
    res.redirect('/cart');
  }
});

// Orders
app.get('/orders/checkout', async (req, res) => {
  const userId = getUserId(req);
  const cartCount = await getCartCount(userId);
  res.render('layout', { 
    content: 'checkout',
    cartCount
  });
});

app.post('/orders/place', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, email, address } = req.body;
    
    const response = await axios.post(`${ORDER_SERVICE_URL}/api/orders`, {
      userId,
      customer: { name, email, address }
    });
    
    res.redirect(`/orders/confirmation/${response.data.id}`);
  } catch (error) {
    log.error(`Error placing order: ${error.message}`);
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    res.status(500).render('layout', {
      content: 'error',
      message: 'Failed to place order',
      cartCount
    });
  }
});

app.get('/orders/confirmation/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders/${req.params.id}`);
    res.render('layout', { 
      content: 'order-confirmation',
      order: response.data,
      cartCount
    });
  } catch (error) {
    log.error(`Error getting order: ${error.message}`);
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    res.status(404).render('layout', { 
      content: 'error',
      message: 'Order not found',
      cartCount
    });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders/user/${userId}`);
    res.render('layout', { 
      content: 'orders',
      orders: response.data,
      cartCount
    });
  } catch (error) {
    log.error(`Error getting orders: ${error.message}`);
    const userId = getUserId(req);
    const cartCount = await getCartCount(userId);
    res.render('layout', { 
      content: 'orders',
      orders: [],
      cartCount
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'frontend-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

const server = app.listen(PORT, () => {
  log.info(`Frontend service running on port ${PORT}`);
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