function setMessage(text, type = '') {
  const msg = document.getElementById('msg');
  msg.className = `notice${type ? ` ${type}` : ''}`;
  msg.textContent = text;
}

async function request(path, options) {
  const res = await fetch(path, options);
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
    <td>${item.uploaded ? 'ready' : 'pending'}</td>
    <td>${new Date(item.createdAt).toLocaleString()}</td>
    <td>${new Date(item.expiresAt).toLocaleString()}</td>
    <td><a href="${item.url}" target="_blank" rel="noopener">open</a></td>
    <td class="row">
      <button data-role="save">Save</button>
      <button class="secondary" data-role="delete">Delete</button>
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
      setMessage(`Saved #${item.id}`, 'success');
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  tr.querySelector('[data-role="delete"]').addEventListener('click', async () => {
    if (!window.confirm(`Delete media #${item.id}?`)) return;
    try {
      await request(`/api/media/${item.id}`, { method: 'DELETE' });
      tr.remove();
      setMessage(`Deleted #${item.id}`, 'success');
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  return tr;
}

async function loadMedia() {
  const rows = document.getElementById('rows');
  rows.innerHTML = '';
  setMessage('Loading media...');
  try {
    const data = await request('/api/media');
    for (const item of data.items) rows.appendChild(rowTemplate(item));
    setMessage(`Loaded ${data.items.length} media item(s).`);
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshBtn').addEventListener('click', loadMedia);
  loadMedia();
});
