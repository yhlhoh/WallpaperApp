async function readQuota() {
  const res = await fetch('/api/stats/upload-limit');
  if (!res.ok) throw new Error(window.I18N.t('upload.readQuotaError'));
  return res.json();
}

let csrfToken = '';

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!res.ok) throw new Error(window.I18N.t('upload.csrfError'));
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

function setNotice(el, text, type = '') {
  el.className = `notice${type ? ` ${type}` : ''}`;
  el.textContent = text;
}

function setPlayUrl() {
  const playUrl = document.getElementById('playUrl');
  const lang = window.I18N.getLocale();
  const href = `/play?lang=${encodeURIComponent(lang)}`;
  playUrl.textContent = `${window.location.origin}${href}`;
  playUrl.href = href;
}

function createGalleryCard(item) {
  const card = document.createElement('article');
  card.className = 'gallery-item';
  const media =
    item.type === 'video'
      ? `<video class="gallery-media" src="${item.url}" muted playsinline preload="metadata"></video>`
      : `<img class="gallery-media" src="${item.url}" alt="" loading="lazy">`;

  card.innerHTML = `
    ${media}
    <div class="gallery-meta">
      <div>#${item.id} · ${item.type === 'video' ? window.I18N.t('upload.galleryTypeVideo') : window.I18N.t('upload.galleryTypeImage')}</div>
      <div>${window.I18N.t('upload.galleryDuration', { seconds: item.durationSeconds })}</div>
    </div>
  `;
  return card;
}

async function refreshGallery() {
  const gallery = document.getElementById('gallery');
  const msg = document.getElementById('galleryMsg');
  setNotice(msg, window.I18N.t('upload.galleryLoading'));
  gallery.innerHTML = '';
  try {
    const res = await fetch('/api/playlist');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || window.I18N.t('upload.galleryLoadError'));
    const activeItems = data.items || [];
    if (activeItems.length === 0) {
      setNotice(msg, window.I18N.t('upload.galleryEmpty'));
      return;
    }
    activeItems.forEach((item) => gallery.appendChild(createGalleryCard(item)));
    setNotice(msg, window.I18N.t('upload.galleryLoaded', { count: activeItems.length }));
  } catch (error) {
    setNotice(msg, error.message, 'error');
  }
}

async function refreshQuota() {
  const quotaInfo = document.getElementById('quotaInfo');
  try {
    const quota = await readQuota();
    const reset = new Date(quota.resetAt).toLocaleString();
    setNotice(quotaInfo, window.I18N.t('upload.quotaText', {
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining,
      reset,
    }));
  } catch (error) {
    setNotice(quotaInfo, error.message, 'error');
  }
}

async function uploadFlow(file, durationSeconds) {
  const token = await ensureCsrfToken();
  const createRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': token,
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      durationSeconds,
    }),
  });

  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(createData.error || window.I18N.t('upload.createUploadUrlError'));

  const uploadRes = await fetch(createData.uploadUrl, {
    method: 'PUT',
    headers: createData.headers,
    body: file,
  });

  if (!uploadRes.ok) throw new Error(window.I18N.t('upload.s3UploadError', { status: uploadRes.status }));

  const confirmRes = await fetch(`/api/media/${createData.mediaId}/confirm`, {
    method: 'POST',
    headers: { 'x-csrf-token': token },
  });
  if (!confirmRes.ok) throw new Error(window.I18N.t('upload.confirmError'));
}

window.addEventListener('DOMContentLoaded', () => {
  window.I18N.applyTranslations(document);
  window.I18N.bindLanguageSwitcher('langSelect', () => {
    refreshQuota();
    refreshGallery();
    setPlayUrl();
  });
  const form = document.getElementById('uploadForm');
  const result = document.getElementById('uploadResult');
  setPlayUrl();

  document.getElementById('refreshQuota').addEventListener('click', refreshQuota);
  document.getElementById('refreshGallery').addEventListener('click', refreshGallery);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = document.getElementById('file').files[0];
    const duration = Number(document.getElementById('duration').value);
    if (!file) return setNotice(result, window.I18N.t('upload.selectMediaError'), 'error');

    setNotice(result, window.I18N.t('upload.uploading'));
    try {
      await uploadFlow(file, duration);
      setNotice(result, window.I18N.t('upload.uploadDone'), 'success');
      form.reset();
      document.getElementById('duration').value = '20';
      await refreshQuota();
      await refreshGallery();
    } catch (error) {
      setNotice(result, error.message, 'error');
      await refreshQuota();
    }
  });

  refreshQuota();
  refreshGallery();
});
