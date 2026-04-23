const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./database');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Initialize database
db.initializeDatabase();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ===========================
// Basic Auth Middleware
// ===========================
async function requireAuth(req, res, next) {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (!login || !password) {
    res.set('WWW-Authenticate', 'Basic realm="401"');
    return res.status(401).send('Authentication required.');
  }

  if (req.path.startsWith('/superadmin') || req.path.startsWith('/api/superadmin')) {
    if (login === process.env.SUPERADMIN_USER && password === process.env.SUPERADMIN_PASSWORD) {
      return next();
    }
  } else {
    // Normal restaurant auth
    const restaurant = await db.getRestaurantByUsername(login);
    if (restaurant) {
      const match = await bcrypt.compare(password, restaurant.password_hash);
      if (match) {
        req.restaurant_id = restaurant.id;
        req.restaurant_username = restaurant.username;
        return next();
      }
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="401"');
  res.status(401).send('Invalid credentials.');
}

// Extract restaurant_id for public APIs (also attempts Basic Auth if present)
async function getPublicRestaurantId(req, res, next) {
  // Try to get from auth if they are logged in
  if (req.restaurant_id) return next();

  // Try Kitchen Cookie
  if (req.cookies.kitchen_restaurant_id) {
    req.restaurant_id = parseInt(req.cookies.kitchen_restaurant_id);
    return next();
  }

  // Try Basic Auth headers (from owner/kitchen panels)
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  if (b64auth) {
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login && password) {
      const restaurant = await db.getRestaurantByUsername(login);
      if (restaurant) {
        const match = await bcrypt.compare(password, restaurant.password_hash);
        if (match) {
          req.restaurant_id = restaurant.id;
          req.restaurant_username = restaurant.username;
          return next();
        }
      }
    }
  }
  
  // Otherwise get from cookie (set by /table/:id)
  if (req.cookies.restaurant_id) {
    req.restaurant_id = parseInt(req.cookies.restaurant_id);
    return next();
  }

  // Allow through but with empty restaurant_id? Will cause DB to return empty arrays.
  return next();
}

// Allows Owner basic auth OR Kitchen cookie
async function requireKitchenOrOwner(req, res, next) {
  // First, check Kitchen cookie
  if (req.cookies.kitchen_restaurant_id) {
    req.restaurant_id = parseInt(req.cookies.kitchen_restaurant_id);
    return next();
  }

  // Second, check basic auth (Owner)
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  if (b64auth) {
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login && password) {
      const restaurant = await db.getRestaurantByUsername(login);
      if (restaurant) {
        const match = await bcrypt.compare(password, restaurant.password_hash);
        if (match) {
          req.restaurant_id = restaurant.id;
          req.restaurant_username = restaurant.username;
          return next();
        }
      }
    }
  }

  res.status(401).send('Kitchen/Owner access denied.');
}

// ===========================
// Page Routes
// ===========================
app.get('/', (req, res) => {
  res.redirect('/owner');
});

