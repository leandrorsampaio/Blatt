/* ================================================================
 *  SERVER SYNC -- Optional. When cv.html is served by a Blatt server
 *  (src/server), every cv-* localStorage key is mirrored to it so the
 *  CV follows its owner across devices. localStorage stays the working
 *  copy; the server holds one JSON snapshot with a revision number.
 *  Opened as a file or from a plain static host there is no
 *  api/data, and none of this runs.
 * ================================================================ */
const SYNC_URL = 'api/data';
const SYNC_META_KEY = 'blatt-sync';  /* { rev, hash } last state agreed with the server -- deliberately not cv-* */
const SYNC_PREFIX = 'cv-';
const SYNC_POLL_MS = 3000;           /* how often localStorage is checked for unsynced changes */
const SYNC_MAX_WAIT_MS = 20000;      /* push at the latest this long after the first unsynced change */

const SYNC_STATUS = {
  synced:      { text: 'Saved to your server' },
  pending:     { text: 'Saving to your server…', cls: 'pending' },
  offline:     { text: 'Server not reachable – changes kept in this browser', cls: 'problem' },
  error:       { text: 'Not saved to your server', cls: 'problem' },
  conflict:    { text: 'Waiting for your choice', cls: 'problem' },
  'signed-out': { text: 'Signed out', cls: 'problem', action: 'Sign in' },
};

function syncSnapshot() {
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith(SYNC_PREFIX)) keys.push(k);
  }
  keys.sort();
  var out = { format: 'blatt-sync', version: 1, keys: {} };
  keys.forEach(function(k) { out.keys[k] = localStorage.getItem(k); });
  return JSON.stringify(out);
}

/* cyrb53 -- fast, non-cryptographic; only used to notice that something changed */
function syncHash(str) {
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return str.length + ':' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}

function getSyncMeta() {
  try {
    var m = JSON.parse(localStorage.getItem(SYNC_META_KEY));
    return m && typeof m.rev === 'number' ? m : null;
  } catch (err) { return null; }
}
function setSyncMeta(rev, hash) { localStorage.setItem(SYNC_META_KEY, JSON.stringify({ rev: rev, hash: hash })); }

function syncClearLocal() {
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && (k.startsWith(SYNC_PREFIX) || k === SYNC_META_KEY)) keys.push(k);
  }
  keys.forEach(function(k) { localStorage.removeItem(k); });
}

function syncRequest(method, body) {
  return fetch(SYNC_URL, {
    method: method, body: body, credentials: 'same-origin', cache: 'no-store',
    headers: method === 'PUT' ? { 'Content-Type': 'application/json', 'X-Blatt-Sync': '1' } : {},
  });
}

function setSyncStatus(kind) {
  var s = SYNC_STATUS[kind];
  var el = document.getElementById('sync-status');
  el.hidden = false;
  el.className = 'sync-status' + (s.cls ? ' ' + s.cls : '');
  el.dataset.kind = kind;
  document.getElementById('sync-status-text').textContent = s.text;
  document.getElementById('sync-status-action').textContent = s.action || 'Sign out';
}

function openSyncModal(title, message, buttons) {
  document.getElementById('sync-modal-title').textContent = title;
  document.getElementById('sync-modal-message').textContent = message;
  var actions = document.getElementById('sync-modal-actions');
  actions.innerHTML = '';
  buttons.forEach(function(b) {
    var btn = document.createElement('button');
    btn.className = b.primary ? 'modal-confirm' : 'modal-cancel';
    btn.textContent = b.label;
    btn.onclick = b.action;
    actions.appendChild(btn);
  });
  document.getElementById('sync-modal').classList.add('open');
}
function closeSyncModal() { document.getElementById('sync-modal').classList.remove('open'); }

/* Entry point (end of BOOT). Only an answering Blatt server switches sync on. */
function initServerSync() {
  if (!/^https?:$/.test(location.protocol)) return;
  syncPull();
}

