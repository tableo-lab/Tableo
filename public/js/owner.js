// ===========================
// TABLEO - Owner Panel JS
// ===========================

const socket = io();
let settings = {};
let currency = '₹';
let currentSection = 'dashboard';
let billingTableId = null;
let billingOrders = [];
let currentPrintBillId = null;

// ===========================
// Init
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  const meRes = await fetch('/api/me', { credentials: 'same-origin' });
  if (meRes.ok) {
    const me = await meRes.json();
    socket.emit('join-owner', me.restaurant_id);
  } else {
    socket.emit('join-owner');
  }
  loadSettings();
  loadDashboard();
  setTodayDate();

  // Socket events
  socket.on('new-order', (order) => {
    showToast(`New order from ${order.table_name} — ${order.customer_name}`, 'success');
    loadDashboard();
    if (currentSection === 'orders') loadOrders();
    if (currentSection === 'billing') loadBillingTables();
  });

  socket.on('order-status-update', () => {
    if (currentSection === 'orders') loadOrders();
    if (currentSection === 'dashboard') loadDashboard();
  });

  socket.on('stats-update', () => {
    loadDashboard();
  });

  socket.on('table-update', () => {
    if (currentSection === 'tables') loadTables();
    if (currentSection === 'billing') loadBillingTables();
    loadDashboard();
  });

  socket.on('waiter-called', (data) => {
    showToast(`🔔 Waiter called at ${data.tableName || 'Table ' + data.tableId}!`, 'warning');
  });
});

