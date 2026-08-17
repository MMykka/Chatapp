// static/js/settings.js
// Per-user statistics + logout.

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
  return res;
}

const logoutBtn = document.getElementById('logout-btn');

logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

async function loadStats() {
  const res = await api(`/api/users/${window.CURRENT_USER_ID}/stats`);
  const data = await res.json();
  document.getElementById('stat-conversations').textContent = data.total_conversations;
  document.getElementById('stat-tokens').textContent = data.total_tokens_used;
  document.getElementById('stat-avg-tokens').textContent = data.average_tokens_per_message;
}

loadStats();