app.get('/superadmin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

app.get('/table/:tableId', async (req, res) => {
  try {
    const tableId = parseInt(req.params.tableId);
    if (isNaN(tableId)) return res.status(404).send('Invalid code.');
    const table = await db.getTableByIdGlobal(tableId);
    if (!table) return res.status(404).send('Table not found. Please scan a valid QR code.');
    
    // Set cookie so future API calls from this client know which restaurant to query
    res.cookie('restaurant_id', table.restaurant_id, { maxAge: 86400000 }); // 24 hours
    res.sendFile(path.join(__dirname, 'public', 'customer.html'));
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

app.get('/kitchen/:username', async (req, res) => {
  try {
    const restaurant = await db.getRestaurantByUsername(req.params.username);
    if (!restaurant) return res.status(404).send('Kitchen not found.');
    
    // Set kitchen cookie so API calls work without password
    res.cookie('kitchen_restaurant_id', restaurant.id, { maxAge: 86400000 }); // 24 hours
    res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.get('/owner', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'owner.html'));
});

// ===========================
// API: Auth & SuperAdmin
// ===========================
app.get('/api/me', requireKitchenOrOwner, (req, res) => {
  res.json({ restaurant_id: req.restaurant_id, username: req.restaurant_username || 'kitchen' });
});

app.post('/api/restaurant/password', requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: 'Missing password' });
  const success = await db.updateRestaurantPassword(req.restaurant_id, newPassword);
  if (success) res.json({ success: true });
  else res.status(500).json({ error: 'Failed to update' });
});

app.get('/api/superadmin/restaurants', requireAuth, async (req, res) => {
  res.json(await db.getAllRestaurants());
});

app.post('/api/superadmin/restaurants', requireAuth, async (req, res) => {
  const { username, password, name, gst_type } = req.body;
  const validGstType = (gst_type === 'regular') ? 'regular' : 'composition';
  const rest = await db.createRestaurant(username, password, name, validGstType);
  if (!rest) return res.status(400).json({ error: 'Failed. Username may already exist.' });

  // Seed default settings based on GST type
  const defaultSettings = {
    restaurant_name: name,
    restaurant_address: '',
    restaurant_phone: '',
    currency_symbol: '₹',
    gst_number: '',
    gst_type: validGstType,
  };

  if (validGstType === 'composition') {
    // Composition: 5% fixed, cannot charge GST to customer, Bill of Supply
    defaultSettings.tax_percent = '5';
  } else {
    // Regular: 5% for standalone restaurants (18% for hotels with tariff ≥₹7500)
    defaultSettings.tax_percent = '5';
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    await db.updateSetting(rest.id, key, value);
  }

  res.json(rest);
});

// ===========================
// API: Settings
// ===========================
app.get('/api/settings', getPublicRestaurantId, async (req, res) => {
  if (!req.restaurant_id) return res.json({});
  res.json(await db.getSettings(req.restaurant_id));
});

app.put('/api/settings', requireAuth, async (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    await db.updateSetting(req.restaurant_id, key, value);
  }
  res.json(await db.getSettings(req.restaurant_id));
});

// ===========================
// API: Tables
// ===========================
app.get('/api/tables', requireAuth, async (req, res) => {
  res.json(await db.getAllTables(req.restaurant_id));
});

app.get('/api/tables/:id', getPublicRestaurantId, async (req, res) => {
  if (!req.restaurant_id) return res.status(404).json({ error: 'Not found' });
  const table = await db.getTableById(req.restaurant_id, parseInt(req.params.id));
  if (!table) return res.status(404).json({ error: 'Table not found' });
  res.json(table);
});

app.post('/api/tables', requireAuth, async (req, res) => {
  const { name, seats } = req.body;
  if (!name) return res.status(400).json({ error: 'Table name is required' });
  const table = await db.createTable(req.restaurant_id, name, seats);
  io.to(`owner-${req.restaurant_id}`).emit('table-update');
  res.json(table);
});

app.put('/api/tables/:id', requireAuth, async (req, res) => {
  const table = await db.updateTable(req.restaurant_id, parseInt(req.params.id), req.body);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  io.to(`owner-${req.restaurant_id}`).emit('table-update');
  res.json(table);
});

app.delete('/api/tables/:id', requireAuth, async (req, res) => {
  await db.deleteTable(req.restaurant_id, parseInt(req.params.id));
  io.to(`owner-${req.restaurant_id}`).emit('table-update');
  res.json({ success: true });
});

