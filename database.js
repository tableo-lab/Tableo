require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

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
// Restaurants (Super Admin)
// ===========================
async function getAllRestaurants() {
  const { data, error } = await supabase.from('restaurants').select('id, username, name, gst_type, created_at');
  if (error) {
    // Fallback if gst_type column doesn't exist yet
    const { data: fallback } = await supabase.from('restaurants').select('id, username, name, created_at');
    return (fallback || []).map(r => ({ ...r, gst_type: 'composition' }));
  }
  return data;
}

async function getRestaurantByUsername(username) {
  const { data, error } = await supabase.from('restaurants').select('*').eq('username', username).single();
  return data || null;
}

async function getRestaurantById(id) {
  const { data, error } = await supabase.from('restaurants').select('*').eq('id', id).single();
  return data || null;
}

async function createRestaurant(username, password, name, gstType) {
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    const insertData = { username, password_hash, name };
    // Add gst_type if the column exists (graceful)
    if (gstType) insertData.gst_type = gstType;

    const { data, error } = await supabase.from('restaurants').insert([insertData]).select().single();
    
    if (error) throw error;
    return { id: data.id, username: data.username, name: data.name, gst_type: data.gst_type || 'composition' };
  } catch(e) {
    console.error(e);
    // Retry without gst_type if column doesn't exist
    if (e.message && e.message.includes('gst_type')) {
      try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const { data, error } = await supabase.from('restaurants').insert([{ username, password_hash, name }]).select().single();
        if (error) throw error;
        return { id: data.id, username: data.username, name: data.name, gst_type: 'composition' };
      } catch(e2) {
        console.error(e2);
        return null;
      }
    }
    return null;
  }
}

async function updateRestaurantPassword(restaurantId, newPassword) {
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);
    const { data, error } = await supabase.from('restaurants').update({ password_hash }).eq('id', restaurantId).select().single();
    return !error;
  } catch(e) {
    return false;
  }
}

// ===========================
// Settings
// ===========================
async function getSettings(restaurantId) {
  const { data, error } = await supabase.from('settings').select('*').eq('restaurant_id', restaurantId);
  if (error || !data) return {};
  const settings = {};
  data.forEach(s => settings[s.key] = s.value);
  return settings;
}

async function updateSetting(restaurantId, key, value) {
  const { error } = await supabase.from('settings').upsert({ restaurant_id: restaurantId, key, value });
  if (error) console.error('Error updating setting:', error);
}

// ===========================
// Tables
// ===========================
async function getAllTables(restaurantId) {
  const { data, error } = await supabase.from('tables').select('*').eq('restaurant_id', restaurantId).order('name');
  if (error) return [];
  return data;
}

// Gloabl fetch for QR scan
async function getTableByIdGlobal(id) {
  const { data, error } = await supabase.from('tables').select('*').eq('id', id).single();
  return data || null;
}

async function getTableById(restaurantId, id) {
  const { data, error } = await supabase.from('tables').select('*').eq('restaurant_id', restaurantId).eq('id', id).single();
  return data || null;
}

async function createTable(restaurantId, name, seats) {
  const { data, error } = await supabase.from('tables').insert([{ restaurant_id: restaurantId, name, seats: seats || 4, status: 'available' }]).select().single();
  return data || null;
}

async function updateTable(restaurantId, id, updates) {
  const { data, error } = await supabase.from('tables').update(updates).eq('restaurant_id', restaurantId).eq('id', id).select().single();
  return data || null;
}

async function deleteTable(restaurantId, id) {
  const { error } = await supabase.from('tables').delete().eq('restaurant_id', restaurantId).eq('id', id);
  return !error;
}

// ===========================
// Categories
// ===========================
async function getAllCategories(restaurantId) {
  const { data, error } = await supabase.from('categories').select('*').eq('restaurant_id', restaurantId).neq('active', 0).order('position');
  return data || [];
}

async function getAllCategoriesIncludeInactive(restaurantId) {
  const { data, error } = await supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('position');
  return data || [];
}

