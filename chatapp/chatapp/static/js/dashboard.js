// static/js/dashboard.js
// Admin-only user management: list, create, edit, delete users.

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

const createForm = document.getElementById('create-user-form');
const createStatus = document.getElementById('create-user-status');
const tableBody = document.getElementById('user-table-body');

async function loadUsers() {
  const res = await api('/api/users');
  const users = await res.json();
  renderUsers(users);
}

function renderUsers(users) {
  tableBody.innerHTML = '';
  users.forEach((user) => {
    const row = document.createElement('tr');

    const emailCell = document.createElement('td');
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.value = user.email;
    emailInput.className = 'row-email';
    emailInput.disabled = true;
    emailCell.appendChild(emailInput);
    row.appendChild(emailCell);

    const adminCell = document.createElement('td');
    const adminCheckbox = document.createElement('input');
    adminCheckbox.type = 'checkbox';
    adminCheckbox.checked = user.is_admin;
    adminCheckbox.className = 'row-admin';
    adminCheckbox.disabled = true;
    adminCell.appendChild(adminCheckbox);
    row.appendChild(adminCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'user-row-actions';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'New password (optional)';
    passwordInput.className = 'row-password';
    passwordInput.disabled = true;
    actionsCell.appendChild(passwordInput);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.className = 'ghost-btn small';
    editBtn.addEventListener('click', () => {
      if (editBtn.textContent === 'Edit') {
        emailInput.disabled = false;
        passwordInput.disabled = false;
        adminCheckbox.disabled = false;
        emailInput.focus();
        editBtn.textContent = 'Save';
      } else {
        saveUser(user.id, row);
      }
    });
    actionsCell.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'ghost-btn small danger';
    deleteBtn.addEventListener('click', () => deleteUser(user.id, user.email));
    actionsCell.appendChild(deleteBtn);

    row.appendChild(actionsCell);
    tableBody.appendChild(row);
  });
}

async function saveUser(id, row) {
  const email = row.querySelector('.row-email').value.trim();
  const isAdmin = row.querySelector('.row-admin').checked;
  const password = row.querySelector('.row-password').value;

  const payload = { email, is_admin: isAdmin };
  if (password) payload.password = password;

  const res = await api(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to update user.');
    return;
  }
  loadUsers();
}

async function deleteUser(id, email) {
  if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;

  const res = await api(`/api/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to delete user.');
    return;
  }
  loadUsers();
}

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const isAdmin = document.getElementById('new-is-admin').checked;

  createStatus.textContent = 'Creating…';
  try {
    const res = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, is_admin: isAdmin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user.');

    createStatus.textContent = `Created ${data.email}.`;
    createForm.reset();
    loadUsers();
  } catch (err) {
    createStatus.textContent = err.message;
  }
});

loadUsers();
