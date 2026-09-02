function setMessage(text, type = '') {
  const msg = document.getElementById('msg');
  msg.className = `notice${type ? ` ${type}` : ''}`;
  msg.textContent = text;
}

let csrfToken = '';

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!res.ok) throw new Error(window.I18N.t('admin.csrfError'));
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function request(path, options) {
  const opts = options ? { ...options } : {};
  if (opts.method && !['GET', 'HEAD'].includes(opts.method.toUpperCase())) {
    const token = await ensureCsrfToken();
    opts.headers = { ...(opts.headers || {}), 'x-csrf-token': token };
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function rowTemplate(item) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${item.id}</td>
    <td>${item.name}</td>
    <td>${item.type}</td>
    <td><input type="number" min="3" max="1800" value="${item.durationSeconds}" data-role="duration" style="width:80px"></td>
    <td><input type="checkbox" data-role="pinned" ${item.pinned ? 'checked' : ''}></td>
    <td>${item.uploaded ? window.I18N.t('admin.statusReady') : window.I18N.t('admin.statusPending')}</td>
    <td>${new Date(item.createdAt).toLocaleString()}</td>
    <td>${new Date(item.expiresAt).toLocaleString()}</td>
    <td><a href="${item.url}" target="_blank" rel="noopener">${window.I18N.t('admin.previewOpen')}</a></td>
    <td class="row">
      <button data-role="save">${window.I18N.t('admin.saveBtn')}</button>
      <button class="secondary" data-role="delete">${window.I18N.t('admin.deleteBtn')}</button>
    </td>
  `;

  tr.querySelector('[data-role="save"]').addEventListener('click', async () => {
    const durationSeconds = Number(tr.querySelector('[data-role="duration"]').value);
    const pinned = tr.querySelector('[data-role="pinned"]').checked;
    try {
      await request(`/api/media/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds, pinned }),
      });
      setMessage(window.I18N.t('admin.saved', { id: item.id }), 'success');
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  tr.querySelector('[data-role="delete"]').addEventListener('click', async () => {
    if (!window.confirm(window.I18N.t('admin.deleteConfirm', { id: item.id }))) return;
    try {
      await request(`/api/media/${item.id}`, { method: 'DELETE' });
      tr.remove();
      setMessage(window.I18N.t('admin.deleted', { id: item.id }), 'success');
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  return tr;
}

async function loadMedia() {
  const rows = document.getElementById('rows');
  rows.innerHTML = '';
  setMessage(window.I18N.t('admin.loading'));
  try {
    await ensureCsrfToken();
    const data = await request('/api/media');
    for (const item of data.items) rows.appendChild(rowTemplate(item));
    setMessage(window.I18N.t('admin.loaded', { count: data.items.length }));
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.I18N.applyTranslations(document);
  window.I18N.bindLanguageSwitcher('langSelect', loadMedia);
  document.getElementById('refreshBtn').addEventListener('click', loadMedia);
  loadMedia();
});
