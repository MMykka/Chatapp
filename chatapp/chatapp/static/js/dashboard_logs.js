// static/js/dashboard_logs.js
// Admin-only system activity log.

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

const ACTION_LABELS = {
  chat_created: 'Chat created',
  chat_renamed: 'Chat renamed',
  chat_deleted: 'Chat deleted',
  message_sent: 'Message sent',
  user_created: 'User created',
  user_updated: 'User updated',
  user_deleted: 'User deleted',
  document_uploaded: 'Document uploaded',
  document_deleted: 'Document deleted',
};

const logBodyEl = document.getElementById('activity-log-body');

function renderLogs(logs) {
  logBodyEl.innerHTML = '';

  if (!logs.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No activity recorded yet.';
    row.appendChild(cell);
    logBodyEl.appendChild(row);
    return;
  }

  logs.forEach((log) => {
    const row = document.createElement('tr');
    const values = [
      new Date(log.timestamp).toLocaleString(),
      log.actor_email,
      ACTION_LABELS[log.action] || log.action,
      log.details || '—',
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
  const res = await api('/api/admin/logs');
  const logs = await res.json();
  renderLogs(logs);
}

loadLogs();
setInterval(loadLogs, 15000);
