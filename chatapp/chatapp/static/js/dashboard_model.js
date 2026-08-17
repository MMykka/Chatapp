// static/js/dashboard_model.js
// Admin-only Ollama model status + recent activity logs.

const authHeaders = () => ({
  'Content-Type': 'application/json',
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired.');
  }
  if (res.status === 403) {
    window.location.href = '/chat';
    throw new Error('Admin access required.');
  }
  return res;
}

const statusValueEl = document.getElementById('model-status-value');
const nameValueEl = document.getElementById('model-name-value');
const logBodyEl = document.getElementById('model-log-body');

async function loadStatus() {
  const res = await api('/api/admin/model');
  const data = await res.json();
  statusValueEl.textContent = data.connected ? 'Active' : 'Inactive';
  nameValueEl.textContent = data.model;
}

function renderLogs(logs) {
  logBodyEl.innerHTML = '';

  if (!logs.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No activity recorded yet.';
    row.appendChild(cell);
    logBodyEl.appendChild(row);
    return;
  }

  logs.forEach((log) => {
    const row = document.createElement('tr');
    const values = [
      new Date(log.timestamp).toLocaleString(),
      log.kind,
      log.status,
      log.duration_ms != null ? `${log.duration_ms} ms` : '—',
      log.error || log.model || '—',
    ];
    values.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      row.appendChild(td);
    });
    logBodyEl.appendChild(row);
  });
}

async function loadLogs() {
  const res = await api('/api/admin/model/logs');
  const logs = await res.json();
  renderLogs(logs);
}

async function refresh() {
  await Promise.all([loadStatus(), loadLogs()]);
}

refresh();
setInterval(refresh, 10000);
