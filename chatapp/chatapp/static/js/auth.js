// static/js/auth.js
// Handles the login form: posts credentials, stores the JWT, redirects to /chat.

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Logging in…';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.error || 'Incorrect email or password.');
    }

    const data = await res.json();
    // Store the JWT. This is a locally-run internal tool, so localStorage is fine here.
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('is_admin', data.is_admin ? '1' : '0');
    window.location.href = '/chat';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
});
