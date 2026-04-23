// ===========================
// TABLEO - Customer Page JS
// ===========================

const socket = io();
let tableId = null;
let customerName = '';
let cart = [];
let menuItems = [];
let categories = [];
let settings = {};
let currency = '₹';

// ===========================
// Init
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  // Extract table ID from URL
  const pathParts = window.location.pathname.split('/');
  tableId = parseInt(pathParts[pathParts.length - 1]);

  if (!tableId || isNaN(tableId)) {
    document.querySelector('.main-content').innerHTML = `
      <div class="empty-state" style="margin-top:60px;">
        <div class="empty-icon">❌</div>
        <h3>Invalid Table</h3>
        <p>Please scan a valid QR code to access the menu.</p>
      </div>`;
    return;
  }

  // Load saved customer name
  const saved = localStorage.getItem(`tableo_name_${tableId}`);
  if (saved) {
    customerName = saved;
    document.getElementById('customerNameInput').value = saved;
  }

  // Join socket room
  socket.emit('join-table', tableId);

  // Load data
  loadSettings();
  loadTableInfo();
  loadMenu();
  loadMyOrders();

  // Socket events
  socket.on('order-status-update', (data) => {
    if (data.order && data.order.table_id === tableId) {
      loadMyOrders();
      showToast(`Order updated: ${data.item ? data.item.item_name + ' is ' + data.item.status : 'Status changed'}`, 'success');
    }
  });

  socket.on('menu-update', () => {
    loadMenu();
  });
});

// ===========================
// API Helpers
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
// Load Data
// ===========================
async function loadSettings() {
  settings = await api('/api/settings');
  currency = settings.currency_symbol || '₹';
  document.getElementById('restaurantName').textContent = `Welcome to ${settings.restaurant_name || 'Our Restaurant'}!`;
}

async function loadTableInfo() {
  const table = await api(`/api/tables/${tableId}`);
  if (table && table.name) {
    document.getElementById('tableTag').textContent = `🪑 ${table.name}`;
    document.getElementById('tableBanner').textContent = `🪑 You're at ${table.name}`;
    document.title = `TABLEO — ${table.name}`;
  }
}

async function loadMenu() {
  const items = await api('/api/menu?available=1');
  menuItems = items;

  // Extract unique categories
  const catMap = new Map();
  items.forEach(item => {
    if (item.category_id && !catMap.has(item.category_id)) {
      catMap.set(item.category_id, { id: item.category_id, name: item.category_name, icon: item.category_icon || '🍽️' });
    }
  });
  categories = Array.from(catMap.values());

  renderCategories();
  renderMenu(items);
}

async function loadMyOrders() {
  const orders = await api(`/api/orders?table_id=${tableId}`);
  renderOrders(orders);
}

