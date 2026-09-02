require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION;
const DAILY_UPLOAD_LIMIT = Number(process.env.DAILY_UPLOAD_LIMIT || 5);
const MEDIA_RETENTION_DAYS = Number(process.env.MEDIA_RETENTION_DAYS || 30);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 250 * 1024 * 1024);
const DEFAULT_DURATION_SECONDS = Number(process.env.DEFAULT_DURATION_SECONDS || 20);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SID_COOKIE = 'wallpaper_sid';

if (!BUCKET || !REGION) {
  console.warn('S3_BUCKET and S3_REGION should be configured for uploads to work.');
}

const s3 = new S3Client({ region: REGION });
const db = new Database(path.join(__dirname, 'data', 'app.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  s3_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  duration_seconds INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  uploaded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_limits (
  session_id TEXT NOT NULL,
  date_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, date_key)
);
`);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/assets', express.static(path.join(__dirname, 'public')));

function getDateKeyUtcPlus8(date = new Date()) {
  const plus8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return plus8.toISOString().slice(0, 10);
}

function getNextResetUtcPlus8Iso() {
  const now = new Date();
  const plus8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  plus8.setUTCHours(24, 0, 0, 0);
  return new Date(plus8.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

function ensureSession(req, res, next) {
  let sid = req.cookies[SID_COOKIE];
  if (!sid) {
    sid = randomUUID();
    res.cookie(SID_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }
  req.sessionId = sid;
  next();
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const token = req.get('x-admin-token') || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized admin token' });
  }
  return next();
}

function encodeKeyForUrl(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function publicMediaUrl(key) {
  const base = process.env.PUBLIC_MEDIA_BASE_URL || `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
  return `${base.replace(/\/$/, '')}/${encodeKeyForUrl(key)}`;
}

async function cleanupExpiredMedia() {
  const candidates = db.prepare(
    `SELECT id, s3_key
     FROM media
     WHERE pinned = 0
       AND datetime(created_at, '+' || ? || ' days') <= datetime('now')`
  ).all(MEDIA_RETENTION_DAYS);

  if (candidates.length === 0) return;

  const deleteRow = db.prepare('DELETE FROM media WHERE id = ?');
  const tx = db.transaction((rows) => {
    for (const row of rows) deleteRow.run(row.id);
  });

  for (const row of candidates) {
    if (BUCKET && REGION) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.s3_key }));
      } catch (error) {
        console.error(`S3 delete failed for ${row.s3_key}:`, error.message);
      }
    }
  }

  tx(candidates);
}

app.get('/', (_req, res) => {
  res.redirect('/play');
});

app.get('/upload', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/admin', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/play', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

app.get('/api/stats/upload-limit', ensureSession, (req, res) => {
  const key = getDateKeyUtcPlus8();
  const row = db.prepare('SELECT count FROM upload_limits WHERE session_id = ? AND date_key = ?').get(req.sessionId, key);
  const used = row ? row.count : 0;
  res.json({
    limit: DAILY_UPLOAD_LIMIT,
    used,
    remaining: Math.max(0, DAILY_UPLOAD_LIMIT - used),
    resetAt: getNextResetUtcPlus8Iso(),
  });
});

app.post('/api/upload-url', ensureSession, async (req, res) => {
  const { filename, mimeType, fileSize, durationSeconds } = req.body || {};
  if (!BUCKET || !REGION) return res.status(500).json({ error: 'S3 is not configured' });
  if (!filename || !mimeType || !Number.isFinite(fileSize)) {
    return res.status(400).json({ error: 'filename, mimeType and fileSize are required' });
  }
  if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: `File size must be between 1 and ${MAX_UPLOAD_BYTES} bytes` });
  }

  const mediaType = mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('image/') ? 'image' : null;
  if (!mediaType) return res.status(400).json({ error: 'Only image/video uploads are supported' });

  const dateKey = getDateKeyUtcPlus8();
  const current = db.prepare('SELECT count FROM upload_limits WHERE session_id = ? AND date_key = ?').get(req.sessionId, dateKey);
  const used = current ? current.count : 0;
  if (used >= DAILY_UPLOAD_LIMIT) {
    return res.status(429).json({ error: 'Daily upload limit reached', resetAt: getNextResetUtcPlus8Iso() });
  }

  db.prepare(
    `INSERT INTO upload_limits (session_id, date_key, count)
     VALUES (?, ?, 1)
     ON CONFLICT(session_id, date_key) DO UPDATE SET count = count + 1`
  ).run(req.sessionId, dateKey);

  const extension = path.extname(filename).toLowerCase().slice(0, 10);
  const objectKey = `uploads/${dateKey}/${randomUUID()}${extension}`;
  const safeDuration = Math.min(1800, Math.max(3, Number(durationSeconds) || DEFAULT_DURATION_SECONDS));

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
    ContentType: mimeType,
    CacheControl: 'public, max-age=31536000, immutable',
  });

  try {
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 });
    const info = db.prepare(
      `INSERT INTO media (s3_key, original_name, media_type, duration_seconds, uploaded)
       VALUES (?, ?, ?, ?, 0)`
    ).run(objectKey, filename, mediaType, safeDuration);

    res.json({
      mediaId: info.lastInsertRowid,
      uploadUrl,
      objectKey,
      headers: { 'Content-Type': mimeType },
    });
  } catch (error) {
    console.error('Presign failed:', error);
    res.status(500).json({ error: 'Could not create upload URL' });
  }
});

