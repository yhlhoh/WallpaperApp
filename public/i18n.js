(function initI18n() {
  const STORAGE_KEY = 'wallpaperapp.locale';
  const SUPPORTED = ['en', 'zh-CN'];
  const dictionaries = {
    en: {
      common: {
        language: 'Language',
        english: 'English',
        chineseSimplified: '简体中文',
      },
      upload: {
        pageTitle: 'Wallpaper Upload',
        heading: 'Upload Wallpaper / Dynamic Video',
        sectionTitle: 'Upload',
        mediaFileLabel: 'Media File (image/video)',
        durationLabel: 'Display Seconds',
        uploadBtn: 'Upload to S3',
        refreshQuotaBtn: 'Refresh Quota',
        playbackTitle: 'Playback URL',
        playbackTip: 'Open this URL on any screen to auto-play active media with crossfade:',
        playbackNote: 'Videos are played muted automatically. Old unpinned media is auto-deleted by retention policy.',
        quotaText: 'Used {used}/{limit}. Remaining {remaining}. Reset at {reset} (UTC+8 midnight).',
        readQuotaError: 'Failed to read quota',
        csrfError: 'Failed to get CSRF token',
        createUploadUrlError: 'Failed to create upload URL',
        selectMediaError: 'Please select a media file.',
        uploading: 'Uploading...',
        uploadDone: 'Upload completed and added to playlist.',
        confirmError: 'Upload stored but failed to confirm media',
      },
      admin: {
        pageTitle: 'Wallpaper Admin',
        heading: 'Admin Media Manager',
        subHeading: 'Pin media to keep it from retention cleanup. Update duration to tune playback pacing.',
        refreshBtn: 'Refresh',
        colId: 'ID',
        colName: 'Name',
        colType: 'Type',
        colDuration: 'Duration',
        colPinned: 'Pinned',
        colStatus: 'Status',
        colCreated: 'Created',
        colExpires: 'Expires',
        colPreview: 'Preview',
        colActions: 'Actions',
        statusReady: 'ready',
        statusPending: 'pending',
        previewOpen: 'open',
        saveBtn: 'Save',
        deleteBtn: 'Delete',
        deleteConfirm: 'Delete media #{id}?',
        saved: 'Saved #{id}',
        deleted: 'Deleted #{id}',
        loading: 'Loading media...',
        loaded: 'Loaded {count} media item(s).',
        csrfError: 'Failed to get CSRF token',
      },
      play: {
        pageTitle: 'Wallpaper Playback',
        empty: 'No media available yet.',
      },
    },
    'zh-CN': {
      common: {
        language: '语言',
        english: 'English',
        chineseSimplified: '简体中文',
      },
      upload: {
        pageTitle: '壁纸上传',
        heading: '上传壁纸 / 动态视频',
        sectionTitle: '上传',
        mediaFileLabel: '媒体文件（图片/视频）',
        durationLabel: '展示时长（秒）',
        uploadBtn: '上传到 S3',
        refreshQuotaBtn: '刷新配额',
        playbackTitle: '播放地址',
        playbackTip: '在任意屏幕打开此地址，即可自动播放并淡入淡出切换：',
        playbackNote: '视频会自动静音播放。未置顶的旧媒体会按保留策略自动删除。',
        quotaText: '今日已用 {used}/{limit}，剩余 {remaining}。将在 {reset}（UTC+8 零点）重置。',
        readQuotaError: '读取配额失败',
        csrfError: '获取 CSRF Token 失败',
        createUploadUrlError: '创建上传地址失败',
        selectMediaError: '请选择媒体文件。',
        uploading: '上传中...',
        uploadDone: '上传完成，已加入播放列表。',
        confirmError: '上传完成但确认入库失败',
      },
      admin: {
        pageTitle: '壁纸管理',
        heading: '媒体管理后台',
        subHeading: '可将媒体置顶以跳过自动清理；可修改展示时长控制播放节奏。',
        refreshBtn: '刷新',
        colId: 'ID',
        colName: '名称',
        colType: '类型',
        colDuration: '时长',
        colPinned: '置顶',
        colStatus: '状态',
        colCreated: '创建时间',
        colExpires: '过期时间',
        colPreview: '预览',
        colActions: '操作',
        statusReady: '可用',
        statusPending: '待确认',
        previewOpen: '打开',
        saveBtn: '保存',
        deleteBtn: '删除',
        deleteConfirm: '确定删除媒体 #{id} 吗？',
        saved: '已保存 #{id}',
        deleted: '已删除 #{id}',
        loading: '正在加载媒体...',
        loaded: '已加载 {count} 条媒体。',
        csrfError: '获取 CSRF Token 失败',
      },
      play: {
        pageTitle: '壁纸播放',
        empty: '暂无可播放媒体。',
      },
    },
  };

  function normalizeLocale(locale) {
    if (!locale) return null;
    const lower = String(locale).toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('en')) return 'en';
    return null;
  }

  function getLocaleFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const value = normalizeLocale(params.get('lang'));
    return value && SUPPORTED.includes(value) ? value : null;
  }

  function detectLocale() {
    return (
      getLocaleFromUrl() ||
      normalizeLocale(localStorage.getItem(STORAGE_KEY)) ||
      normalizeLocale(navigator.language) ||
      'en'
    );
  }

  let locale = detectLocale();

  function getDictionary() {
    return dictionaries[locale] || dictionaries.en;
  }

  function resolvePath(obj, keyPath) {
    return keyPath.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
  }

  function format(template, vars = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_m, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
  }

  function t(key, vars) {
    const raw = resolvePath(getDictionary(), key) || resolvePath(dictionaries.en, key) || key;
    return vars ? format(raw, vars) : raw;
  }

  function setLocale(newLocale) {
    const normalized = normalizeLocale(newLocale);
    locale = SUPPORTED.includes(normalized) ? normalized : 'en';
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
    return locale;
  }

  function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    const pageTitle = root.querySelector('title[data-i18n]');
    if (pageTitle) pageTitle.textContent = t(pageTitle.dataset.i18n);
  }

  function bindLanguageSwitcher(selectId, onChange) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.value = locale;
    el.addEventListener('change', () => {
      setLocale(el.value);
      applyTranslations(document);
      if (typeof onChange === 'function') onChange(locale);
    });
  }

  setLocale(locale);
  window.I18N = {
    t,
    format,
    getLocale: () => locale,
    setLocale,
    applyTranslations,
    bindLanguageSwitcher,
  };
})();