// ===========================
// Navigation
// ===========================
function showSection(section) {
  currentSection = section;

  // Hide all sections
  document.querySelectorAll('.owner-content > section').forEach(s => s.style.display = 'none');
  document.getElementById(`sec-${section}`).style.display = 'block';

  // Update sidebar
  document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
  const activeLink = document.querySelector(`.sidebar-menu a[data-section="${section}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Load section data
  switch (section) {
    case 'dashboard': loadDashboard(); break;
    case 'tables': loadTables(); break;
    case 'menu': loadMenuManagement(); break;
    case 'orders': loadOrders(); break;
    case 'billing': loadBillingTables(); break;
    case 'history': loadBillHistory(); break;
    case 'settings': loadSettingsForm(); break;
  }
}

function setTodayDate() {
  const d = new Date();
  document.getElementById('todayDate').textContent = d.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ===========================
// API Helper
// ===========================
async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return res.json();
}

// ===========================
// Settings
// ===========================
async function loadSettings() {
  settings = await api('/api/settings');
  currency = settings.currency_symbol || '₹';
}

function loadSettingsForm() {
  document.getElementById('setRestName').value = settings.restaurant_name || '';
  document.getElementById('setAddress').value = settings.restaurant_address || '';
  document.getElementById('setPhone').value = settings.restaurant_phone || '';
  document.getElementById('setGST').value = settings.gst_number || '';
  document.getElementById('setTax').value = settings.tax_percent || '5';
  document.getElementById('setCurrency').value = settings.currency_symbol || '₹';

  // Populate GST Type info card
  const gstType = settings.gst_type || 'composition';
  const badge = document.getElementById('gstTypeBadge');
  const info = document.getElementById('gstTypeInfo');
  const taxLabel = document.getElementById('taxRateLabel');
  const taxHint = document.getElementById('taxRateHint');

  if (gstType === 'regular') {
    badge.textContent = '🏢 REGULAR TAXPAYER';
    badge.className = 'status-badge status-preparing';
    info.innerHTML = `
      <div style="margin-bottom:8px;"><strong style="color:var(--info);">Regular GST Taxpayer</strong> — Your restaurant can charge GST to customers.</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.825rem;">
        <div>✅ Can collect GST from customers</div>
        <div>✅ Input Tax Credit (ITC) available</div>
        <div>📄 Issues <strong>Tax Invoice</strong></div>
        <div>📊 Monthly GSTR-1, GSTR-3B returns</div>
        <div>💰 5% GST (standalone) / 18% (hotel ≥₹7,500)</div>
        <div>🔄 Can do interstate supplies</div>
      </div>
      <div style="margin-top:10px; padding:8px 12px; background:var(--info-bg); border-radius:8px; font-size:0.8rem; color:var(--info);">
        ℹ️ GST type is set by the platform administrator. Contact support to change.
      </div>
    `;
    taxLabel.textContent = 'GST Rate (%)';
    taxHint.textContent = 'GST charged to customers on Tax Invoice';
  } else {
    badge.textContent = '🏪 COMPOSITION SCHEME';
    badge.className = 'status-badge status-available';
    info.innerHTML = `
      <div style="margin-bottom:8px;"><strong style="color:var(--success);">Composition Scheme Taxpayer</strong> — Simplified compliance for small restaurants.</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.825rem;">
        <div>🚫 Cannot charge GST to customers</div>
        <div>🚫 No Input Tax Credit (ITC)</div>
        <div>📄 Issues <strong>Bill of Supply</strong></div>
        <div>📊 Quarterly GSTR-4 returns</div>
        <div>💰 Fixed 5% on turnover (CGST 2.5% + SGST 2.5%)</div>
        <div>📍 Only intrastate supply allowed</div>
      </div>
      <div style="margin-top:10px; padding:8px 12px; background:var(--success-bg); border-radius:8px; font-size:0.8rem; color:var(--success);">
        ℹ️ Eligible for restaurants with annual turnover up to ₹1.5 Crore.
      </div>
    `;
    taxLabel.textContent = 'Inclusive Tax Rate (%)';
    taxHint.textContent = 'Tax included in menu prices (not shown separately to customers)';
  }
}

async function saveSettings() {
  const updates = {
    restaurant_name: document.getElementById('setRestName').value.trim(),
    restaurant_address: document.getElementById('setAddress').value.trim(),
    restaurant_phone: document.getElementById('setPhone').value.trim(),
    gst_number: document.getElementById('setGST').value.trim(),
    tax_percent: document.getElementById('setTax').value.trim(),
    currency_symbol: document.getElementById('setCurrency').value.trim()
  };

  settings = await api('/api/settings', { method: 'PUT', body: updates });
  currency = settings.currency_symbol || '₹';
  showToast('Settings saved successfully!', 'success');
}

async function changePassword() {
  const newPassword = document.getElementById('setNewPassword').value;
  if (!newPassword || newPassword.length < 4) {
    showToast('Password must be at least 4 characters long', 'error');
    return;
  }
  
  const res = await fetch('/api/restaurant/password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword })
  });
  
  if (res.ok) {
    showToast('Password changed successfully!', 'success');
    document.getElementById('setNewPassword').value = '';
    // Optionally prompt to re-login, but standard basic auth will prompt automatically when the browser clears its cache or tries to access next time
  } else {
    showToast('Failed to change password', 'error');
  }
}

// ===========================
// Dashboard
// ===========================
async function loadDashboard() {
  try {
    const stats = await api('/api/stats');
    document.getElementById('statRevenue').textContent = `${currency}${stats.revenue.toFixed(2)}`;
    document.getElementById('statOrders').textContent = stats.totalOrders;
    document.getElementById('statActive').textContent = stats.activeOrders;
    document.getElementById('statTables').textContent = `${stats.occupiedTables}/${stats.totalTables}`;
    document.getElementById('statBills').textContent = stats.totalBills;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ===========================
// Tables
// ===========================
async function loadTables() {
  const tables = await api('/api/tables');
  const grid = document.getElementById('tablesGrid');
  const empty = document.getElementById('tablesEmpty');

  if (tables.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = tables.map(t => `
    <div class="table-card ${t.status === 'occupied' ? 'occupied' : ''} fade-in-up">
      <div class="table-icon">🪑</div>
      <div class="table-name">${escHtml(t.name)}</div>
      <div class="table-seats">${t.seats} seats</div>
      <span class="status-badge status-${t.status}">${t.status}</span>
      <div class="table-card-actions">
        <button class="btn btn-sm btn-outline" onclick="showQrCode(${t.id})" title="QR Code">📱</button>
        <button class="btn btn-sm btn-secondary" onclick="openEditTableModal(${t.id}, '${escHtml(t.name)}', ${t.seats})" title="Edit">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDeleteTable(${t.id}, '${escHtml(t.name)}')" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

// Table Modal
function openAddTableModal() {
  document.getElementById('tableModalTitle').textContent = 'Add Table';
  document.getElementById('editTableId').value = '';
  document.getElementById('tableName').value = '';
  document.getElementById('tableSeats').value = '4';
  openModal('tableModal', 'tableModalOverlay');
}

function openEditTableModal(id, name, seats) {
  document.getElementById('tableModalTitle').textContent = 'Edit Table';
  document.getElementById('editTableId').value = id;
  document.getElementById('tableName').value = name;
  document.getElementById('tableSeats').value = seats;
  openModal('tableModal', 'tableModalOverlay');
}

function closeTableModal() {
  closeModal('tableModal', 'tableModalOverlay');
}

async function saveTable() {
  const id = document.getElementById('editTableId').value;
  const name = document.getElementById('tableName').value.trim();
  const seats = parseInt(document.getElementById('tableSeats').value) || 4;

  if (!name) { showToast('Please enter a table name', 'error'); return; }

  if (id) {
    await api(`/api/tables/${id}`, { method: 'PUT', body: { name, seats } });
    showToast('Table updated!', 'success');
  } else {
    await api('/api/tables', { method: 'POST', body: { name, seats } });
    showToast('Table created!', 'success');
  }

  closeTableModal();
  loadTables();
  loadDashboard();
}

async function confirmDeleteTable(id, name) {
  if (confirm(`Delete "${name}"? This cannot be undone.`)) {
    await api(`/api/tables/${id}`, { method: 'DELETE' });
    showToast('Table deleted', 'success');
    loadTables();
  }
}

// QR Code
async function showQrCode(tableId) {
  const data = await api(`/api/tables/${tableId}/qr`);
  if (data.error) { showToast(data.error, 'error'); return; }

  document.getElementById('qrDisplay').innerHTML = `
    <h3>${escHtml(data.table.name)}</h3>
    <img src="${data.qr}" alt="QR Code for ${escHtml(data.table.name)}" id="qrImage">
    <p class="qr-url">${data.url}</p>
    <p class="text-sm text-grey mt-8">Scan this QR code to open the menu for ${escHtml(data.table.name)}</p>
  `;
  openModal('qrModal', 'qrModalOverlay');
}

function closeQrModal() {
  closeModal('qrModal', 'qrModalOverlay');
}

function printQr() {
  const img = document.getElementById('qrImage');
  if (!img) return;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>TABLEO QR Code</title>
    <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;margin:0;}
    img{max-width:300px;}h2{margin-top:16px;}</style></head>
    <body><h1>tableo.</h1><img src="${img.src}"><h2>${document.querySelector('#qrDisplay h3').textContent}</h2>
    <p>Scan to view menu & order</p>
    <script>setTimeout(()=>window.print(),300)</script></body></html>
  `);
}

// ===========================
// Menu Management
// ===========================
async function loadMenuManagement() {
  await loadCategoriesSection();
  await loadMenuItemsSection();
}

async function loadCategoriesSection() {
  const cats = await api('/api/categories');
  const container = document.getElementById('categoriesList');
  const empty = document.getElementById('categoriesEmpty');

  if (cats.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.innerHTML = cats.map(cat => `
    <div class="chip" style="padding:10px 16px; gap:8px;">
      <span>${cat.icon} ${escHtml(cat.name)}</span>
      <button onclick="openEditCategoryModal(${cat.id}, '${escHtml(cat.name)}', '${cat.icon}')" style="background:none;border:none;cursor:pointer;font-size:0.75rem;">✏️</button>
      <button onclick="confirmDeleteCategory(${cat.id}, '${escHtml(cat.name)}')" style="background:none;border:none;cursor:pointer;font-size:0.75rem;">🗑️</button>
    </div>
  `).join('');
}

async function loadMenuItemsSection() {
  const items = await api('/api/menu');
  const body = document.getElementById('menuTableBody');
  const empty = document.getElementById('menuEmpty');
  const table = document.getElementById('menuTable');

  if (items.length === 0) {
    body.innerHTML = '';
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  table.style.display = 'table';
  empty.style.display = 'none';

  body.innerHTML = items.map(item => `
    <tr>
      <td><span class="veg-badge ${item.is_veg ? '' : 'nonveg'}" style="width:16px;height:16px;"></span></td>
      <td><strong>${escHtml(item.name)}</strong>${item.description ? '<br><span class="text-xs text-grey">' + escHtml(item.description) + '</span>' : ''}</td>
      <td>${escHtml(item.category_name || 'Uncategorized')}</td>
      <td><strong>${currency}${item.price.toFixed(2)}</strong></td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" ${item.available ? 'checked' : ''} onchange="toggleAvailability(${item.id})">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <div class="actions">
          <button class="btn btn-sm btn-secondary" onclick="openEditItemModal(${item.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteItem(${item.id}, '${escHtml(item.name)}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Category Modal
function openAddCategoryModal() {
  document.getElementById('catModalTitle').textContent = 'Add Category';
  document.getElementById('editCatId').value = '';
  document.getElementById('catName').value = '';
  document.getElementById('catIcon').value = '🍽️';
  openModal('catModal', 'catModalOverlay');
}

function openEditCategoryModal(id, name, icon) {
  document.getElementById('catModalTitle').textContent = 'Edit Category';
  document.getElementById('editCatId').value = id;
  document.getElementById('catName').value = name;
  document.getElementById('catIcon').value = icon;
  openModal('catModal', 'catModalOverlay');
}

function closeCategoryModal() {
  closeModal('catModal', 'catModalOverlay');
}

async function saveCategory() {
  const id = document.getElementById('editCatId').value;
  const name = document.getElementById('catName').value.trim();
  const icon = document.getElementById('catIcon').value.trim() || '🍽️';

  if (!name) { showToast('Please enter a category name', 'error'); return; }

  if (id) {
    await api(`/api/categories/${id}`, { method: 'PUT', body: { name, icon } });
    showToast('Category updated!', 'success');
  } else {
    await api('/api/categories', { method: 'POST', body: { name, icon } });
    showToast('Category created!', 'success');
  }

  closeCategoryModal();
  loadMenuManagement();
}

async function confirmDeleteCategory(id, name) {
  if (confirm(`Delete category "${name}"? Items in this category will become uncategorized.`)) {
    await api(`/api/categories/${id}`, { method: 'DELETE' });
    showToast('Category deleted', 'success');
    loadMenuManagement();
  }
}

// Menu Item Modal
async function openAddItemModal() {
  document.getElementById('itemModalTitle').textContent = 'Add Menu Item';
  document.getElementById('editItemId').value = '';
  document.getElementById('itemName').value = '';
  document.getElementById('itemDesc').value = '';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemImageUrl').value = '';
  document.querySelector('input[name="itemVeg"][value="1"]').checked = true;

  await populateCategorySelect();
  openModal('itemModal', 'itemModalOverlay');
}

async function openEditItemModal(id) {
  const item = await api(`/api/menu`);
  const menuItem = item.find(i => i.id === id);
  if (!menuItem) return;

  document.getElementById('itemModalTitle').textContent = 'Edit Menu Item';
  document.getElementById('editItemId').value = id;
  document.getElementById('itemName').value = menuItem.name;
  document.getElementById('itemDesc').value = menuItem.description || '';
  document.getElementById('itemPrice').value = menuItem.price;
  document.getElementById('itemImageUrl').value = menuItem.image_url || '';
  document.querySelector(`input[name="itemVeg"][value="${menuItem.is_veg ? '1' : '0'}"]`).checked = true;

  await populateCategorySelect(menuItem.category_id);
  openModal('itemModal', 'itemModalOverlay');
}

async function populateCategorySelect(selectedId) {
  const cats = await api('/api/categories');
  const select = document.getElementById('itemCategory');
  select.innerHTML = '<option value="">Select Category</option>';
  cats.forEach(cat => {
    select.innerHTML += `<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>${cat.icon} ${escHtml(cat.name)}</option>`;
  });
}

function closeItemModal() {
  closeModal('itemModal', 'itemModalOverlay');
}

async function saveItem() {
  const id = document.getElementById('editItemId').value;
  const name = document.getElementById('itemName').value.trim();
  const description = document.getElementById('itemDesc').value.trim();
  const price = parseFloat(document.getElementById('itemPrice').value);
  const category_id = parseInt(document.getElementById('itemCategory').value) || null;
  const is_veg = parseInt(document.querySelector('input[name="itemVeg"]:checked').value);
  const image_url = document.getElementById('itemImageUrl').value.trim();

  if (!name) { showToast('Please enter item name', 'error'); return; }
  if (isNaN(price) || price < 0) { showToast('Please enter a valid price', 'error'); return; }

  if (id) {
    await api(`/api/menu/${id}`, { method: 'PUT', body: { name, description, price, category_id, is_veg, image_url } });
    showToast('Item updated!', 'success');
  } else {
    await api('/api/menu', { method: 'POST', body: { name, description, price, category_id, is_veg, image_url } });
    showToast('Item added to menu!', 'success');
  }

  closeItemModal();
  loadMenuItemsSection();
}

async function toggleAvailability(id) {
  await api(`/api/menu/${id}/toggle`, { method: 'PUT' });
}

async function confirmDeleteItem(id, name) {
  if (confirm(`Delete "${name}" from menu?`)) {
    await api(`/api/menu/${id}`, { method: 'DELETE' });
    showToast('Item deleted', 'success');
    loadMenuItemsSection();
  }
}

// ===========================
// Orders
// ===========================
async function loadOrders() {
  const orders = await api('/api/orders');
  const grid = document.getElementById('ownerOrdersGrid');
  const empty = document.getElementById('ownerOrdersEmpty');

  if (orders.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = orders.map(order => {
    const total = order.items.reduce((s, i) => s + (i.item_price * i.quantity), 0);
    return `
      <div class="order-card fade-in-up">
        <div class="order-card-header">
          <div>
            <span class="order-number">${order.order_number}</span>
            <span class="text-grey text-sm"> · ${escHtml(order.customer_name)}</span>
          </div>
          <span class="text-sm">🪑 ${escHtml(order.table_name)} · ${currency}${total.toFixed(2)}</span>
        </div>
        <div class="order-card-body">
          ${order.items.map(item => `
            <div class="order-item-row">
              <div class="order-item-info">
                <span class="order-item-qty">${item.quantity}×</span>
                <span class="order-item-name">${escHtml(item.item_name)}</span>
              </div>
              <span class="status-badge status-${item.status}">${item.status}</span>
            </div>
          `).join('')}
        </div>
        <div class="order-card-footer">
          <span class="text-xs text-grey">${formatTime(order.created_at)}</span>
          <button class="btn btn-sm btn-danger" onclick="cancelOrder(${order.id})" style="margin-left:auto;">Cancel</button>
        </div>
      </div>`;
  }).join('');
}

async function cancelOrder(id) {
  if (confirm('Cancel this order?')) {
    await api(`/api/orders/${id}/cancel`, { method: 'PUT' });
    showToast('Order cancelled', 'warning');
    loadOrders();
    loadDashboard();
  }
}

// ===========================
// Billing
// ===========================
async function loadBillingTables() {
  const tables = await api('/api/tables');
  const occupiedTables = tables.filter(t => t.status === 'occupied');
  const grid = document.getElementById('billingTablesGrid');
  const empty = document.getElementById('billingTablesEmpty');

  if (occupiedTables.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('billPreviewCard').style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = occupiedTables.map(t => `
    <div class="table-card ${billingTableId === t.id ? 'occupied' : ''}" onclick="selectBillingTable(${t.id})" style="cursor:pointer;">
      <div class="table-icon">🪑</div>
      <div class="table-name">${escHtml(t.name)}</div>
      <span class="status-badge status-occupied">Occupied</span>
    </div>
  `).join('');
}

async function selectBillingTable(tableId) {
  billingTableId = tableId;
  const orders = await api(`/api/orders?table_id=${tableId}`);
  billingOrders = orders;

  const table = await api(`/api/tables/${tableId}`);
  document.getElementById('billTableName').textContent = `🪑 ${table.name}`;

  // Render items with inputs
  let html = '';
  orders.forEach(order => {
    html += `<div class="text-xs text-grey mb-8" style="margin-top:12px;">${order.order_number} · ${escHtml(order.customer_name)}</div>`;
    order.items.forEach(item => {
      if (item.status !== 'cancelled') {
        html += `
          <div class="flex justify-between text-sm align-center" style="padding:4px 0; gap:8px;" data-item-id="${item.id}" data-item-name="${escHtml(item.item_name)}">
            <span style="flex:1;">${escHtml(item.item_name)}</span>
            <input type="number" class="form-control bill-qty" style="width:50px; padding:2px 4px; text-align:center;" value="${item.quantity}" min="1" onchange="recalcBill()">
            <span style="line-height:28px;">×</span>
            <input type="number" class="form-control bill-price" style="width:80px; padding:2px 4px;" value="${parseFloat(item.item_price).toFixed(2)}" step="0.01" min="0" onchange="recalcBill()">
          </div>`;
      }
    });
  });
  document.getElementById('billItemsList').innerHTML = html;

  document.getElementById('billDiscount').value = '0';
  recalcBill();
  document.getElementById('billPreviewCard').style.display = 'block';
  loadBillingTables();
}

function addCustomCharge() {
  const container = document.getElementById('billItemsList');
  const div = document.createElement('div');
  div.className = "flex justify-between text-sm align-center custom-charge-row";
  div.style = "padding:4px 0; gap:8px; margin-top:8px; border-top:1px dashed #ccc; padding-top:8px;";
  div.innerHTML = `
      <input type="text" class="form-control custom-name" style="flex:1; padding:2px 4px;" placeholder="Custom Fee Name" value="Custom Charge">
      <input type="number" class="form-control bill-qty" style="width:50px; padding:2px 4px; text-align:center;" value="1" min="1" onchange="recalcBill()">
      <span style="line-height:28px;">×</span>
      <input type="number" class="form-control bill-price" style="width:80px; padding:2px 4px;" value="0.00" step="0.01" min="0" onchange="recalcBill()">
  `;
  container.appendChild(div);
  recalcBill();
}

function recalcBill() {
  let subtotal = 0;
  
  // Existing items
  document.querySelectorAll('#billItemsList > div[data-item-id]').forEach(div => {
    const qty = parseInt(div.querySelector('.bill-qty').value) || 0;
    const price = parseFloat(div.querySelector('.bill-price').value) || 0;
    subtotal += (qty * price);
  });

  // Custom items
  document.querySelectorAll('#billItemsList > .custom-charge-row').forEach(div => {
    const qty = parseInt(div.querySelector('.bill-qty').value) || 0;
    const price = parseFloat(div.querySelector('.bill-price').value) || 0;
    subtotal += (qty * price);
  });

  const discountPercent = parseFloat(document.getElementById('billDiscount').value) || 0;
  const discountAmount = Math.round((subtotal * discountPercent / 100) * 100) / 100;
  const grandTotal = subtotal - discountAmount;
  const taxPercent = parseFloat(settings.tax_percent) || 5;
  const taxAmount = Math.round((grandTotal * taxPercent / (100 + taxPercent)) * 100) / 100;
  const gstType = settings.gst_type || 'composition';
  const isComposition = gstType === 'composition';

  let taxInfoHtml = '';
  if (isComposition) {
    // Composition: tax is inclusive, cannot show GST separately to customer
    taxInfoHtml = `<div class="text-xs text-grey" style="text-align:right; margin-top:4px;">(Includes ${taxPercent}% Tax: ${currency}${taxAmount.toFixed(2)})</div>`;
  } else {
    // Regular: show CGST + SGST breakdown
    const halfTax = taxPercent / 2;
    const halfAmount = Math.round(taxAmount / 2 * 100) / 100;
    taxInfoHtml = `
      <div class="text-xs text-grey" style="text-align:right; margin-top:4px;">CGST (${halfTax}%): ${currency}${halfAmount.toFixed(2)}</div>
      <div class="text-xs text-grey" style="text-align:right;">SGST (${halfTax}%): ${currency}${(taxAmount - halfAmount).toFixed(2)}</div>
      <div class="text-xs text-grey" style="text-align:right; font-weight:600;">Total GST: ${currency}${taxAmount.toFixed(2)}</div>
    `;
  }

  document.getElementById('billSummary').innerHTML = `
    <div class="bill-row"><span>Total Items Value</span><span>${currency}${subtotal.toFixed(2)}</span></div>
    ${discountPercent > 0 ? `<div class="bill-row" style="color:var(--success)"><span>Discount (${discountPercent}%)</span><span>-${currency}${discountAmount.toFixed(2)}</span></div>` : ''}
    <div class="bill-row total"><span>Grand Total</span><span>${currency}${grandTotal.toFixed(2)}</span></div>
    ${taxInfoHtml}
  `;
}

async function generateBill() {
  if (!billingTableId) { showToast('Select a table first', 'error'); return; }

  const discountPercent = parseFloat(document.getElementById('billDiscount').value) || 0;
  const paymentMethod = document.getElementById('billPaymentMethod').value;

  const cartUpdates = [];
  document.querySelectorAll('#billItemsList > div[data-item-id]').forEach(div => {
    const qty = parseInt(div.querySelector('.bill-qty').value) || 0;
    const price = parseFloat(div.querySelector('.bill-price').value) || 0;
    cartUpdates.push({ itemId: div.getAttribute('data-item-id'), quantity: qty, item_price: price });
  });

  const customItems = [];
  document.querySelectorAll('#billItemsList > .custom-charge-row').forEach(div => {
    const qty = parseInt(div.querySelector('.bill-qty').value) || 0;
    const price = parseFloat(div.querySelector('.bill-price').value) || 0;
    const name = div.querySelector('.custom-name').value || 'Custom Fee';
    if(qty > 0 && price > 0) {
      customItems.push({ item_name: name, quantity: qty, item_price: price });
    }
  });

  const bill = await api('/api/bills', {
    method: 'POST',
    body: { table_id: billingTableId, discount_percent: discountPercent, payment_method: paymentMethod, cartUpdates, customItems }
  });

  if (bill.error) { showToast(bill.error, 'error'); return; }

  showToast('Bill generated!', 'success');
  billingTableId = null;
  billingOrders = [];
  document.getElementById('billPreviewCard').style.display = 'none';

  currentPrintBillId = bill.id;
  showPrintBill(bill);
  loadBillingTables();
  loadDashboard();
}

function showPrintBill(bill) {
  currentPrintBillId = bill.id;
  const restName = settings.restaurant_name || 'Restaurant';
  const restAddr = settings.restaurant_address || '';
  const restPhone = settings.restaurant_phone || '';
  const gst = settings.gst_number || '';
  const gstType = settings.gst_type || 'composition';
  const isComposition = gstType === 'composition';
  const invoiceTitle = isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE';

  let itemsHtml = '';
  if (bill.orders) {
    bill.orders.forEach(order => {
      order.items.forEach(item => {
        if (item.status !== 'cancelled') {
          itemsHtml += `
            <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.85rem;">
              <span>${item.quantity}× ${escHtml(item.item_name)}</span>
              <span>${currency}${(item.item_price * item.quantity).toFixed(2)}</span>
            </div>`;
        }
      });
    });
  }

  document.getElementById('printBillContent').innerHTML = `
    <div class="print-bill">
      <div class="bill-header">
        <h2 style="font-size:1.4rem;margin-bottom:4px;text-transform:uppercase;">${invoiceTitle}</h2>
        <h3 style="font-size:1.1rem;margin-bottom:4px;">${escHtml(restName)}</h3>
        ${restAddr ? `<p style="font-size:0.75rem;color:var(--grey-500);margin:2px 0;">${escHtml(restAddr)}</p>` : ''}
        ${restPhone ? `<p style="font-size:0.75rem;color:var(--grey-500);margin:2px 0;">Ph: ${escHtml(restPhone)}</p>` : ''}
        ${gst ? `<p style="font-size:0.75rem;font-weight:bold;margin:4px 0;">GSTIN: ${escHtml(gst)}</p>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:8px;color:var(--grey-500);">
        <span>${isComposition ? 'Bill' : 'Invoice'} No: ${bill.bill_number}</span>
        <span>${formatDateTime(bill.created_at)}</span>
      </div>
      <div style="font-size:0.85rem;margin-bottom:12px;"><strong>Table:</strong> ${escHtml(bill.table_name)}</div>
      <div class="bill-items">
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--grey-500);padding-bottom:6px;border-bottom:1px solid #333;margin-bottom:6px;">
          <span>ITEM</span><span>AMOUNT</span>
        </div>
        ${itemsHtml}
      </div>
      <div class="bill-summary" style="padding:8px 0;">
        <div class="bill-row"><span>Subtotal</span><span>${currency}${bill.subtotal.toFixed(2)}</span></div>
        ${bill.discount_percent > 0 ? `<div class="bill-row"><span>Discount (${bill.discount_percent}%)</span><span>-${currency}${bill.discount_amount.toFixed(2)}</span></div>` : ''}
        <div class="bill-row total"><span>GRAND TOTAL</span><span>${currency}${bill.grand_total.toFixed(2)}</span></div>
        ${isComposition 
          ? `<div style="text-align:right;font-size:0.75rem;margin-top:4px;">Includes Tax (${bill.tax_percent}%): ${currency}${bill.tax_amount.toFixed(2)}</div>`
          : `<div style="text-align:right;font-size:0.75rem;margin-top:4px;">CGST (${(bill.tax_percent/2).toFixed(1)}%): ${currency}${(bill.tax_amount/2).toFixed(2)}</div>
             <div style="text-align:right;font-size:0.75rem;">SGST (${(bill.tax_percent/2).toFixed(1)}%): ${currency}${(bill.tax_amount - bill.tax_amount/2).toFixed(2)}</div>`}
      </div>
      <div style="text-align:center;font-size:0.8rem;color:var(--grey-500);margin-top:12px;padding-top:12px;border-top:1px dashed #333;">
        <p>Payment: ${bill.payment_method.toUpperCase()}</p>
        <p style="margin-top:8px;font-style:italic;">Thank you for dining with us!</p>
        <p style="font-weight:600;margin-top:4px;">Powered by TABLEO</p>
      </div>
    </div>`;

  openModal('printModal', 'printModalOverlay');
}

function closePrintModal() {
  closeModal('printModal', 'printModalOverlay');
}

function doPrint() {
  const content = document.getElementById('printBillContent').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Bill</title>
    <style>body{font-family:'Courier New',monospace;max-width:300px;margin:20px auto;font-size:14px;}
    .bill-row{display:flex;justify-content:space-between;padding:3px 0;}
    .bill-row.total{border-top:2px solid #333;margin-top:6px;padding-top:8px;font-weight:bold;font-size:1.1em;}
    .bill-summary{padding:8px 0;}
    .bill-header{text-align:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px dashed #999;}
    .bill-items{margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed #999;}
    </style></head><body>${content}<script>setTimeout(()=>window.print(),300)</script></body></html>
  `);
}

async function markPaidAndClose() {
  if (currentPrintBillId) {
    await api(`/api/bills/${currentPrintBillId}/pay`, { method: 'PUT' });
    showToast('Bill marked as paid!', 'success');
    currentPrintBillId = null;
  }
  closePrintModal();
  loadDashboard();
}

// ===========================
// Bill History
// ===========================
async function loadBillHistory() {
  const bills = await api('/api/bills');
  const body = document.getElementById('billHistoryBody');
  const empty = document.getElementById('billHistoryEmpty');

  if (bills.length === 0) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  body.innerHTML = bills.map(bill => `
    <tr>
      <td><strong>${bill.bill_number}</strong></td>
      <td>${escHtml(bill.table_name)}</td>
      <td>${currency}${bill.subtotal.toFixed(2)}</td>
      <td>${currency}${bill.tax_amount.toFixed(2)}</td>
      <td>${bill.discount_percent > 0 ? bill.discount_percent + '%' : '—'}</td>
      <td><strong>${currency}${bill.grand_total.toFixed(2)}</strong></td>
      <td>${bill.payment_method.toUpperCase()}</td>
      <td><span class="status-badge status-${bill.payment_status}">${bill.payment_status}</span></td>
      <td class="text-xs">${formatDateTime(bill.created_at)}</td>
      <td>
        <div class="actions">
          <button class="btn btn-sm btn-secondary" onclick="viewBill(${bill.id})">👁️</button>
          ${bill.payment_status === 'unpaid' ? `<button class="btn btn-sm btn-success" onclick="payBill(${bill.id})">✅ Pay</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function viewBill(id) {
  const bill = await api(`/api/bills/${id}`);
  if (!bill || bill.error) { showToast('Bill not found', 'error'); return; }
  showPrintBill(bill);
}

async function payBill(id) {
  await api(`/api/bills/${id}/pay`, { method: 'PUT' });
  showToast('Bill marked as paid!', 'success');
  loadBillHistory();
  loadDashboard();
}

// ===========================
// Modal Helpers
// ===========================
function openModal(modalId, overlayId) {
  document.getElementById(overlayId).classList.add('active');
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId, overlayId) {
  document.getElementById(overlayId).classList.remove('active');
  document.getElementById(modalId).classList.remove('active');
}

// ===========================
// Helpers
// ===========================
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}
function downloadGSTReport() { window.open('/api/bills/export', '_blank'); }
