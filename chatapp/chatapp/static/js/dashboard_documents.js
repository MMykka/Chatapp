// static/js/dashboard_documents.js
// Admin-only document management: upload, list, delete documents.

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

const uploadForm = document.getElementById('upload-form');
const uploadStatus = document.getElementById('upload-status');
const docListEl = document.getElementById('doc-list');
const fileInput = document.getElementById('doc-file');
const filePickerName = document.getElementById('file-picker-name');

fileInput.addEventListener('change', () => {
  filePickerName.textContent = fileInput.files.length ? fileInput.files[0].name : 'No file selected';
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!fileInput.files.length) return;

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  uploadStatus.textContent = 'Uploading…';
  try {
    const res = await fetch('/api/documents', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed.');
    uploadStatus.textContent = 'Uploaded.';
    fileInput.value = '';
    filePickerName.textContent = 'No file selected';
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

loadDocs();