// ===========================
// Render Categories
// ===========================
function renderCategories() {
  const container = document.getElementById('categoryChips');
  if (categories.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = `<button class="chip active" onclick="selectCategory(null, this)">All</button>`;
  categories.forEach(cat => {
    html += `<button class="chip" onclick="selectCategory(${cat.id}, this)">${cat.icon} ${cat.name}</button>`;
  });
  container.innerHTML = html;
}

function selectCategory(catId, el) {
  document.querySelectorAll('.category-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  if (catId === null) {
    renderMenu(menuItems);
  } else {
    renderMenu(menuItems.filter(m => m.category_id === catId));
  }
}

// ===========================
// Render Menu
// ===========================
function renderMenu(items) {
  const grid = document.getElementById('menuGrid');
  const empty = document.getElementById('menuEmpty');

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = items.map(item => {
    const inCart = cart.find(c => c.menu_item_id === item.id);
    const vegClass = item.is_veg ? '' : 'nonveg';

    return `
      <div class="menu-item-card fade-in-up" id="menu-card-${item.id}">
        ${item.image_url ? `<img src="${item.image_url}" onerror="this.style.display='none'" style="width:100%; height:160px; object-fit:cover; border-radius:8px; margin-bottom:12px;">` : ''}
        <div class="menu-item-header">
          <div class="veg-badge ${vegClass}"></div>
          <span class="menu-item-name">${escHtml(item.name)}</span>
        </div>
        ${item.description ? `<p class="menu-item-desc">${escHtml(item.description)}</p>` : ''}
        <div class="menu-item-footer">
          <span class="menu-item-price">${currency}${item.price.toFixed(2)}</span>
          ${inCart ? `
            <div class="qty-control">
              <button class="qty-btn" onclick="updateCartQty(${item.id}, -1)">−</button>
              <span class="qty-value">${inCart.quantity}</span>
              <button class="qty-btn" onclick="updateCartQty(${item.id}, 1)">+</button>
            </div>
          ` : `
            <button class="add-to-cart-btn" onclick="addToCart(${item.id})">+ ADD</button>
          `}
        </div>
      </div>`;
  }).join('');
}

// ===========================
// Search / Filter
// ===========================
function filterMenu() {
  const q = document.getElementById('menuSearch').value.toLowerCase().trim();
  if (!q) {
    renderMenu(menuItems);
    return;
  }
  const filtered = menuItems.filter(m =>
    m.name.toLowerCase().includes(q) ||
    (m.description && m.description.toLowerCase().includes(q)) ||
    (m.category_name && m.category_name.toLowerCase().includes(q))
  );
  renderMenu(filtered);
}

// ===========================
// Cart
// ===========================
function addToCart(itemId) {
  const item = menuItems.find(m => m.id === itemId);
  if (!item) return;

  const existing = cart.find(c => c.menu_item_id === itemId);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      notes: ''
    });
  }

  updateCartUI();
  renderMenu(getCurrentFilteredItems());
  showToast(`${item.name} added to cart`, 'success');
}

function updateCartQty(itemId, delta) {
  const existing = cart.find(c => c.menu_item_id === itemId);
  if (!existing) return;

  existing.quantity += delta;
  if (existing.quantity <= 0) {
    cart = cart.filter(c => c.menu_item_id !== itemId);
  }

  updateCartUI();
  renderMenu(getCurrentFilteredItems());
}

function removeFromCart(itemId) {
  cart = cart.filter(c => c.menu_item_id !== itemId);
  updateCartUI();
  renderMenu(getCurrentFilteredItems());
}

