require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function initializeDatabase() {
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('YOUR_SUPABASE')) {
    console.warn('\n!!! WARNING: Supabase URL or Key not set. Please update .env file. !!!\n');
  } else {
    console.log('✅ Supabase client initialized.');
  }
}

// ===========================
// Settings
// ===========================
async function getSettings() {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) return {};
  const settings = {};
  data.forEach(s => settings[s.key] = s.value);
  return settings;
}

async function updateSetting(key, value) {
  const { error } = await supabase.from('settings').upsert({ key, value });
  if (error) console.error('Error updating setting:', error);
}

// ===========================
// Tables
// ===========================
async function getAllTables() {
  const { data, error } = await supabase.from('tables').select('*').order('name');
  if (error) return [];
  return data;
}

async function getTableById(id) {
  const { data, error } = await supabase.from('tables').select('*').eq('id', id).single();
  return data || null;
}

async function createTable(name, seats) {
  const { data, error } = await supabase.from('tables').insert([{ name, seats: seats || 4, status: 'available' }]).select().single();
  return data || null;
}

async function updateTable(id, updates) {
  const { data, error } = await supabase.from('tables').update(updates).eq('id', id).select().single();
  return data || null;
}

async function deleteTable(id) {
  const { error } = await supabase.from('tables').delete().eq('id', id);
  return !error;
}

// ===========================
// Categories
// ===========================
async function getAllCategories() {
  const { data, error } = await supabase.from('categories').select('*').neq('active', 0).order('position');
  return data || [];
}

async function getAllCategoriesIncludeInactive() {
  const { data, error } = await supabase.from('categories').select('*').order('position');
  return data || [];
}

async function createCategory(name, icon) {
  const cats = await getAllCategoriesIncludeInactive();
  const maxPos = cats.reduce((m, c) => Math.max(m, c.position || 0), 0);
  const { data, error } = await supabase.from('categories').insert([{ name, icon: icon || '🍽️', position: maxPos + 1, active: 1 }]).select().single();
  return data || null;
}

async function updateCategory(id, updates) {
  const { data, error } = await supabase.from('categories').update(updates).eq('id', id).select().single();
  return data || null;
}

async function deleteCategory(id) {
  await supabase.from('menu_items').update({ category_id: null }).eq('category_id', id);
  const { error } = await supabase.from('categories').delete().eq('id', id);
  return !error;
}

// ===========================
// Menu Items
// ===========================
async function getMenuItems(categoryId) {
  let query = supabase.from('menu_items').select('*, categories(name)').order('position');
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data, error } = await query;
  if (!data) return [];
  return data.map(d => ({ ...d, category_name: d.categories ? d.categories.name : 'Uncategorized' }));
}

async function getMenuItemById(id) {
  const { data, error } = await supabase.from('menu_items').select('*').eq('id', id).single();
  return data || null;
}

async function getAvailableMenu() {
  const cats = await getAllCategories();
  const activeCatIds = cats.map(c => c.id);
  
  const { data, error } = await supabase.from('menu_items').select('*, categories(name, icon, position)').neq('available', 0);
  if (!data) return [];
  
  return data
    .filter(mi => mi.category_id === null || activeCatIds.includes(mi.category_id))
    .map(mi => ({
      ...mi, 
      category_name: mi.categories ? mi.categories.name : 'Uncategorized',
      category_icon: mi.categories ? mi.categories.icon : '🍽️'
    }))
    .sort((a, b) => {
      const posA = a.categories ? a.categories.position : 999;
      const posB = b.categories ? b.categories.position : 999;
      if (posA !== posB) return posA - posB;
      return a.position - b.position;
    });
}

async function createMenuItem(itemData) {
  let query = supabase.from('menu_items').select('position');
  if (itemData.category_id) query = query.eq('category_id', itemData.category_id);
  else query = query.is('category_id', null);
  
  const { data: posData } = await query;
  const maxPos = posData ? posData.reduce((m, d) => Math.max(m, d.position || 0), 0) : 0;
  
  const { data, error } = await supabase.from('menu_items').insert([{
    category_id: itemData.category_id || null,
    name: itemData.name,
    description: itemData.description || '',
    price: parseFloat(itemData.price),
    is_veg: itemData.is_veg !== undefined ? itemData.is_veg : 1,
    available: 1,
    position: maxPos + 1
  }]).select('*, categories(name)').single();
  
  if (!data) return null;
  return { ...data, category_name: data.categories ? data.categories.name : 'Uncategorized' };
}

async function updateMenuItem(id, updates) {
  if (updates.price !== undefined) updates.price = parseFloat(updates.price);
  const { data, error } = await supabase.from('menu_items').update(updates).eq('id', id).select('*, categories(name)').single();
  if (!data) return null;
  return { ...data, category_name: data.categories ? data.categories.name : 'Uncategorized' };
}

