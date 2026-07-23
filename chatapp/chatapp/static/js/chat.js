// static/js/chat.js
// Talks to the Flask JSON API using session-cookie auth (sent automatically by the browser).
// Handles: chat list, new/select/delete chat, sending messages (streamed), admin document panel,
// and the Ollama connection status indicator.

const authHeaders = () => ({
  'Content-Type': 'application/json',
});

// Wraps fetch: on 401 (expired/invalid session), boot back to login.
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

// ---------- Elements ----------
const chatListEl = document.getElementById('chat-list');
const messagesEl = document.getElementById('messages');
const emptyStateEl = document.getElementById('empty-state');
const chatTitleEl = document.getElementById('chat-title');
const composerForm = document.getElementById('composer');
const composerInput = document.getElementById('composer-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const logoutBtn = document.getElementById('logout-btn');
const statusDot = document.getElementById('ollama-dot');
const statusText = document.getElementById('ollama-status-text');

let currentChatId = null;

// ---------- Chat list ----------

async function loadChats() {
  const res = await api('/api/chats');
  const chats = await res.json();
  renderChatList(chats);
  return chats;
}

function renderChatList(chats) {
  chatListEl.innerHTML = '';
  chats.forEach((chat) => {
    const item = document.createElement('div');
    item.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
    item.dataset.id = chat.id;

    const label = document.createElement('span');
    label.textContent = chat.title || 'Untitled chat';
    item.appendChild(label);

    const del = document.createElement('span');
    del.className = 'delete-x';
    del.textContent = '×';
    del.title = 'Delete chat';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });
    item.appendChild(del);

    item.addEventListener('click', () => openChat(chat.id, chat.title));
    chatListEl.appendChild(item);
  });
}

async function createChat() {
  const res = await api('/api/chats', { method: 'POST' });
  const chat = await res.json();
  await loadChats();
  openChat(chat.id, chat.title);
}

async function deleteChat(chatId) {
  await api(`/api/chats/${chatId}`, { method: 'DELETE' });
  if (chatId === currentChatId) {
    currentChatId = null;
    messagesEl.innerHTML = '';
    chatTitleEl.textContent = 'New chat';
  }
  await loadChats();
}

async function openChat(chatId, title) {
  currentChatId = chatId;
  chatTitleEl.textContent = title || 'Untitled chat';
  document.querySelectorAll('.chat-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.id) === chatId);
  });

  const res = await api(`/api/chats/${chatId}/messages`);
  const messages = await res.json();
  messagesEl.innerHTML = '';
  messages.forEach((m) => appendMessage(m.role, m.content, m.sources));
  scrollToBottom();
}

// ---------- Messages ----------

function appendMessage(role, content, sources) {
  emptyStateEl.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = content;
  wrap.appendChild(bubble);

  if (sources && sources.length) {
    const src = document.createElement('div');
    src.className = 'msg-sources';
    src.textContent = 'Sources: ' + sources.join(', ');
    wrap.appendChild(src);
  }

  messagesEl.appendChild(wrap);
  return wrap;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = composerInput.value.trim();
  if (!text) return;

  // Create a chat on first message if none is selected yet.
  if (!currentChatId) {
    const res = await api('/api/chats', { method: 'POST' });
    const chat = await res.json();
    currentChatId = chat.id;
    await loadChats();
    chatTitleEl.textContent = chat.title || 'New chat';
  }

  appendMessage('user', text);
  composerInput.value = '';
  autoGrow();
  scrollToBottom();

  sendBtn.disabled = true;
  const pending = appendMessage('assistant', 'Thinking…');
  pending.classList.add('pending');
  scrollToBottom();

  try {
    const res = await fetch(`/api/chats/${currentChatId}/messages/stream`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: text }),
    });

    pending.remove();
    const bubble = appendMessage('assistant', '');
    const bubbleEl = bubble.querySelector('.msg-bubble');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      bubbleEl.textContent = fullText;
      scrollToBottom();
    }
  } catch (err) {
    pending.querySelector('.msg-bubble').textContent = 'Something went wrong. Try again.';
    pending.classList.remove('pending');
  } finally {
    sendBtn.disabled = false;
    scrollToBottom();
    // Refresh the sidebar in case the backend auto-titled a new chat.
    loadChats();
  }
});

// Textarea auto-grow + Enter-to-send (Shift+Enter for newline)
function autoGrow() {
  composerInput.style.height = 'auto';
  composerInput.style.height = composerInput.scrollHeight + 'px';
}
composerInput.addEventListener('input', autoGrow);
composerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composerForm.requestSubmit();
  }
});

newChatBtn.addEventListener('click', createChat);

logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ---------- Ollama status ----------

async function checkStatus() {
  try {
    const res = await api('/api/status');
    const data = await res.json();
    if (data.connected) {
      statusDot.className = 'status-dot online';
      statusText.textContent = `Connected · ${data.model || 'model ready'}`;
    } else {
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'Model unavailable';
    }
  } catch {
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Model unavailable';
  }
}

// ---------- Admin documents panel ----------

const docsToggleBtn = document.getElementById('docs-toggle-btn');
const docsPanel = document.getElementById('docs-panel');
const docsCloseBtn = document.getElementById('docs-close-btn');
const uploadForm = document.getElementById('upload-form');
const uploadStatus = document.getElementById('upload-status');
const docListEl = document.getElementById('doc-list');

if (docsToggleBtn) {
  docsToggleBtn.addEventListener('click', () => {
    docsPanel.hidden = false;
    loadDocs();
  });
  docsCloseBtn.addEventListener('click', () => { docsPanel.hidden = true; });

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('doc-file');
    if (!fileInput.files.length) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    uploadStatus.textContent = 'Uploading…';
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData, // no Content-Type: browser sets multipart boundary; session cookie sent automatically
      });
      if (!res.ok) throw new Error('Upload failed.');
      uploadStatus.textContent = 'Uploaded.';
      fileInput.value = '';
      loadDocs();
    } catch (err) {
      uploadStatus.textContent = err.message;
    }
  });

  async function loadDocs() {
    const res = await api('/api/documents');
    const docs = await res.json();
    docListEl.innerHTML = '';
    docs.forEach((doc) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = doc.filename;
      li.appendChild(name);

      const remove = document.createElement('span');
      remove.className = 'remove-doc';
      remove.textContent = '×';
      remove.title = 'Remove';
      remove.addEventListener('click', async () => {
        await api(`/api/documents/${doc.id}`, { method: 'DELETE' });
        loadDocs();
      });
      li.appendChild(remove);
      docListEl.appendChild(li);
    });
  }
}

// ---------- Init ----------

(async function init() {
  await loadChats();
  checkStatus();
  setInterval(checkStatus, 15000);
})();