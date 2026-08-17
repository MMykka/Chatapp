
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

const chatListEl = document.getElementById('chat-list');
const messagesScrollEl = document.getElementById('messages-scroll');
const messagesEl = document.getElementById('messages');
const emptyStateEl = document.getElementById('empty-state');
const chatTitleEl = document.getElementById('chat-title');
const composerForm = document.getElementById('composer');
const composerInput = document.getElementById('composer-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const statusDot = document.getElementById('ollama-dot');
const statusText = document.getElementById('ollama-status-text');
const modelNameLabel = document.getElementById('model-name-label');
const exportBtn = document.getElementById('export-btn');
const exportMenu = document.getElementById('export-menu');

let currentChatId = null;


async function loadChats() {
  const res = await api('/api/chats');
  const data = await res.json();
  renderChatList(data.chats);
  return data.chats;
}

function formatChatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderChatList(chats) {
  chatListEl.innerHTML = '';
  chats.forEach((chat) => {
    const item = document.createElement('div');
    item.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
    item.dataset.id = chat.id;

    const main = document.createElement('div');
    main.className = 'chat-item-main';

    const label = document.createElement('span');
    label.className = 'chat-item-title';
    label.textContent = chat.title || 'Untitled chat';
    main.appendChild(label);

    const time = document.createElement('span');
    time.className = 'chat-item-time';
    time.textContent = formatChatTime(chat.updated);
    main.appendChild(time);

    item.appendChild(main);

    const menu = document.createElement('div');
    menu.className = 'chat-item-menu';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'menu-trigger';
    menuBtn.textContent = '⋮';
    menuBtn.title = 'More options';
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(dropdown);
    });
    menu.appendChild(menuBtn);

    const dropdown = document.createElement('div');
    dropdown.className = 'menu-dropdown';
    dropdown.hidden = true;

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'menu-option';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      startInlineRename(label, chat);
    });
    dropdown.appendChild(renameBtn);

    const deleteOption = document.createElement('button');
    deleteOption.type = 'button';
    deleteOption.className = 'menu-option danger';
    deleteOption.textContent = 'Delete';
    deleteOption.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      deleteChat(chat.id, chat.title);
    });
    dropdown.appendChild(deleteOption);

    menu.appendChild(dropdown);
    item.appendChild(menu);

    item.addEventListener('click', () => openChat(chat.id, chat.title));
    chatListEl.appendChild(item);
  });
}

function closeAllMenus() {
  document.querySelectorAll('.menu-dropdown').forEach((d) => { d.hidden = true; });
}

function toggleMenu(dropdown) {
  const wasHidden = dropdown.hidden;
  closeAllMenus();
  dropdown.hidden = !wasHidden;
}

document.addEventListener('click', closeAllMenus);