function getCurrentFilteredItems() {
  const q = document.getElementById('menuSearch').value.toLowerCase().trim();
  const activeChip = document.querySelector('.category-chips .chip.active');
  let items = menuItems;

  if (activeChip && activeChip.textContent.trim() !== 'All') {
    const catId = parseInt(activeChip.getAttribute('onclick').match(/selectCategory\((\d+)/)?.[1]);
    if (catId) items = items.filter(m => m.category_id === catId);
  }

  if (q) {
    items = items.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  }

  return items;
}

function updateCartUI() {
  const fab = document.getElementById('cartFab');
  const count = document.getElementById('cartCount');
  const total = cart.reduce((s, c) => s + c.quantity, 0);

  if (total > 0) {
    fab.style.display = 'flex';
    count.textContent = total;
  } else {
    fab.style.display = 'none';
  }

  renderCartPanel();
}

function renderCartPanel() {
  const container = document.getElementById('cartItems');
  const empty = document.getElementById('cartEmpty');
  const footer = document.getElementById('cartFooter');

  if (cart.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    footer.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  footer.style.display = 'block';

  let grandTotal = 0;
  container.innerHTML = cart.map(item => {
    const itemTotal = item.price * item.quantity;
    grandTotal += itemTotal;
    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          <div class="cart-item-price">${currency}${item.price.toFixed(2)} × ${item.quantity}</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn" onclick="updateCartQty(${item.menu_item_id}, -1)">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="updateCartQty(${item.menu_item_id}, 1)">+</button>
        </div>
        <div class="cart-item-total">${currency}${itemTotal.toFixed(2)}</div>
      </div>`;
  }).join('');

  document.getElementById('cartTotal').textContent = `${currency}${grandTotal.toFixed(2)}`;
}

function openCart() {
  document.getElementById('cartOverlay').classList.add('active');
  document.getElementById('cartPanel').classList.add('active');
  renderCartPanel();
}

function closeCart() {
  document.getElementById('cartOverlay').classList.remove('active');
  document.getElementById('cartPanel').classList.remove('active');
}

// ===========================
// Place Order
// ===========================
async function placeOrder() {
  if (cart.length === 0) {
    showToast('Your cart is empty!', 'error');
    return;
  }

  const name = customerName || document.getElementById('customerNameInput').value.trim();
  if (!name) {
    showToast('Please enter your name first to place the order', 'error');
    document.getElementById('customerNameInput').focus();
    return;
  }
  
  const notes = document.getElementById('orderNotes').value.trim();

  const orderItems = cart.map(c => ({
    menu_item_id: c.menu_item_id,
    quantity: c.quantity,
    notes: ''
  }));

  try {
    const order = await api('/api/orders', {
      method: 'POST',
      body: { table_id: tableId, customer_name: name, items: orderItems, notes }
    });

    if (order.error) {
      showToast(order.error, 'error');
      return;
    }

    cart = [];
    updateCartUI();
    closeCart();
    document.getElementById('orderNotes').value = '';
    showToast(`Order placed! Your order #${order.order_number}`, 'success');

    // Switch to orders tab
    switchTab('orders');
    loadMyOrders();
  } catch (err) {
    showToast('Failed to place order. Please try again.', 'error');
  }
}

// ===========================
// Customer Name
// ===========================
function setCustomerName() {
  const name = document.getElementById('customerNameInput').value.trim();
  if (name) {
    customerName = name;
    localStorage.setItem(`tableo_name_${tableId}`, name);
    showToast(`Welcome, ${name}!`, 'success');
  }
}

// ===========================
// Render Orders
// ===========================
function renderOrders(orders) {
  const container = document.getElementById('ordersContainer');
  const empty = document.getElementById('ordersEmpty');

  if (!orders || orders.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  container.innerHTML = orders.map(order => {
    return `
      <div class="tracker-order fade-in-up">
        <div class="tracker-order-header">
          <div>
            <strong style="color:var(--primary);">${order.order_number}</strong>
            <span class="text-grey text-sm"> · ${order.customer_name}</span>
          </div>
          <span class="text-xs text-grey">${formatTime(order.created_at)}</span>
        </div>
        <div class="tracker-order-body">
          ${order.items.map(item => `
            <div class="tracker-item">
              <div class="flex items-center gap-8">
                <span class="order-item-qty">${item.quantity}×</span>
                <div>
                  <div class="order-item-name">${escHtml(item.item_name)}</div>
                  ${item.notes ? `<div class="order-item-note">${escHtml(item.notes)}</div>` : ''}
                </div>
              </div>
              <span class="status-badge status-${item.status}">${getStatusIcon(item.status)} ${item.status}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

// ===========================
// Tabs
// ===========================
function switchTab(tab) {
  document.querySelectorAll('#customerTabs .tab').forEach(t => t.classList.remove('active'));
  if (tab === 'menu') {
    document.querySelector('#customerTabs .tab:first-child').classList.add('active');
    document.getElementById('menuTab').style.display = 'block';
    document.getElementById('ordersTab').style.display = 'none';
  } else {
    document.querySelector('#customerTabs .tab:last-child').classList.add('active');
    document.getElementById('menuTab').style.display = 'none';
    document.getElementById('ordersTab').style.display = 'block';
    loadMyOrders();
  }
}

// ===========================
// Call Waiter
// ===========================
function callWaiter() {
  const tableTag = document.getElementById('tableTag').textContent;
  socket.emit('call-waiter', { tableId, tableName: tableTag });
  showToast('Waiter has been notified!', 'success');
  const btn = document.getElementById('callWaiterBtn');
  btn.disabled = true;
  btn.textContent = '✅ Waiter Called';
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = '🔔 Call Waiter';
  }, 30000);
}

// ===========================
// Helpers
// ===========================
function getStatusIcon(status) {
  const icons = { pending: '🟡', preparing: '🔵', ready: '🟢', served: '✅', cancelled: '❌' };
  return icons[status] || '⚪';
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}
