
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
const chatSearchInput = document.getElementById('chat-search-input');
const newFolderBtn = document.getElementById('new-folder-btn');

let currentChatId = null;
let allChats = [];
let folders = [];
let searchQuery = '';
let searchResults = [];
let searchDebounce = null;
const collapsedFolders = new Set();
let chatsSectionCollapsed = false;
let foldersSectionCollapsed = false;


async function loadChats() {
  const [chatsRes, foldersRes] = await Promise.all([
    api('/api/chats'),
    api('/api/folders'),
  ]);
  const data = await chatsRes.json();
  allChats = data.chats;
  folders = await foldersRes.json();
  refreshSidebar();
  return allChats;
}

function refreshSidebar() {
  if (searchQuery) {
    renderSearchResults();
  } else {
    renderChatList(allChats);
  }
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

function renderChatItem(chat) {
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

  if (folders.length) {
    const availableFolders = folders.filter((f) => f.id !== chat.folder_id);
    const showMove = availableFolders.length > 0;
    const showRemove = !!chat.folder_id;

    if (showMove || showRemove) {
      const divider = document.createElement('div');
      divider.className = 'menu-divider';
      dropdown.appendChild(divider);
    }

    if (showMove) {
      const moveOption = document.createElement('button');
      moveOption.type = 'button';
      moveOption.className = 'menu-option';
      moveOption.textContent = 'Move to folder';
      moveOption.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllMenus();

        // Skip the picker when there's only one place it could go.
        if (availableFolders.length === 1) {
          await moveChatToFolder(chat.id, availableFolders[0].id);
          return;
        }

        const folderId = await showFolderPickerModal(availableFolders);
        if (folderId != null) await moveChatToFolder(chat.id, folderId);
      });
      dropdown.appendChild(moveOption);
    }

    if (showRemove) {
      const removeOption = document.createElement('button');
      removeOption.type = 'button';
      removeOption.className = 'menu-option';
      removeOption.textContent = 'Remove from folder';
      removeOption.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllMenus();
        moveChatToFolder(chat.id, null);
      });
      dropdown.appendChild(removeOption);
    }
  }

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
  return item;
}

async function moveChatToFolder(chatId, folderId) {
  await api(`/api/chats/${chatId}/folder`, {
    method: 'PUT',
    body: JSON.stringify({ folder_id: folderId }),
  });
  await loadChats();
}

function renderFolderSection(folder, chatsInFolder) {
  const section = document.createElement('div');
  section.className = 'folder-section';

  const collapsed = collapsedFolders.has(folder.id);

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.addEventListener('click', () => {
    if (collapsed) collapsedFolders.delete(folder.id);
    else collapsedFolders.add(folder.id);
    renderChatList(allChats);
  });

  const toggle = document.createElement('span');
  toggle.className = 'folder-toggle';
  toggle.textContent = collapsed ? '▸' : '▾';
  header.appendChild(toggle);

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name;
  header.appendChild(name);

  const count = document.createElement('span');
  count.className = 'folder-count';
  count.textContent = chatsInFolder.length;
  header.appendChild(count);

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
  renameBtn.textContent = 'Rename folder';
  renameBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeAllMenus();
    await renameFolder(folder);
  });
  dropdown.appendChild(renameBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'menu-option danger';
  deleteBtn.textContent = 'Delete folder';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeAllMenus();
    await deleteFolder(folder);
  });
  dropdown.appendChild(deleteBtn);

  menu.appendChild(dropdown);
  header.appendChild(menu);
  section.appendChild(header);

  if (!collapsed) {
    const items = document.createElement('div');
    items.className = 'folder-items';
    chatsInFolder.forEach((chat) => items.appendChild(renderChatItem(chat)));
    section.appendChild(items);
  }

  return section;
}

function renderChatList(chats) {
  chatListEl.innerHTML = '';

  const chatsByFolder = new Map();
  const unfiled = [];
  chats.forEach((chat) => {
    if (chat.folder_id) {
      if (!chatsByFolder.has(chat.folder_id)) chatsByFolder.set(chat.folder_id, []);
      chatsByFolder.get(chat.folder_id).push(chat);
    } else {
      unfiled.push(chat);
    }
  });

  if (folders.length) {
    const foldersHeader = document.createElement('div');
    foldersHeader.className = 'sidebar-section-header';
    foldersHeader.addEventListener('click', () => {
      foldersSectionCollapsed = !foldersSectionCollapsed;
      renderChatList(allChats);
    });

    const foldersToggle = document.createElement('span');
    foldersToggle.className = 'folder-toggle';
    foldersToggle.textContent = foldersSectionCollapsed ? '▸' : '▾';
    foldersHeader.appendChild(foldersToggle);

    const foldersTitle = document.createElement('span');
    foldersTitle.className = 'sidebar-section-title';
    foldersTitle.textContent = 'Folders';
    foldersHeader.appendChild(foldersTitle);

    const foldersCount = document.createElement('span');
    foldersCount.className = 'folder-count';
    foldersCount.textContent = folders.length;
    foldersHeader.appendChild(foldersCount);

    chatListEl.appendChild(foldersHeader);

    if (!foldersSectionCollapsed) {
      folders.forEach((folder) => {
        chatListEl.appendChild(renderFolderSection(folder, chatsByFolder.get(folder.id) || []));
      });
    }
  }

  // A chat filed into a folder only shows there — this section is just the unfiled leftovers.
  const chatsHeader = document.createElement('div');
  chatsHeader.className = 'sidebar-section-header';
  chatsHeader.addEventListener('click', () => {
    chatsSectionCollapsed = !chatsSectionCollapsed;
    renderChatList(allChats);
  });

  const chatsToggle = document.createElement('span');
  chatsToggle.className = 'folder-toggle';
  chatsToggle.textContent = chatsSectionCollapsed ? '▸' : '▾';
  chatsHeader.appendChild(chatsToggle);

  const chatsTitle = document.createElement('span');
  chatsTitle.className = 'sidebar-section-title';
  chatsTitle.textContent = 'Chats';
  chatsHeader.appendChild(chatsTitle);

  const chatsCount = document.createElement('span');
  chatsCount.className = 'folder-count';
  chatsCount.textContent = unfiled.length;
  chatsHeader.appendChild(chatsCount);

  chatListEl.appendChild(chatsHeader);

  if (!chatsSectionCollapsed) {
    unfiled.forEach((chat) => chatListEl.appendChild(renderChatItem(chat)));
  }
}