async function createCategory(restaurantId, name, icon) {
  const cats = await getAllCategoriesIncludeInactive(restaurantId);
  const maxPos = cats.reduce((m, c) => Math.max(m, c.position || 0), 0);
  const { data, error } = await supabase.from('categories').insert([{ restaurant_id: restaurantId, name, icon: icon || '🍽️', position: maxPos + 1, active: 1 }]).select().single();
  return data || null;
}

async function updateCategory(restaurantId, id, updates) {
  const { data, error } = await supabase.from('categories').update(updates).eq('restaurant_id', restaurantId).eq('id', id).select().single();
  return data || null;
}

async function deleteCategory(restaurantId, id) {
  await supabase.from('menu_items').update({ category_id: null }).eq('restaurant_id', restaurantId).eq('category_id', id);
  const { error } = await supabase.from('categories').delete().eq('restaurant_id', restaurantId).eq('id', id);
  return !error;
}

// ===========================
// Menu Items
// ===========================
async function getMenuItems(restaurantId, categoryId) {
  let query = supabase.from('menu_items').select('*, categories(name)').eq('restaurant_id', restaurantId).order('position');
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data, error } = await query;
  if (!data) return [];
  return data.map(d => ({ ...d, category_name: d.categories ? d.categories.name : 'Uncategorized' }));
}

async function getMenuItemById(restaurantId, id) {
  const { data, error } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).eq('id', id).single();
  return data || null;
}

async function getAvailableMenu(restaurantId) {
  const cats = await getAllCategories(restaurantId);
  const activeCatIds = cats.map(c => c.id);
  
  const { data, error } = await supabase.from('menu_items').select('*, categories(name, icon, position)').eq('restaurant_id', restaurantId).neq('available', 0);
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

async function createMenuItem(restaurantId, itemData) {
  let query = supabase.from('menu_items').select('position').eq('restaurant_id', restaurantId);
  if (itemData.category_id) query = query.eq('category_id', itemData.category_id);
  else query = query.is('category_id', null);
  
  const { data: posData } = await query;
  const maxPos = posData ? posData.reduce((m, d) => Math.max(m, d.position || 0), 0) : 0;
  
  const { data, error } = await supabase.from('menu_items').insert([{
    restaurant_id: restaurantId,
    category_id: itemData.category_id || null,
    name: itemData.name,
    description: itemData.description || '',
    price: parseFloat(itemData.price),
    is_veg: itemData.is_veg !== undefined ? itemData.is_veg : 1,
    image_url: itemData.image_url || null,
    available: 1,
    position: maxPos + 1
  }]).select('*, categories(name)').single();
  
  if (!data) return null;
  return { ...data, category_name: data.categories ? data.categories.name : 'Uncategorized' };
}

async function updateMenuItem(restaurantId, id, updates) {
  if (updates.price !== undefined) updates.price = parseFloat(updates.price);
  const { data, error } = await supabase.from('menu_items').update(updates).eq('restaurant_id', restaurantId).eq('id', id).select('*, categories(name)').single();
  if (!data) return null;
  return { ...data, category_name: data.categories ? data.categories.name : 'Uncategorized' };
}

async function deleteMenuItem(restaurantId, id) {
  const { error } = await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId).eq('id', id);
  return !error;
}

async function toggleMenuItemAvailability(restaurantId, id) {
  const mi = await getMenuItemById(restaurantId, id);
  if (!mi) return null;
  return await updateMenuItem(restaurantId, id, { available: mi.available ? 0 : 1 });
}

// ===========================
// Orders
// ===========================
async function generateOrderNumber(restaurantId) {
  const todayDateString = new Date().toISOString().split('T')[0];
  const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).gte('created_at', todayDateString);
  const todayStr = todayDateString.replace(/-/g, '');
  return `ORD-${todayStr}-${String((count || 0) + 1).padStart(3, '0')}`;
}