// QR Code generation
app.get('/api/tables/:id/qr', requireAuth, async (req, res) => {
  const table = await db.getTableById(req.restaurant_id, parseInt(req.params.id));
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.protocol;
  const url = `${protocol}://${host}/table/${table.id}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' }
    });
    res.json({ qr: qrDataUrl, url, table });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ===========================
// API: Categories
// ===========================
app.get('/api/categories', getPublicRestaurantId, async (req, res) => {
  if (!req.restaurant_id) return res.json([]);
  res.json(await db.getAllCategories(req.restaurant_id));
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const cat = await db.createCategory(req.restaurant_id, name, icon);
  io.to(`owner-${req.restaurant_id}`).emit('menu-update');
  res.json(cat);
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  const cat = await db.updateCategory(req.restaurant_id, parseInt(req.params.id), req.body);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  io.to(`owner-${req.restaurant_id}`).emit('menu-update');
  res.json(cat);
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  await db.deleteCategory(req.restaurant_id, parseInt(req.params.id));
  io.to(`owner-${req.restaurant_id}`).emit('menu-update');
  res.json({ success: true });
});

// ===========================
// API: Menu Items
// ===========================
app.get('/api/menu', getPublicRestaurantId, async (req, res) => {
  if (!req.restaurant_id) return res.json([]);
  const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
  if (req.query.available === '1') {
    res.json(await db.getAvailableMenu(req.restaurant_id));
  } else {
    res.json(await db.getMenuItems(req.restaurant_id, categoryId));
  }
});

app.post('/api/menu', requireAuth, async (req, res) => {
  const { name, price, category_id, description, is_veg } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Name and price are required' });
  const item = await db.createMenuItem(req.restaurant_id, { name, price, category_id, description, is_veg });
  io.to(`owner-${req.restaurant_id}`).emit('menu-update');
  res.json(item);
});

app.put('/api/menu/:id', requireAuth, async (req, res) => {
  const item = await db.updateMenuItem(req.restaurant_id, parseInt(req.params.id), req.body);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  io.to(`owner-${req.restaurant_id}`).emit('menu-update');
  res.json(item);
});

app.put('/api/menu/:id/toggle', requireAuth, async (req, res) => {
  const item = await db.toggleMenuItemAvailability(req.restaurant_id, parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  io.to(`owner-${req.restaurant_id}`).emit('menu-update');
  res.json(item);
});

app.delete('/api/menu/:id', requireAuth, async (req, res) => {
  await db.deleteMenuItem(req.restaurant_id, parseInt(req.params.id));
  io.to(`owner-${req.restaurant_id}`).emit('menu-update');
  res.json({ success: true });
});

// ===========================
// API: Orders
// ===========================
app.get('/api/orders', getPublicRestaurantId, async (req, res) => {
  if (!req.restaurant_id) return res.json([]);
  if (req.query.table_id) {
    res.json(await db.getOrdersByTable(req.restaurant_id, parseInt(req.query.table_id)));
  } else {
    res.json(await db.getActiveOrders(req.restaurant_id));
  }
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await db.getOrderById(req.restaurant_id, parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', getPublicRestaurantId, async (req, res) => {
  if (!req.restaurant_id) return res.status(400).json({ error: 'Missing restaurant context' });
  const { table_id, customer_name, items, notes } = req.body;
  if (!table_id || !items || items.length === 0) {
    return res.status(400).json({ error: 'Table and items are required' });
  }
  const order = await db.createOrder(req.restaurant_id, table_id, customer_name, items, notes);
  if (!order) return res.status(400).json({ error: 'Failed to create order' });

  io.to(`owner-${req.restaurant_id}`).emit('new-order', order);
  io.to(`kitchen-${req.restaurant_id}`).emit('new-order', order);
  io.to(`owner-${req.restaurant_id}`).emit('table-update');
  res.json(order);
});

app.put('/api/orders/:orderId/items/:itemId/status', requireKitchenOrOwner, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'preparing', 'ready', 'served'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const result = await db.updateOrderItemStatus(req.restaurant_id, parseInt(req.params.itemId), status);
  if (!result) return res.status(404).json({ error: 'Item not found' });

  io.to(`owner-${req.restaurant_id}`).emit('order-status-update', { order: result.order, item: result.item });
  io.to(`kitchen-${req.restaurant_id}`).emit('order-status-update', { order: result.order, item: result.item });
  io.to(`table-${result.order.table_id}`).emit('order-status-update', { order: result.order, item: result.item });
  res.json(result);
});

app.put('/api/orders/:orderId/status-all', requireKitchenOrOwner, async (req, res) => {
  const { status } = req.body;
  const order = await db.updateAllOrderItemsStatus(req.restaurant_id, parseInt(req.params.orderId), status);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  io.to(`owner-${req.restaurant_id}`).emit('order-status-update', { order });
  io.to(`kitchen-${req.restaurant_id}`).emit('order-status-update', { order });
  io.to(`table-${order.table_id}`).emit('order-status-update', { order });
  res.json(order);
});

app.put('/api/orders/:id/cancel', requireAuth, async (req, res) => {
  const order = await db.cancelOrder(req.restaurant_id, parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  io.to(`owner-${req.restaurant_id}`).emit('order-cancelled', order);
  io.to(`kitchen-${req.restaurant_id}`).emit('order-cancelled', order);
  res.json(order);
});

// ===========================
// API: Bills
// ===========================
app.get('/api/bills', requireAuth, async (req, res) => {
  res.json(await db.getAllBills(req.restaurant_id, parseInt(req.query.limit) || 50));
});

app.get('/api/bills/:id', requireAuth, async (req, res) => {
  const bill = await db.getBillById(req.restaurant_id, parseInt(req.params.id));
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(bill);
});

app.post('/api/bills', requireAuth, async (req, res) => {
  const { table_id, discount_percent, payment_method, cartUpdates, customItems } = req.body;
  if (!table_id) return res.status(400).json({ error: 'Table ID is required' });
  const bill = await db.generateBill(req.restaurant_id, table_id, discount_percent, payment_method, cartUpdates, customItems);
  if (!bill) return res.status(400).json({ error: 'No active orders found for this table' });

  io.to(`owner-${req.restaurant_id}`).emit('bill-generated', bill);
  io.to(`owner-${req.restaurant_id}`).emit('table-update');
  res.json(bill);
});

app.put('/api/bills/:id/pay', requireAuth, async (req, res) => {
  const { payment_method } = req.body;
  const bill = await db.markBillPaid(req.restaurant_id, parseInt(req.params.id), payment_method);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(bill);
});

// Export GST Bills CSV
app.get('/api/bills/export', requireAuth, async (req, res) => {
  const bills = await db.getAllBills(req.restaurant_id);
  const settings = await db.getSettings(req.restaurant_id);
  
  if (!bills || bills.length === 0) {
    return res.status(400).send('No bills to export');
  }

  // Generate CSV
  const header = ['Bill Number', 'Date', 'Amount (Taxable Value)', 'CGST', 'SGST', 'Total Quantity', 'Grand Total', 'GSTIN'];
  const rows = bills.map(b => {
    const isRegular = settings.gst_type === 'regular';
    let cgst = isRegular ? (b.tax_amount / 2).toFixed(2) : 0;
    let sgst = isRegular ? (b.tax_amount / 2).toFixed(2) : 0;
    
    if (!isRegular) {
       cgst = (b.tax_amount / 2).toFixed(2);
       sgst = (b.tax_amount / 2).toFixed(2);
    }

    const qty = b.orders ? b.orders.reduce((acc, order) => {
        return acc + order.items.reduce((acc2, item) => item.status !== 'cancelled' ? acc2 + item.quantity : acc2, 0);
    }, 0) : 0;

    return [
      b.bill_number.replace(/"/g, '""'),
      new Date(b.created_at).toISOString().split('T')[0],
      b.subtotal.toFixed(2),
      cgst,
      sgst,
      qty,
      b.grand_total.toFixed(2),
      (settings.gst_number || '').replace(/"/g, '""')
    ].join(',');
  });

  const csvObj = [header.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="gst_report.csv"');
  res.send(csvObj);
});

// ===========================
// API: Stats
// ===========================
app.get('/api/stats', requireAuth, async (req, res) => {
  res.json(await db.getTodayStats(req.restaurant_id));
});

// ===========================
// Socket.IO
// ===========================
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Customer joins specific table room
  socket.on('join-table', (tableId) => {
    socket.join(`table-${tableId}`);
    console.log(`Socket ${socket.id} joined table-${tableId}`);
  });

  // Owner/Kitchen send restaurant_id when joining
  socket.on('join-kitchen', (restaurantId) => {
    socket.join(`kitchen-${restaurantId}`);
    console.log(`Socket ${socket.id} joined kitchen-${restaurantId}`);
  });

  socket.on('join-owner', (restaurantId) => {
    socket.join(`owner-${restaurantId}`);
    console.log(`Socket ${socket.id} joined owner-${restaurantId}`);
  });

  socket.on('call-waiter', (data) => {
    if(data.restaurantId) {
      io.to(`owner-${data.restaurantId}`).emit('waiter-called', data);
      io.to(`kitchen-${data.restaurantId}`).emit('waiter-called', data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ===========================
// Start Server
// ===========================
server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║        TABLEO - SaaS System          ║`);
  console.log(`  ╠══════════════════════════════════════╣`);
  console.log(`  ║  Server running at:                   ║`);
  console.log(`  ║  http://localhost:${PORT}               ║`);
  console.log(`  ║                                        ║`);
  console.log(`  ║  Super Admin:  /superadmin             ║`);
  console.log(`  ║  Owner Panel:  /owner                  ║`);
  console.log(`  ║  Kitchen:      /kitchen                ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