app.post('/api/media/:id/confirm', ensureSession, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid media id' });

  const result = db.prepare('UPDATE media SET uploaded = 1 WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Media not found' });

  res.json({ ok: true });
});

app.get('/api/playlist', async (_req, res) => {
  await cleanupExpiredMedia();

  const rows = db.prepare(
    `SELECT id, s3_key, media_type, duration_seconds
     FROM media
     WHERE uploaded = 1
     ORDER BY pinned DESC, created_at DESC`
  ).all();

  const items = rows.map((row) => ({
    id: row.id,
    type: row.media_type,
    durationSeconds: row.duration_seconds,
    url: publicMediaUrl(row.s3_key),
  }));

  res.json({ items });
});

app.get('/api/media', requireAdmin, async (_req, res) => {
  await cleanupExpiredMedia();
  const rows = db.prepare(
    `SELECT id, s3_key, original_name, media_type, duration_seconds, pinned, uploaded, created_at
     FROM media
     ORDER BY pinned DESC, created_at DESC`
  ).all();

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.original_name,
      type: row.media_type,
      durationSeconds: row.duration_seconds,
      pinned: Boolean(row.pinned),
      uploaded: Boolean(row.uploaded),
      createdAt: row.created_at,
      expiresAt: new Date(new Date(row.created_at).getTime() + MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      url: publicMediaUrl(row.s3_key),
    })),
  });
});

app.patch('/api/media/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { durationSeconds, pinned } = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid media id' });

  const updates = [];
  const values = [];

  if (durationSeconds !== undefined) {
    const safeDuration = Math.min(1800, Math.max(3, Number(durationSeconds)));
    if (!Number.isFinite(safeDuration)) return res.status(400).json({ error: 'Invalid durationSeconds' });
    updates.push('duration_seconds = ?');
    values.push(safeDuration);
  }

  if (pinned !== undefined) {
    updates.push('pinned = ?');
    values.push(pinned ? 1 : 0);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid field to update' });

  const result = db.prepare(`UPDATE media SET ${updates.join(', ')} WHERE id = ?`).run(...values, id);
  if (result.changes === 0) return res.status(404).json({ error: 'Media not found' });

  res.json({ ok: true });
});

app.delete('/api/media/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid media id' });

  const row = db.prepare('SELECT s3_key FROM media WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Media not found' });

  db.prepare('DELETE FROM media WHERE id = ?').run(id);

  if (BUCKET && REGION) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.s3_key }));
    } catch (error) {
      console.error(`S3 delete failed for ${row.s3_key}:`, error.message);
    }
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`WallpaperApp listening on http://localhost:${PORT}`);
});