function renderSearchResults() {
  chatListEl.innerHTML = '';

  if (!searchResults.length) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = 'No matching chats.';
    chatListEl.appendChild(empty);
    return;
  }

  searchResults.forEach((result) => {
    const item = document.createElement('div');
    item.className = 'chat-item' + (result.id === currentChatId ? ' active' : '');
    item.dataset.id = result.id;

    const main = document.createElement('div');
    main.className = 'chat-item-main';

    const label = document.createElement('span');
    label.className = 'chat-item-title';
    label.textContent = result.title || 'Untitled chat';
    main.appendChild(label);

    if (result.snippet) {
      const snippet = document.createElement('span');
      snippet.className = 'chat-item-snippet';
      snippet.textContent = result.snippet;
      main.appendChild(snippet);
    }

    item.appendChild(main);
    item.addEventListener('click', () => {
      clearSearch();
      openChat(result.id, result.title);
    });
    chatListEl.appendChild(item);
  });
}

function clearSearch() {
  searchQuery = '';
  searchResults = [];
  chatSearchInput.value = '';
  refreshSidebar();
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

function showTextPromptModal({ title, label, placeholder = '', initialValue = '', confirmLabel = 'Save' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const heading = document.createElement('h2');
    heading.textContent = title;
    dialog.appendChild(heading);

    const labelEl = document.createElement('label');
    labelEl.className = 'modal-label';
    labelEl.textContent = label;
    labelEl.htmlFor = 'text-prompt-input';
    dialog.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'text-prompt-input';
    input.className = 'modal-input';
    input.autocomplete = 'off';
    input.placeholder = placeholder;
    input.value = initialValue;
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
    confirmBtn.className = 'modal-confirm-btn';
    confirmBtn.textContent = confirmLabel;
    actions.appendChild(confirmBtn);

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    input.focus();
    input.select();

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') close(null);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); close(input.value.trim() || null); }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKeydown);
    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => close(input.value.trim() || null));
  });
}

function showConfirmModal({ title, body, confirmLabel = 'Confirm' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const heading = document.createElement('h2');
    heading.textContent = title;
    dialog.appendChild(heading);

    const bodyEl = document.createElement('p');
    bodyEl.className = 'modal-body';
    bodyEl.textContent = body;
    dialog.appendChild(bodyEl);

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
    confirmBtn.textContent = confirmLabel;
    actions.appendChild(confirmBtn);

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') close(false);
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKeydown);
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
  });
}

function showFolderPickerModal(folderOptions) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const heading = document.createElement('h2');
    heading.textContent = 'Move to folder';
    dialog.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'folder-picker-list';
    folderOptions.forEach((folder) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'folder-picker-option';
      option.textContent = folder.name;
      option.addEventListener('click', () => close(folder.id));
      list.appendChild(option);
    });
    dialog.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost-btn small';
    cancelBtn.textContent = 'Cancel';
    actions.appendChild(cancelBtn);

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') close(null);
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKeydown);
    cancelBtn.addEventListener('click', () => close(null));
  });
}

async function createFolder() {
  const name = await showTextPromptModal({
    title: 'New folder',
    label: 'Folder name',
    placeholder: 'e.g. Work',
    confirmLabel: 'Create',
  });
  if (!name) return;

  await api('/api/folders', { method: 'POST', body: JSON.stringify({ name }) });
  await loadChats();
}

async function renameFolder(folder) {
  const name = await showTextPromptModal({
    title: 'Rename folder',
    label: 'Folder name',
    initialValue: folder.name,
    confirmLabel: 'Save',
  });
  if (!name || name === folder.name) return;

  await api(`/api/folders/${folder.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
  await loadChats();
}

async function deleteFolder(folder) {
  const confirmed = await showConfirmModal({
    title: 'Delete folder',
    body: `This will delete "${folder.name}". Chats inside it will move back to the unfiled list.`,
    confirmLabel: 'Delete folder',
  });
  if (!confirmed) return;

  await api(`/api/folders/${folder.id}`, { method: 'DELETE' });
  await loadChats();
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
newFolderBtn.addEventListener('click', createFolder);

chatSearchInput.addEventListener('input', () => {
  searchQuery = chatSearchInput.value.trim();
  clearTimeout(searchDebounce);

  if (!searchQuery) {
    searchResults = [];
    refreshSidebar();
    return;
  }

  searchDebounce = setTimeout(async () => {
    const res = await api(`/api/chats/search?q=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();
    searchResults = data.results;
    refreshSidebar();
  }, 250);
});


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