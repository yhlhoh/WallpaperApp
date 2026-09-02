const slideA = document.getElementById('a');
const slideB = document.getElementById('b');
const empty = document.getElementById('empty');

let playlist = [];
let index = 0;
let active = slideA;
let idle = slideB;
let timer = null;

async function loadPlaylist() {
  const res = await fetch('/api/playlist', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load playlist');
  const data = await res.json();
  playlist = data.items || [];
  if (index >= playlist.length) index = 0;
}

function stopVideo(el) {
  const v = el.querySelector('video');
  v.pause();
  v.removeAttribute('src');
  v.load();
}

async function setMedia(el, item) {
  const img = el.querySelector('img');
  const video = el.querySelector('video');

  el.classList.remove('image', 'video');
  if (item.type === 'video') {
    img.removeAttribute('src');
    video.src = item.url;
    video.currentTime = 0;
    video.muted = true;
    video.loop = true;
    try { await video.play(); } catch {}
    el.classList.add('video');
  } else {
    stopVideo(el);
    img.src = item.url;
    el.classList.add('image');
  }
}

async function showNext() {
  if (!playlist.length) {
    empty.style.display = 'flex';
    active.classList.remove('active');
    idle.classList.remove('active');
    timer = setTimeout(async () => {
      try {
        await loadPlaylist();
      } catch {}
      showNext();
    }, 5000);
    return;
  }

  empty.style.display = 'none';
  const item = playlist[index % playlist.length];
  index += 1;

  await setMedia(idle, item);
  idle.classList.add('active');
  active.classList.remove('active');

  stopVideo(active);
  [active, idle] = [idle, active];

  const duration = Math.max(3, Number(item.durationSeconds) || 20) * 1000;
  timer = setTimeout(showNext, duration);
}

async function loop() {
  clearTimeout(timer);
  try {
    await loadPlaylist();
  } catch (error) {
    console.error(error);
  }
  showNext();
}

setInterval(loop, 60_000);
loop();