function startInlineRename(label, chat) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-rename-input';
  input.value = chat.title || '';
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());

  let settled = false;

  const finish = async (save) => {
    if (settled) return;
    settled = true;
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKeydown);

    const trimmed = input.value.trim();
    if (save && trimmed && trimmed !== chat.title) {
      await api(`/api/chats/${chat.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: trimmed }),
      });
      chat.title = trimmed;
      if (chat.id === currentChatId) chatTitleEl.textContent = trimmed;
    }

    label.textContent = chat.title || 'Untitled chat';
    input.replaceWith(label);
  };

  const onKeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  const onBlur = () => finish(true);

  input.addEventListener('keydown', onKeydown);
  input.addEventListener('blur', onBlur);

  label.replaceWith(input);
  input.focus();
  input.select();
}

async function createChat() {
  const res = await api('/api/chats', { method: 'POST' });
  const chat = await res.json();
  await loadChats();
  openChat(chat.id, chat.title);
}

function showDeleteChatModal(title) {
  const expectedName = title || 'Untitled chat';

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const heading = document.createElement('h2');
    heading.textContent = 'Delete chat';
    dialog.appendChild(heading);

    const body = document.createElement('p');
    body.className = 'modal-body';
    body.appendChild(document.createTextNode('This will permanently delete '));
    const strong = document.createElement('strong');
    strong.textContent = expectedName;
    body.appendChild(strong);
    body.appendChild(document.createTextNode(' and all of its messages. Type the chat name below to confirm.'));
    dialog.appendChild(body);

    const label = document.createElement('label');
    label.className = 'modal-label';
    label.textContent = 'Chat name';
    label.htmlFor = 'delete-confirm-input';
    dialog.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'delete-confirm-input';
    input.className = 'modal-input';
    input.autocomplete = 'off';
    input.placeholder = expectedName;
    dialog.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost-btn small';
    cancelBtn.textContent = 'Cancel';
    actions.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'modal-danger-btn';
    confirmBtn.textContent = 'Delete chat';
    confirmBtn.disabled = true;
    actions.appendChild(confirmBtn);

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    input.focus();

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') close(false);
    }

    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value !== expectedName;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmBtn.disabled) close(true);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKeydown);
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => {
      if (!confirmBtn.disabled) close(true);
    });
  });
}

async function deleteChat(chatId, title) {
  const confirmed = await showDeleteChatModal(title);
  if (!confirmed) return;

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

  const res = await api(`/api/chats/${chatId}`);
  const chat = await res.json();
  chatTitleEl.textContent = chat.title || 'Untitled chat';
  messagesEl.innerHTML = '';
  chat.messages.forEach((m) => appendMessage(m.role, m.content, m.sources, m.response_time));
  scrollToBottom();
}


function appendMessage(role, content, sources, responseTime) {
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

  if (responseTime != null) appendTiming(wrap, responseTime);

  messagesEl.appendChild(wrap);
  return wrap;
}

function appendTiming(wrap, seconds) {
  const timing = document.createElement('div');
  timing.className = 'msg-timing';
  timing.textContent = `${seconds.toFixed(1)}s`;
  wrap.appendChild(timing);
}

function createThinkingIndicator() {
  const el = document.createElement('span');
  el.className = 'thinking-line';

  const dot = document.createElement('span');
  dot.className = 'thinking-dot';
  dot.textContent = '●';
  el.appendChild(dot);

  const label = document.createElement('span');
  label.className = 'thinking-label';
  label.textContent = 'Thinking…';
  el.appendChild(label);

  const count = document.createElement('span');
  count.className = 'thinking-count';
  el.appendChild(count);

  return {
    el,
    update(tokens) {
      count.textContent = tokens > 0 ? ` · ${tokens} token${tokens === 1 ? '' : 's'}` : '';
    },
  };
}

function scrollToBottom() {
  messagesScrollEl.scrollTop = messagesScrollEl.scrollHeight;
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

  const pending = appendMessage('assistant', '');
  pending.classList.add('pending');
  const pendingBubbleEl = pending.querySelector('.msg-bubble');
  const thinking = createThinkingIndicator();
  pending.appendChild(thinking.el);
  scrollToBottom();

  try {
    const res = await fetch(`/api/chats/${currentChatId}/messages/stream`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: text }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalPayload = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; the last split part may be
      // a still-incomplete frame, so keep it in the buffer for next time.
      const frames = buffer.split('\n\n');
      buffer = frames.pop();

      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith('data:')) continue;

        let payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }

        if (payload.cumulative_text) {
          pending.classList.remove('pending');
          pendingBubbleEl.textContent = payload.cumulative_text;
        }
        thinking.update(payload.tokens_so_far);
        scrollToBottom();

        if (payload.done) finalPayload = payload;
      }
    }

    pending.remove();
    appendMessage(
      'assistant',
      finalPayload ? finalPayload.cumulative_text : '',
      finalPayload ? finalPayload.sources : [],
      finalPayload ? finalPayload.response_time : null
    );
  } catch (err) {
    pendingBubbleEl.textContent = 'Something went wrong. Try again.';
    pending.classList.remove('pending');
  } finally {
    sendBtn.disabled = false;
    scrollToBottom();
    // Refresh the sidebar in case the backend auto-titled a new chat.
    loadChats();
  }
});

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


async function checkStatus() {
  try {
    const res = await api('/api/status');
    const data = await res.json();
    modelNameLabel.textContent = data.model || 'No model loaded';
    if (data.connected) {
      statusDot.className = 'status-dot online';
      statusText.textContent = 'Active';
    } else {
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'Inactive';
    }
  } catch {
    modelNameLabel.textContent = 'Unknown';
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Inactive';
  }
}

exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!currentChatId) return;
  toggleMenu(exportMenu);
});

exportMenu.querySelectorAll('[data-format]').forEach((btn) => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeAllMenus();
    if (!currentChatId) return;
    await downloadExport(currentChatId, btn.dataset.format);
  });
});

async function downloadExport(chatId, format) {
  const res = await api(`/api/chats/${chatId}/export?format=${format}`);
  if (!res.ok) return;

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `chat.${format === 'json' ? 'json' : 'md'}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

(async function init() {
  await loadChats();
  checkStatus();
  setInterval(checkStatus, 15000);
})();