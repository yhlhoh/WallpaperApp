# WallpaperApp

A lightweight wallpaper/video rotation platform with:

- Client-side uploads to Amazon S3 via pre-signed URL
- Per-session (cookie-based) daily upload limits (reset at 00:00 UTC+8)
- Admin media management (pin, duration update, delete)
- Auto-rotating playback URL with fade transition and muted video support
- Retention cleanup for old unpinned uploads (including S3 object deletion)

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment file and configure S3:
   ```bash
   cp .env.example .env
   ```
3. Start server:
   ```bash
   npm start
   ```

Open:
- Upload page: `http://localhost:3000/upload`
- Admin page: `http://localhost:3000/admin`
- Playback page: `http://localhost:3000/play`

## i18n

- Upload/Admin pages include language switcher (English / 简体中文).
- Locale is stored in browser `localStorage` and can also be forced via query parameter, e.g. `?lang=zh-CN`.

## Environment variables

- `S3_BUCKET`: target S3 bucket for uploads
- `S3_REGION`: bucket region
- `PUBLIC_MEDIA_BASE_URL`: public URL prefix for playback assets
- `DAILY_UPLOAD_LIMIT`: max uploads per cookie-session each day (UTC+8)
- `MEDIA_RETENTION_DAYS`: retention for unpinned media before deletion
- `DEFAULT_DURATION_SECONDS`: fallback item display duration
- `MAX_UPLOAD_BYTES`: upload size limit
- `ADMIN_TOKEN`: optional admin gate for `/admin` and admin APIs

## Notes

- Uploaded media is added to playlist after `/api/media/:id/confirm` succeeds.
- Playback page keeps only two active layers and muted video to minimize CPU/GPU/RAM usage.
- Old unpinned media is cleaned up during playlist/admin API reads.