async function syncPull() {
  if (state.sync.busy) return;
  var res;
  try { res = await syncRequest('GET'); } catch (err) {
    if (state.sync.active) setSyncStatus('offline');
    return;
  }
  var body = null;
  if (/json/.test(res.headers.get('Content-Type') || '')) {
    try { body = await res.json(); } catch (err) { body = null; }
  }
  /* A Blatt server says "signed-out" in the body; a bare 401 from some other host is ignored */
  if (res.status === 401 && body && body.error === 'signed-out') { syncActivate(); syncSignedOut(); return; }
  if (!res.ok || !body || typeof body.rev !== 'number') {
    if (state.sync.active) setSyncStatus('error');
    return; /* not a Blatt server (static hosting) -- stay a plain offline app */
  }
  syncActivate();
  syncReconcile(body);
}

function syncActivate() {
  var s = state.sync;
  if (s.active) return;
  s.active = true;
  s.timer = setInterval(syncPoll, SYNC_POLL_MS);
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) { syncPoll(true); return; }  /* leaving the tab: save now */
    if (s.stale) { location.reload(); return; }       /* another tab changed the CV meanwhile */
    syncPull();                                        /* coming back: another device may have saved */
  });
  /* Another tab of this browser changed the CV: this tab's in-memory copy is now
     stale and must not be auto-saved over it, so restart on the shared copy. */
  window.addEventListener('storage', function(e) {
    if (!e.key || !(e.key === SYNC_META_KEY || e.key.startsWith(SYNC_PREFIX))) return;
    s.stale = true;
    clearTimeout(state.autoSaveTimer);
    clearTimeout(state.photoCommitTimer);
    var modalOpen = document.querySelector('.modal-overlay.open, .confirm-overlay.open');
    if (!document.hidden && !modalOpen) location.reload();
  });
}

/* Sync decides from localStorage, so write any edit still waiting in a debounce timer. */
function syncFlushPending() {
  flushAutoSave();
  if (state.photoCommitTimer) commitPhotoFraming(true);
}

/* Unsaved work in a browser that has never synced (e.g. used here before the server existed) */
function syncHasLocalWork() {
  if (localStorage.getItem(CONTENT_DEFAULT)) return true;
  if (Object.keys(getContentPresets()).length) return true;
  return !!(state.photo && state.photo.image && !state.photo.placeholder);
}

/* Decide who is ahead: this browser, the server, or both (a conflict). */
function syncReconcile(server) {
  if (state.sync.blocked || state.sync.stale) return;
  syncFlushPending();
  var meta = getSyncMeta();
  var snap = syncSnapshot();
  var hash = syncHash(snap);
  if (!server.data) return syncPush(0, snap);            /* empty server: seed it from this browser */
  /* Same content on both sides (e.g. a save whose reply was lost): just agree on the revision */
  if (syncHash(JSON.stringify(server.data)) === hash) {
    setSyncMeta(server.rev, hash);
    setSyncStatus('synced');
    return;
  }
  if (!meta) return syncHasLocalWork() ? syncConflict(server) : syncApply(server);
  if (meta.rev === server.rev) {
    if (hash !== meta.hash) return syncPush(meta.rev, snap);
    setSyncStatus('synced');
    return;
  }
  /* Only the server moved on -- unless it went backwards (restored from a backup) */
  if (hash === meta.hash && server.rev > meta.rev) return syncApply(server);
  syncConflict(server);
}

/* Every push goes through here, so callers can wait for the one in flight. */
function syncPush(baseRev, snap) {
  var s = state.sync;
  s.inflight = syncPushNow(baseRev, snap).finally(function() { s.inflight = null; });
  return s.inflight;
}

async function syncPushNow(baseRev, snap) {
  var s = state.sync;
  s.busy = true;
  setSyncStatus('pending');
  try {
    var res = await syncRequest('PUT', '{"baseRev":' + baseRev + ',"data":' + snap + '}');
    if (res.ok) {
      var saved = await res.json();
      setSyncMeta(saved.rev, syncHash(snap));
      s.dirtySince = 0;
      s.failedHash = null;
      setSyncStatus(syncSnapshot() === snap ? 'synced' : 'pending');
    } else if (res.status === 409) {
      s.busy = false;
      return syncPull();  /* someone else saved first -- re-decide with fresh server state */
    } else if (res.status === 401) {
      syncSignedOut();
    } else if (res.status === 413) {
      s.failedHash = syncHash(snap);
      setSyncStatus('error');
      showToast('Too large to save to your server – try a smaller photo', 'error');
    } else {
      setSyncStatus('error');
    }
  } catch (err) {
    setSyncStatus('offline');
  } finally {
    s.busy = false;
  }
}

