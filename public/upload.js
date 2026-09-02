async function readQuota() {
  const res = await fetch('/api/stats/upload-limit');
  if (!res.ok) throw new Error('Failed to read quota');
  return res.json();
}

function setNotice(el, text, type = '') {
  el.className = `notice${type ? ` ${type}` : ''}`;
  el.textContent = text;
}

async function refreshQuota() {
  const quotaInfo = document.getElementById('quotaInfo');
  try {
    const quota = await readQuota();
    const reset = new Date(quota.resetAt).toLocaleString();
    setNotice(quotaInfo, `Used ${quota.used}/${quota.limit}. Remaining ${quota.remaining}. Reset at ${reset} (UTC+8 midnight).`);
  } catch (error) {
    setNotice(quotaInfo, error.message, 'error');
  }
}

async function uploadFlow(file, durationSeconds) {
  const createRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      durationSeconds,
    }),
  });

  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(createData.error || 'Failed to create upload URL');

  const uploadRes = await fetch(createData.uploadUrl, {
    method: 'PUT',
    headers: createData.headers,
    body: file,
  });

  if (!uploadRes.ok) throw new Error(`S3 upload failed (${uploadRes.status})`);

  const confirmRes = await fetch(`/api/media/${createData.mediaId}/confirm`, { method: 'POST' });
  if (!confirmRes.ok) throw new Error('Upload stored but failed to confirm media');
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('uploadForm');
  const result = document.getElementById('uploadResult');
  const playUrl = document.getElementById('playUrl');
  playUrl.textContent = `${window.location.origin}/play`;
  playUrl.href = '/play';

  document.getElementById('refreshQuota').addEventListener('click', refreshQuota);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = document.getElementById('file').files[0];
    const duration = Number(document.getElementById('duration').value);
    if (!file) return setNotice(result, 'Please select a media file.', 'error');

    setNotice(result, 'Uploading...');
    try {
      await uploadFlow(file, duration);
      setNotice(result, 'Upload completed and added to playlist.', 'success');
      form.reset();
      document.getElementById('duration').value = '20';
      await refreshQuota();
    } catch (error) {
      setNotice(result, error.message, 'error');
      await refreshQuota();
    }
  });

  refreshQuota();
});
