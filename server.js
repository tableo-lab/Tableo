const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./database');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Initialize database
db.initializeDatabase();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===========================
// Page Routes
// ===========================
app.get('/', (req, res) => {
  res.redirect('/owner');
});

app.get('/table/:tableId', async (req, res) => {
  try {
    const table = await db.getTableById(parseInt(req.params.tableId));
    if (!table) return res.status(404).send('Table not found. Please scan a valid QR code.');
    res.sendFile(path.join(__dirname, 'public', 'customer.html'));
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

app.get('/kitchen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

app.get('/owner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'owner.html'));
});

// ===========================
// API: Settings
// ===========================
app.get('/api/settings', async (req, res) => {
  res.json(await db.getSettings());
});

app.put('/api/settings', async (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    await db.updateSetting(key, value);
  }
  res.json(await db.getSettings());
});

// ===========================
// API: Tables
// ===========================
app.get('/api/tables', async (req, res) => {
  res.json(await db.getAllTables());
});

app.get('/api/tables/:id', async (req, res) => {
  const table = await db.getTableById(parseInt(req.params.id));
  if (!table) return res.status(404).json({ error: 'Table not found' });
  res.json(table);
});

app.post('/api/tables', async (req, res) => {
  const { name, seats } = req.body;
  if (!name) return res.status(400).json({ error: 'Table name is required' });
  const table = await db.createTable(name, seats);
  io.emit('table-update');
  res.json(table);
});

app.put('/api/tables/:id', async (req, res) => {
  const table = await db.updateTable(parseInt(req.params.id), req.body);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  io.emit('table-update');
  res.json(table);
});

app.delete('/api/tables/:id', async (req, res) => {
  await db.deleteTable(parseInt(req.params.id));
  io.emit('table-update');
  res.json({ success: true });
});

// QR Code generation
app.get('/api/tables/:id/qr', async (req, res) => {
  const table = await db.getTableById(parseInt(req.params.id));
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
app.get('/api/categories', async (req, res) => {
  res.json(await db.getAllCategories());
});

app.post('/api/categories', async (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const cat = await db.createCategory(name, icon);
  io.emit('menu-update');
  res.json(cat);
});

app.put('/api/categories/:id', async (req, res) => {
  const cat = await db.updateCategory(parseInt(req.params.id), req.body);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  io.emit('menu-update');
  res.json(cat);
});

app.delete('/api/categories/:id', async (req, res) => {
  await db.deleteCategory(parseInt(req.params.id));
  io.emit('menu-update');
  res.json({ success: true });
});

// ===========================
// API: Menu Items
// ===========================
app.get('/api/menu', async (req, res) => {
  const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
  if (req.query.available === '1') {
    res.json(await db.getAvailableMenu());
  } else {
    res.json(await db.getMenuItems(categoryId));
  }
});

app.post('/api/menu', async (req, res) => {
  const { name, price, category_id, description, is_veg } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Name and price are required' });
  const item = await db.createMenuItem({ name, price, category_id, description, is_veg });
  io.emit('menu-update');
  res.json(item);
});

app.put('/api/menu/:id', async (req, res) => {
  const item = await db.updateMenuItem(parseInt(req.params.id), req.body);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  io.emit('menu-update');
  res.json(item);
});

app.put('/api/menu/:id/toggle', async (req, res) => {
  const item = await db.toggleMenuItemAvailability(parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  io.emit('menu-update');
  res.json(item);
});

app.delete('/api/menu/:id', async (req, res) => {
  await db.deleteMenuItem(parseInt(req.params.id));
  io.emit('menu-update');
  res.json({ success: true });
});

// ===========================
// API: Orders
// ===========================
app.get('/api/orders', async (req, res) => {
  if (req.query.table_id) {
    res.json(await db.getOrdersByTable(parseInt(req.query.table_id)));
  } else {
    res.json(await db.getActiveOrders());
  }
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await db.getOrderById(parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', async (req, res) => {
  const { table_id, customer_name, items, notes } = req.body;
  if (!table_id || !items || items.length === 0) {
    return res.status(400).json({ error: 'Table and items are required' });
  }
  const order = await db.createOrder(table_id, customer_name, items, notes);
  if (!order) return res.status(400).json({ error: 'Failed to create order' });

  io.emit('new-order', order);
  io.emit('table-update');
  io.emit('stats-update');
  res.json(order);
});

app.put('/api/orders/:orderId/items/:itemId/status', async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'preparing', 'ready', 'served'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const result = await db.updateOrderItemStatus(parseInt(req.params.itemId), status);
  if (!result) return res.status(404).json({ error: 'Item not found' });

  io.emit('order-status-update', { order: result.order, item: result.item });
  io.emit('stats-update');
  res.json(result);
});

app.put('/api/orders/:orderId/status-all', async (req, res) => {
  const { status } = req.body;
  const order = await db.updateAllOrderItemsStatus(parseInt(req.params.orderId), status);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  io.emit('order-status-update', { order });
  io.emit('stats-update');
  res.json(order);
});

app.put('/api/orders/:id/cancel', async (req, res) => {
  const order = await db.cancelOrder(parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  io.emit('order-cancelled', order);
  io.emit('stats-update');
  res.json(order);
});

// ===========================
// API: Bills
// ===========================
app.get('/api/bills', async (req, res) => {
  res.json(await db.getAllBills(parseInt(req.query.limit) || 50));
});

app.get('/api/bills/:id', async (req, res) => {
  const bill = await db.getBillById(parseInt(req.params.id));
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(bill);
});

app.post('/api/bills', async (req, res) => {
  const { table_id, discount_percent, payment_method } = req.body;
  if (!table_id) return res.status(400).json({ error: 'Table ID is required' });
  const bill = await db.generateBill(table_id, discount_percent, payment_method);
  if (!bill) return res.status(400).json({ error: 'No active orders found for this table' });

  io.emit('bill-generated', bill);
  io.emit('table-update');
  io.emit('stats-update');
  res.json(bill);
});

app.put('/api/bills/:id/pay', async (req, res) => {
  const { payment_method } = req.body;
  const bill = await db.markBillPaid(parseInt(req.params.id), payment_method);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  io.emit('stats-update');
  res.json(bill);
});

// ===========================
// API: Stats
// ===========================
app.get('/api/stats', async (req, res) => {
  res.json(await db.getTodayStats());
});

// ===========================
// Socket.IO
// ===========================
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-table', (tableId) => {
    socket.join(`table-${tableId}`);
    console.log(`Socket ${socket.id} joined table-${tableId}`);
  });

  socket.on('join-kitchen', () => {
    socket.join('kitchen');
    console.log(`Socket ${socket.id} joined kitchen`);
  });

  socket.on('join-owner', () => {
    socket.join('owner');
    console.log(`Socket ${socket.id} joined owner`);
  });

  socket.on('call-waiter', (data) => {
    io.emit('waiter-called', data);
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
  console.log(`  ║        TABLEO - Restaurant System     ║`);
  console.log(`  ╠══════════════════════════════════════╣`);
  console.log(`  ║  Server running at:                   ║`);
  console.log(`  ║  http://localhost:${PORT}               ║`);
  console.log(`  ║                                        ║`);
  console.log(`  ║  Owner Panel:  /owner                  ║`);
  console.log(`  ║  Kitchen:      /kitchen                ║`);
  console.log(`  ║  Customer:     /table/:id              ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