async function createOrder(restaurantId, tableId, customerName, items, notes) {
  const orderNumber = await generateOrderNumber(restaurantId);
  const { data: order, error: orderErr } = await supabase.from('orders').insert([{
    restaurant_id: restaurantId,
    table_id: tableId,
    customer_name: customerName || 'Guest',
    order_number: orderNumber,
    status: 'active',
    notes: notes || ''
  }]).select().single();
  
  if (!order || orderErr) return null;

  const orderItemsData = [];
  for (const item of items) {
    const menuItem = await getMenuItemById(restaurantId, item.menu_item_id);
    if (menuItem && menuItem.available !== 0) {
      orderItemsData.push({
        restaurant_id: restaurantId,
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

  const table = await getTableById(restaurantId, tableId);
  if (table && table.status === 'available') {
    await updateTable(restaurantId, tableId, { status: 'occupied' });
  }

  return await getOrderById(restaurantId, order.id);
}

async function getOrderById(restaurantId, id) {
  const { data: order, error } = await supabase.from('orders').select('*, tables(name)').eq('restaurant_id', restaurantId).eq('id', id).single();
  if (!order) return null;
  const { data: items } = await supabase.from('order_items').select('*').eq('restaurant_id', restaurantId).eq('order_id', id).order('id');
  return { ...order, table_name: order.tables ? order.tables.name : 'Unknown', items: items || [] };
}

async function getActiveOrders(restaurantId) {
  const { data: orders, error } = await supabase.from('orders').select('*, tables(name)').eq('restaurant_id', restaurantId).eq('status', 'active').order('created_at', { ascending: false });
  if (!orders || orders.length === 0) return [];
  
  const orderIds = orders.map(o => o.id);
  const { data: items } = await supabase.from('order_items').select('*').eq('restaurant_id', restaurantId).in('order_id', orderIds).order('id');
  
  return orders.map(o => ({
    ...o,
    table_name: o.tables ? o.tables.name : 'Unknown',
    items: items ? items.filter(i => i.order_id === o.id) : []
  }));
}

async function getOrdersByTable(restaurantId, tableId) {
  const { data: orders, error } = await supabase.from('orders').select('*, tables(name)').eq('restaurant_id', restaurantId).eq('table_id', tableId).in('status', ['active', 'completed']).order('created_at', { ascending: false });
  if (!orders || orders.length === 0) return [];
  
  const orderIds = orders.map(o => o.id);
  const { data: items } = await supabase.from('order_items').select('*').eq('restaurant_id', restaurantId).in('order_id', orderIds).order('id');
  
  return orders.map(o => ({
    ...o,
    table_name: o.tables ? o.tables.name : 'Unknown',
    items: items ? items.filter(i => i.order_id === o.id) : []
  }));
}

async function updateOrderItemStatus(restaurantId, orderItemId, status) {
  const { data: item, error } = await supabase.from('order_items').update({ status, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId).eq('id', orderItemId).select().single();
  if (!item) return null;
  
  const { data: orderItems } = await supabase.from('order_items').select('status').eq('restaurant_id', restaurantId).eq('order_id', item.order_id);
  const allServed = orderItems && orderItems.every(oi => oi.status === 'served');
  
  if (allServed) {
    await supabase.from('orders').update({ status: 'completed' }).eq('restaurant_id', restaurantId).eq('id', item.order_id);
  }
  
  const order = await getOrderById(restaurantId, item.order_id);
  return { item, order };
}

async function updateAllOrderItemsStatus(restaurantId, orderId, status) {
  await supabase.from('order_items').update({ status, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId).eq('order_id', orderId);
  if (status === 'served') {
    await supabase.from('orders').update({ status: 'completed' }).eq('restaurant_id', restaurantId).eq('id', orderId);
  }
  return await getOrderById(restaurantId, orderId);
}

async function cancelOrder(restaurantId, orderId) {
  await supabase.from('orders').update({ status: 'cancelled' }).eq('restaurant_id', restaurantId).eq('id', orderId);
  await supabase.from('order_items').update({ status: 'cancelled' }).eq('restaurant_id', restaurantId).eq('order_id', orderId);
  return await getOrderById(restaurantId, orderId);
}

// ===========================
// Billing
// ===========================
async function generateBillNumber(restaurantId) {
  const todayDateString = new Date().toISOString().split('T')[0];
  const { count } = await supabase.from('bills').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).gte('created_at', todayDateString);
  const todayStr = todayDateString.replace(/-/g, '');
  return `BILL-${todayStr}-${String((count || 0) + 1).padStart(3, '0')}`;
}

async function generateBill(restaurantId, tableId, discountPercent, paymentMethod, cartUpdates = [], customItems = []) {
  const settingsObj = await getSettings(restaurantId);
  const taxPercent = parseFloat(settingsObj.tax_percent) || 5;
  
  const table = await getTableById(restaurantId, tableId);
  if (!table) return null;

  // 1. Apply edits to existing active orders
  if (cartUpdates && cartUpdates.length > 0) {
    for (const update of cartUpdates) {
      await supabase.from('order_items')
        .update({ quantity: update.quantity, item_price: update.item_price })
        .eq('restaurant_id', restaurantId)
        .eq('id', update.itemId);
    }
  }

  // 2. Add custom line items by creating an 'adjustment order'
  if (customItems && customItems.length > 0) {
    await createOrder(restaurantId, tableId, 'System (Adjustment)', customItems, 'Custom Billing Items');
  }

  const tableOrders = await getOrdersByTable(restaurantId, tableId);
  if (tableOrders.length === 0) return null;

  const billNumber = await generateBillNumber(restaurantId);
  
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
  const grandTotal = subtotal - discountAmount; 
  const taxAmount = Math.round((grandTotal * taxPercent / (100 + taxPercent)) * 100) / 100;

  const { data: bill, error } = await supabase.from('bills').insert([{
    restaurant_id: restaurantId,
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

  if (!bill) return null;

  const billOrdersData = orderIds.map(oid => ({ bill_id: bill.id, order_id: oid }));
  await supabase.from('bill_orders').insert(billOrdersData);

  for (const oid of orderIds) {
    await supabase.from('orders').update({ status: 'billed' }).eq('restaurant_id', restaurantId).eq('id', oid);
  }

  await updateTable(restaurantId, tableId, { status: 'available' });

  return await getBillById(restaurantId, bill.id);
}

async function getBillById(restaurantId, id) {
  const { data: bill, error } = await supabase.from('bills').select('*').eq('restaurant_id', restaurantId).eq('id', id).single();
  if (!bill) return null;

  const { data: billOrders } = await supabase.from('bill_orders').select('order_id').eq('bill_id', id);
  if (!billOrders) return { ...bill, orders: [] };

  const orderIds = billOrders.map(bo => bo.order_id);
  const orders = [];
  for (const oid of orderIds) {
    const o = await getOrderById(restaurantId, oid);
    if (o) orders.push(o);
  }

  return { ...bill, orders };
}

async function getAllBills(restaurantId, limit = 50) {
  const { data, error } = await supabase.from('bills').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(limit);
  return data || [];
}

async function markBillPaid(restaurantId, id, payment_method = null) {
  const updates = { payment_status: 'paid' };
  if (payment_method) updates.payment_method = payment_method;
  
  const { data, error } = await supabase.from('bills').update(updates).eq('restaurant_id', restaurantId).eq('id', id).select().single();
  if (!data) return null;
  return await getBillById(restaurantId, id);
}

// ===========================
// Stats
// ===========================
async function getTodayStats(restaurantId) {
  const todayDateString = new Date().toISOString().split('T')[0];
  
  const { data: paidBills } = await supabase.from('bills').select('grand_total').eq('restaurant_id', restaurantId).gte('created_at', todayDateString).eq('payment_status', 'paid');
  const revenue = (paidBills || []).reduce((s, b) => s + parseFloat(b.grand_total), 0);
  
  const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).gte('created_at', todayDateString);
  const { count: activeOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('status', 'active');
  const { count: occupiedTables } = await supabase.from('tables').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('status', 'occupied');
  const { count: totalTables } = await supabase.from('tables').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId);
  const { count: totalBills } = await supabase.from('bills').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).gte('created_at', todayDateString);

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
  getAllRestaurants,
  getRestaurantByUsername,
  getRestaurantById,
  createRestaurant,
  updateRestaurantPassword,
  getSettings,
  updateSetting,
  getAllTables,
  getTableByIdGlobal,
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