/* Runs every few seconds: push once local changes have settled (or waited too long). */
function syncPoll(force) {
  var s = state.sync;
  if (!s.active || s.busy || s.blocked || s.stale || (document.hidden && !force)) return;
  var snap = syncSnapshot();
  var hash = syncHash(snap);
  var meta = getSyncMeta();
  if (meta && hash === meta.hash) { s.dirtySince = 0; s.lastPollHash = hash; return; }
  if (hash === s.failedHash) return;  /* already refused as too large; wait for the next change */
  var settled = hash === s.lastPollHash;
  s.lastPollHash = hash;
  if (!s.dirtySince) s.dirtySince = Date.now();
  setSyncStatus('pending');
  if (force || settled || Date.now() - s.dirtySince >= SYNC_MAX_WAIT_MS) return syncPush(meta ? meta.rev : 0, snap);
}

/* Replace this browser's copy with the server's, then restart the app on it. */
function syncApply(server) {
  var data = server.data;
  if (!data || !data.keys || typeof data.keys !== 'object') {
    state.sync.blocked = true;
    setSyncStatus('error');
    showToast('The data on your server could not be read', 'error');
    return;
  }
  state.sync.blocked = true;
  clearTimeout(state.autoSaveTimer);
  clearTimeout(state.photoCommitTimer);
  try {
    syncClearLocal();
    Object.keys(data.keys).forEach(function(k) {
      if (k.startsWith(SYNC_PREFIX) && typeof data.keys[k] === 'string') localStorage.setItem(k, data.keys[k]);
    });
    setSyncMeta(server.rev, syncHash(syncSnapshot()));
  } catch (err) {
    showToast('Not enough browser storage to load your CV from the server', 'error');
    return;
  }
  location.reload();
}

function syncConflict(server) {
  state.sync.blocked = true;
  setSyncStatus('conflict');
  var when = server.updatedAt ? new Date(server.updatedAt).toLocaleString() : 'recently';
  openSyncModal('Your CV was changed on another device',
    'Your server has a version saved ' + when + ', and this browser has changes that never reached the server. ' +
    'Which one do you want to keep? The other one will be replaced.',
    [
      { label: 'Keep this browser\'s version', action: function() {
        closeSyncModal();
        state.sync.blocked = false;
        syncPush(server.rev, syncSnapshot());
      } },
      { label: 'Use the server\'s version', primary: true, action: function() {
        closeSyncModal();
        syncApply(server);
      } },
    ]);
}

function syncSignedOut() {
  state.sync.blocked = true;
  setSyncStatus('signed-out');
  openSyncModal('You are signed out',
    'Your sign-in to this Blatt server has expired. Your changes are kept in this browser and will be saved to the server after you sign in again.',
    [
      { label: 'Later', action: closeSyncModal },
      { label: 'Sign in', primary: true, action: function() { location.href = 'auth/login'; } },
    ]);
}

function syncStatusAction() {
  if (document.getElementById('sync-status').dataset.kind === 'signed-out') {
    location.href = 'auth/login';
    return;
  }
  syncSignOut();
}

/* Signing out also removes the CV from this browser (it is safe on the
   server), so nothing personal is left behind on a shared computer. */
async function syncSignOut() {
  syncFlushPending();
  if (state.sync.inflight) await state.sync.inflight;
  if (!state.sync.blocked) await syncPoll(true);
  var meta = getSyncMeta();
  if (meta && syncHash(syncSnapshot()) === meta.hash) {
    state.sync.blocked = true;
    clearTimeout(state.autoSaveTimer);
    clearTimeout(state.photoCommitTimer);
    syncClearLocal();
    location.href = 'auth/logout';
    return;
  }
  showConfirm('Sign out anyway?',
    'Some changes have not reached your server yet. They stay in this browser and will be saved the next time you sign in here.',
    'Sign out', function() { location.href = 'auth/logout'; });
}