async function deleteMenuItem(id) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  return !error;
}

async function toggleMenuItemAvailability(id) {
  const mi = await getMenuItemById(id);
  if (!mi) return null;
  return await updateMenuItem(id, { available: mi.available ? 0 : 1 });
}

// ===========================
// Orders
// ===========================
async function generateOrderNumber() {
  const todayDateString = new Date().toISOString().split('T')[0];
  const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayDateString);
  const todayStr = todayDateString.replace(/-/g, '');
  return `ORD-${todayStr}-${String((count || 0) + 1).padStart(3, '0')}`;
}

async function createOrder(tableId, customerName, items, notes) {
  const orderNumber = await generateOrderNumber();
  const { data: order, error: orderErr } = await supabase.from('orders').insert([{
    table_id: tableId,
    customer_name: customerName || 'Guest',
    order_number: orderNumber,
    status: 'active',
    notes: notes || ''
  }]).select().single();
  
  if (!order || orderErr) {
    console.error(orderErr);
    return null;
  }

  const orderItemsData = [];
  for (const item of items) {
    const menuItem = await getMenuItemById(item.menu_item_id);
    if (menuItem && menuItem.available !== 0) {
      orderItemsData.push({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        item_name: menuItem.name,
        item_price: menuItem.price,
        quantity: item.quantity || 1,
        notes: item.notes || '',
        is_veg: menuItem.is_veg,
        status: 'pending'
      });
    }
  }
  
  if (orderItemsData.length > 0) {
    await supabase.from('order_items').insert(orderItemsData);
  }

  const table = await getTableById(tableId);
  if (table && table.status === 'available') {
    await updateTable(tableId, { status: 'occupied' });
  }

  return await getOrderById(order.id);
}

async function getOrderById(id) {
  const { data: order, error: orderErr } = await supabase.from('orders').select('*, tables(name)').eq('id', id).single();
  if (!order) return null;
  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', id).order('id');
  return { ...order, table_name: order.tables ? order.tables.name : 'Unknown', items: items || [] };
}

async function getActiveOrders() {
  const { data: orders, error } = await supabase.from('orders').select('*, tables(name)').eq('status', 'active').order('created_at', { ascending: false });
  if (!orders) return [];
  
  const orderIds = orders.map(o => o.id);
  if (orderIds.length === 0) return [];

  const { data: items } = await supabase.from('order_items').select('*').in('order_id', orderIds).order('id');
  
  return orders.map(o => ({
    ...o,
    table_name: o.tables ? o.tables.name : 'Unknown',
    items: items ? items.filter(i => i.order_id === o.id) : []
  }));
}

async function getOrdersByTable(tableId) {
  const { data: orders, error } = await supabase.from('orders').select('*, tables(name)').eq('table_id', tableId).in('status', ['active', 'completed']).order('created_at', { ascending: false });
  if (!orders || orders.length === 0) return [];
  
  const orderIds = orders.map(o => o.id);
  const { data: items } = await supabase.from('order_items').select('*').in('order_id', orderIds).order('id');
  
  return orders.map(o => ({
    ...o,
    table_name: o.tables ? o.tables.name : 'Unknown',
    items: items ? items.filter(i => i.order_id === o.id) : []
  }));
}

async function updateOrderItemStatus(orderItemId, status) {
  const { data: item, error } = await supabase.from('order_items').update({ status, updated_at: new Date().toISOString() }).eq('id', orderItemId).select().single();
  if (!item) return null;
  
  const { data: orderItems } = await supabase.from('order_items').select('status').eq('order_id', item.order_id);
  const allServed = orderItems && orderItems.every(oi => oi.status === 'served');
  
  if (allServed) {
    await supabase.from('orders').update({ status: 'completed' }).eq('id', item.order_id);
  }
  
  const order = await getOrderById(item.order_id);
  return { item, order };
}

async function updateAllOrderItemsStatus(orderId, status) {
  await supabase.from('order_items').update({ status, updated_at: new Date().toISOString() }).eq('order_id', orderId);
  if (status === 'served') {
    await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
  }
  return await getOrderById(orderId);
}

async function cancelOrder(orderId) {
  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
  await supabase.from('order_items').update({ status: 'cancelled' }).eq('order_id', orderId);
  return await getOrderById(orderId);
}

// ===========================
// Billing
// ===========================
async function generateBillNumber() {
  const todayDateString = new Date().toISOString().split('T')[0];
  const { count } = await supabase.from('bills').select('*', { count: 'exact', head: true }).gte('created_at', todayDateString);
  const todayStr = todayDateString.replace(/-/g, '');
  return `BILL-${todayStr}-${String((count || 0) + 1).padStart(3, '0')}`;
}

