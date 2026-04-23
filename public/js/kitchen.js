// ===========================
// TABLEO - Kitchen Display JS
// ===========================

const socket = io();
let allOrders = [];
let currentFilter = 'all';
let soundEnabled = true;

// ===========================
// Init
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  const meRes = await fetch('/api/me', { credentials: 'same-origin' });
  if (meRes.ok) {
    const me = await meRes.json();
    socket.emit('join-kitchen', me.restaurant_id);
  } else {
    socket.emit('join-kitchen');
  }
  loadOrders();

  // Real-time events
  socket.on('new-order', (order) => {
    if (soundEnabled) playNotifSound();
    showToast(`New order from ${order.table_name} — ${order.customer_name}`, 'success');
    loadOrders();
  });

  socket.on('order-status-update', () => {
    loadOrders();
  });

  socket.on('order-cancelled', (order) => {
    showToast(`Order ${order.order_number} cancelled`, 'warning');
    loadOrders();
  });

  socket.on('waiter-called', (data) => {
    showWaiterAlert(data);
    if (soundEnabled) playNotifSound();
  });

  // Auto-refresh every 15s
  setInterval(loadOrders, 15000);
});

// ===========================
// Load Orders
// ===========================
async function loadOrders() {
  try {
    const res = await fetch('/api/orders', { credentials: 'same-origin' });
    allOrders = await res.json();
    renderOrders();
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

// ===========================
// Render Orders
// ===========================
function renderOrders() {
  const grid = document.getElementById('ordersGrid');
  const empty = document.getElementById('emptyState');

  let filtered = allOrders;
  if (currentFilter !== 'all') {
    filtered = allOrders.filter(order =>
      order.items.some(item => item.status === currentFilter)
    );
  }

  document.getElementById('orderCountText').textContent = `${allOrders.length} active order${allOrders.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  grid.innerHTML = filtered.map(order => {
    const elapsed = getElapsedTime(order.created_at);
    const allItemStatuses = order.items.map(i => i.status);
    const hasPending = allItemStatuses.includes('pending');
    const hasPreparing = allItemStatuses.includes('preparing');

    return `
      <div class="order-card fade-in-up" id="order-${order.id}">
        <div class="order-card-header">
          <div>
            <span class="order-number">${order.order_number}</span>
            <span class="text-grey text-sm"> · ${escHtml(order.customer_name)}</span>
          </div>
          <div class="order-meta">
            <span>🪑 ${escHtml(order.table_name)}</span>
            <span>⏱ ${elapsed}</span>
          </div>
        </div>
        <div class="order-card-body">
          ${order.items.map(item => `
            <div class="order-item-row">
              <div class="order-item-info">
                <span class="order-item-qty">${item.quantity}×</span>
                <div>
                  <div class="order-item-name">${escHtml(item.item_name)}</div>
                  ${item.notes ? `<div class="order-item-note">📝 ${escHtml(item.notes)}</div>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-8">
                <span class="status-badge status-${item.status}">${getStatusIcon(item.status)} ${item.status}</span>
                ${getNextStatusButton(order.id, item)}
              </div>
            </div>
          `).join('')}
          ${order.notes ? `<div class="text-sm text-grey mt-8" style="padding:8px 0; border-top:1px solid var(--grey-100);">📝 ${escHtml(order.notes)}</div>` : ''}
        </div>
        <div class="order-card-footer">
          ${hasPending ? `<button class="btn btn-warning btn-sm" onclick="markAllStatus(${order.id}, 'preparing')">🔵 Start All</button>` : ''}
          ${hasPreparing ? `<button class="btn btn-success btn-sm" onclick="markAllStatus(${order.id}, 'ready')">🟢 All Ready</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="markAllStatus(${order.id}, 'served')">✅ All Served</button>
        </div>
      </div>`;
  }).join('');
}

function getNextStatusButton(orderId, item) {
  const next = {
    'pending': { label: 'Start', status: 'preparing', cls: 'btn-warning' },
    'preparing': { label: 'Ready', status: 'ready', cls: 'btn-success' },
    'ready': { label: 'Served', status: 'served', cls: 'btn-secondary' }
  };

  const n = next[item.status];
  if (!n) return '';

  return `<button class="btn ${n.cls} btn-sm" onclick="updateItemStatus(${orderId}, ${item.id}, '${n.status}')" style="min-width:70px;">${n.label}</button>`;
}

// ===========================
// Status Updates
// ===========================
async function updateItemStatus(orderId, itemId, status) {
  try {
    await fetch(`/api/orders/${orderId}/items/${itemId}/status`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadOrders();
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

async function markAllStatus(orderId, status) {
  try {
    await fetch(`/api/orders/${orderId}/status-all`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadOrders();
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

// ===========================
// Filters
// ===========================
function filterOrders(filter) {
  currentFilter = filter;
  document.querySelectorAll('#kitchenFilters .chip').forEach(c => c.classList.remove('active'));
  document.querySelector(`#kitchenFilters .chip[data-filter="${filter}"]`).classList.add('active');
  renderOrders();
}

// ===========================
// Sound
// ===========================
function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('soundBtn').textContent = soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF';
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    oscillator.start();
    setTimeout(() => {
      oscillator.frequency.value = 1000;
    }, 150);
    setTimeout(() => {
      oscillator.frequency.value = 1200;
    }, 300);
    setTimeout(() => {
      oscillator.stop();
      ctx.close();
    }, 450);
  } catch (e) {
    // Audio not supported
  }
}

// ===========================
// Waiter Alert
// ===========================
function showWaiterAlert(data) {
  const container = document.getElementById('waiterAlerts');
  const alert = document.createElement('div');
  alert.className = 'waiter-alert';
  alert.innerHTML = `🔔 Waiter called at <strong>${data.tableName || 'Table ' + data.tableId}</strong>!`;
  container.appendChild(alert);
  setTimeout(() => alert.remove(), 10000);
}

// ===========================
// Helpers
// ===========================
function getStatusIcon(status) {
  const icons = { pending: '🟡', preparing: '🔵', ready: '🟢', served: '✅', cancelled: '❌' };
  return icons[status] || '⚪';
}

function getElapsedTime(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
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