async function generateBill(tableId, discountPercent, paymentMethod) {
  const settingsObj = await getSettings();
  const taxPercent = parseFloat(settingsObj.tax_percent) || 5;
  
  const table = await getTableById(tableId);
  if (!table) return null;

  const tableOrders = await getOrdersByTable(tableId);
  if (tableOrders.length === 0) return null;

  const billNumber = await generateBillNumber();
  
  let subtotal = 0;
  const orderIds = [];

  for (const order of tableOrders) {
    orderIds.push(order.id);
    for (const item of order.items) {
      if (item.status !== 'cancelled') {
        subtotal += parseFloat(item.item_price) * item.quantity;
      }
    }
  }

  const disc = parseFloat(discountPercent) || 0;
  const discountAmount = Math.round((subtotal * disc / 100) * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round((afterDiscount * taxPercent / 100) * 100) / 100;
  const grandTotal = Math.round((afterDiscount + taxAmount) * 100) / 100;

  const { data: bill, error } = await supabase.from('bills').insert([{
    bill_number: billNumber,
    table_id: tableId,
    table_name: table.name,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_percent: taxPercent,
    tax_amount: taxAmount,
    discount_percent: disc,
    discount_amount: discountAmount,
    grand_total: grandTotal,
    payment_method: paymentMethod || 'cash',
    payment_status: 'unpaid'
  }]).select().single();

  if (!bill) {
     console.error(error);
     return null;
  }

  const billOrdersData = orderIds.map(oid => ({ bill_id: bill.id, order_id: oid }));
  await supabase.from('bill_orders').insert(billOrdersData);

  for (const oid of orderIds) {
    await supabase.from('orders').update({ status: 'billed' }).eq('id', oid);
  }

  await updateTable(tableId, { status: 'available' });

  return await getBillById(bill.id);
}

async function getBillById(id) {
  const { data: bill, error } = await supabase.from('bills').select('*').eq('id', id).single();
  if (!bill) return null;

  const { data: billOrders } = await supabase.from('bill_orders').select('order_id').eq('bill_id', id);
  if (!billOrders) return { ...bill, orders: [] };

  const orderIds = billOrders.map(bo => bo.order_id);
  const orders = [];
  for (const oid of orderIds) {
    const o = await getOrderById(oid);
    if (o) orders.push(o);
  }

  return { ...bill, orders };
}

async function getAllBills(limit = 50) {
  const { data, error } = await supabase.from('bills').select('*').order('created_at', { ascending: false }).limit(limit);
  return data || [];
}

async function markBillPaid(id, payment_method = null) {
  const updates = { payment_status: 'paid' };
  if (payment_method) updates.payment_method = payment_method;
  
  const { data, error } = await supabase.from('bills').update(updates).eq('id', id).select().single();
  if (!data) return null;
  return await getBillById(id);
}

// ===========================
// Stats
// ===========================
async function getTodayStats() {
  const todayDateString = new Date().toISOString().split('T')[0];
  
  const { data: paidBills } = await supabase.from('bills').select('grand_total').gte('created_at', todayDateString).eq('payment_status', 'paid');
  const revenue = (paidBills || []).reduce((s, b) => s + parseFloat(b.grand_total), 0);
  
  const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayDateString);
  const { count: activeOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: occupiedTables } = await supabase.from('tables').select('*', { count: 'exact', head: true }).eq('status', 'occupied');
  const { count: totalTables } = await supabase.from('tables').select('*', { count: 'exact', head: true });
  const { count: totalBills } = await supabase.from('bills').select('*', { count: 'exact', head: true }).gte('created_at', todayDateString);

  return { 
    revenue: Math.round(revenue * 100) / 100, 
    totalOrders: totalOrders || 0, 
    activeOrders: activeOrders || 0, 
    occupiedTables: occupiedTables || 0, 
    totalTables: totalTables || 0, 
    totalBills: totalBills || 0 
  };
}

module.exports = {
  initializeDatabase,
  getSettings,
  updateSetting,
  getAllTables,
  getTableById,
  createTable,
  updateTable,
  deleteTable,
  getAllCategories,
  getAllCategoriesIncludeInactive,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  getMenuItemById,
  getAvailableMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  createOrder,
  getOrderById,
  getActiveOrders,
  getOrdersByTable,
  updateOrderItemStatus,
  updateAllOrderItemsStatus,
  cancelOrder,
  generateBill,
  getBillById,
  getAllBills,
  markBillPaid,
  getTodayStats
};
