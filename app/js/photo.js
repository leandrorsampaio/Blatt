/* ================================================================
 *  PHOTO -- One stored photo, framed in a square and shown on page 1
 *
 *  Blatt keeps exactly one photo. It is stored as two data URLs: the
 *  downscaled upload (`original`, re-editable) and the framed 1:1 result
 *  actually painted on the CV (`image`). Framing and black & white are baked
 *  into `image` through a canvas rather than applied as CSS filters, because
 *  the PDF exporter rasterises the page and does not reproduce CSS filters
 *  reliably. The photo record lives with the CV content (shared by every CV
 *  version); placement, size and border live in the design/format preset.
 * ================================================================ */
const PHOTO_KEY = 'cv-photo';
const PHOTO_STAGE = 300;      /* crop stage size in CSS px */
const PHOTO_OUTPUT = 700;     /* stored framed image size in px */
const PHOTO_MAX_SOURCE = 900; /* uploads are downscaled to this long edge */
const PHOTO_ZOOM_MAX = 3;
const PHOTO_JPEG_QUALITY = 0.8; /* both stored copies; invisible in print, keeps storage and sync light */

/* Shipped sample photo: a plain grey block so the default CV shows the feature */
const PLACEHOLDER_PHOTO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">' +
  '<rect width="600" height="600" fill="#dfe3ec"/>' +
  '<rect x="26" y="26" width="548" height="548" fill="none" stroke="#b9c0d2" stroke-width="6" stroke-dasharray="20 14"/>' +
  '<text x="300" y="300" dy="0.35em" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="700" ' +
  'fill="#8a92a8" text-anchor="middle" letter-spacing="6">PHOTO</text>' +
  '</svg>'
);

function defaultPhoto() {
  return { enabled: true, original: PLACEHOLDER_PHOTO, image: PLACEHOLDER_PHOTO,
           zoom: 1, ox: 0, oy: 0, bw: false, placeholder: true };
}

function normalizePhoto(rec) {
  var zoom = parseFloat(rec.zoom);
  if (!isFinite(zoom) || zoom < 1) zoom = 1;
  if (zoom > PHOTO_ZOOM_MAX) zoom = PHOTO_ZOOM_MAX;
  return {
    enabled:     rec.enabled !== false,
    original:    typeof rec.original === 'string' ? rec.original : '',
    image:       typeof rec.image === 'string' ? rec.image : '',
    zoom:        zoom,
    ox:          typeof rec.ox === 'number' && isFinite(rec.ox) ? rec.ox : 0,
    oy:          typeof rec.oy === 'number' && isFinite(rec.oy) ? rec.oy : 0,
    bw:          !!rec.bw,
    placeholder: !!rec.placeholder,
  };
}

function getStoredPhoto() {
  try {
    var raw = localStorage.getItem(PHOTO_KEY);
    if (raw) {
      var rec = JSON.parse(raw);
      if (rec && typeof rec === 'object') return normalizePhoto(rec);
    }
  } catch (err) { /* Unreadable record — fall back to the shipped placeholder */ }
  return defaultPhoto();
}

/* Photos are the one thing here big enough to hit the localStorage quota. */
function savePhoto() {
  try {
    localStorage.setItem(PHOTO_KEY, JSON.stringify(state.photo));
    return true;
  } catch (err) {
    showToast('Not enough browser storage to save this photo — try a smaller image', 'error');
    return false;
  }
}

/* ── Painting the photo onto the CV ───────────────────────────── */

function photoPosition() {
  return state.currentFormat['photo-position'] === 'header' ? 'header' : 'sidebar';
}

function renderPhoto() {
  var page = document.getElementById('page');
  if (!page) return;
  page.querySelectorAll('.cv-photo, .spacer-photo').forEach(function(el) { el.remove(); });
  updatePhotoToggleButton();

  var rec = state.photo;
  if (!rec || !rec.enabled || !rec.image) return;

  var header = photoPosition() === 'header';
  var el = document.createElement('div');
  el.className = 'cv-photo cv-photo--' + (header ? 'circle' : 'square');
  if (state.currentFormat['photo-border']) el.classList.add('has-border');
  el.style.backgroundImage = 'url("' + rec.image + '")';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', state.currentName ? 'Photo of ' + state.currentName : 'Profile photo');

  if (header) {
    page.appendChild(el);
  } else {
    var sidebar = page.querySelector('.sidebar');
    if (!sidebar) return;
    var spacer = document.createElement('div');
    spacer.className = 'spacer-sidebar spacer-photo';
    sidebar.insertBefore(spacer, sidebar.firstChild);
    sidebar.insertBefore(el, sidebar.firstChild);
  }
}

function updatePhotoToggleButton() {
  var btn = document.getElementById('photo-toggle-btn');
  var label = document.getElementById('photo-toggle-label');
  if (!btn || !label) return;
  var rec = state.photo;
  var hasImage = !!(rec && rec.image);
  btn.disabled = false;
  label.textContent = (hasImage && rec.enabled) ? 'Hide Photo' : 'Show Photo';
  btn.title = hasImage ? '' : 'No photo yet — opens the Photo tab';
}

function setPhotoEnabled(on) {
  var rec = state.photo;
  if (!rec) return;
  if (on && !rec.image) {
    showToast('Upload a photo first', 'error');
    updatePhotoUI();
    return;
  }
  rec.enabled = !!on;
  savePhoto();
  renderPhoto();
  updatePhotoUI();
}

function togglePhoto() {
  var rec = state.photo;
  if (!rec || !rec.image) {
    switchTab('photo');
    showToast('Upload a photo to get started');
    return;
  }
  setPhotoEnabled(!rec.enabled);
}

/* ── Crop stage ───────────────────────────────────────────────── */

function photoBaseScale() {
  var img = state.photoImg;
  if (!img || !img.naturalWidth || !img.naturalHeight) return 1;
  return Math.max(PHOTO_STAGE / img.naturalWidth, PHOTO_STAGE / img.naturalHeight);
}

function clampPhotoOffset() {
  var img = state.photoImg, rec = state.photo;
  if (!img || !rec) return;
  var s = photoBaseScale() * rec.zoom;
  var w = img.naturalWidth * s, h = img.naturalHeight * s;
  rec.ox = Math.min(0, Math.max(PHOTO_STAGE - w, rec.ox));
  rec.oy = Math.min(0, Math.max(PHOTO_STAGE - h, rec.oy));
}

function centerPhoto() {
  var img = state.photoImg, rec = state.photo;
  if (!img || !rec) return;
  var s = photoBaseScale() * rec.zoom;
  rec.ox = (PHOTO_STAGE - img.naturalWidth * s) / 2;
  rec.oy = (PHOTO_STAGE - img.naturalHeight * s) / 2;
}

function grayscaleCanvas(ctx, w, h) {
  var data = ctx.getImageData(0, 0, w, h);
  var p = data.data;
  for (var i = 0; i < p.length; i += 4) {
    var v = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
}

/* Draws the source image into a square canvas of `size` px using the current
   zoom/offset. Shared by the on-screen stage and the stored output. */
function paintPhotoInto(ctx, size) {
  var img = state.photoImg, rec = state.photo;
  var ratio = size / PHOTO_STAGE;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  if (!img) return;
  var s = photoBaseScale() * rec.zoom * ratio;
  ctx.drawImage(img, rec.ox * ratio, rec.oy * ratio, img.naturalWidth * s, img.naturalHeight * s);
  if (rec.bw) grayscaleCanvas(ctx, size, size);
}

function drawPhotoStage() {
  var canvas = document.getElementById('photo-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.photoImg) paintPhotoInto(ctx, canvas.width);
}

function renderPhotoOutput() {
  if (!state.photoImg) return null;
  var out = document.createElement('canvas');
  out.width = PHOTO_OUTPUT;
  out.height = PHOTO_OUTPUT;
  paintPhotoInto(out.getContext('2d'), PHOTO_OUTPUT);
  return out.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
}

/* Bakes the current framing into the stored image. Debounced while dragging. */
function commitPhotoFraming(immediate) {
  clearTimeout(state.photoCommitTimer);
  var run = function() {
    state.photoCommitTimer = null;
    var data = renderPhotoOutput();
    if (!data) return;
    state.photo.image = data;
    state.photo.placeholder = false;
    savePhoto();
    renderPhoto();
    updatePhotoPreviews();
    setPhotoStatus('Saved.');
  };
  if (immediate) run();
  else state.photoCommitTimer = setTimeout(run, 350);
}

/* ── Photo tab UI ─────────────────────────────────────────────── */

function setPhotoStatus(text) {
  var el = document.getElementById('photo-status');
  if (el) el.textContent = text;
}

function loadPhotoStageImage(cb) {
  var rec = state.photo;
  if (!rec || !rec.original) { state.photoImg = null; if (cb) cb(); return; }
  var img = new Image();
  img.onload = function() { state.photoImg = img; if (cb) cb(); };
  img.onerror = function() { state.photoImg = null; if (cb) cb(); };
  img.src = rec.original;
}

/* Height / width of the frame the photo lands in, so the crop stage can show
   how much of the stored square actually survives the cover-fit crop. */
function photoFrameAspect() {
  if (photoPosition() === 'header') return 1;
  var f = state.currentFormat;
  var num = function(key, fallback) {
    var v = parseFloat(f[key]);
    return isFinite(v) ? v : fallback;
  };
  var w = num('sidebar-width', 66) - num('col-gap', 5) - num('page-margin-left', 10);
  var h = 25 + num('photo-size', 50) * 0.45;
  if (!(w > 0) || !(h > 0)) return 1;
  return h / w;
}

function updatePhotoMask() {
  var mask = document.getElementById('photo-stage-mask');
  if (!mask) return;
  mask.classList.toggle('--circle', photoPosition() === 'header');
  var aspect = photoFrameAspect();
  var vertical = aspect < 1 ? (1 - aspect) / 2 * 100 : 0;
  var horizontal = aspect > 1 ? (1 - 1 / aspect) / 2 * 100 : 0;
  mask.style.top = mask.style.bottom = vertical + '%';
  mask.style.left = mask.style.right = horizontal + '%';
}

function updatePhotoPreviews() {
  var rec = state.photo;
  var border = !!state.currentFormat['photo-border'];
  ['square', 'circle'].forEach(function(shape) {
    var el = document.getElementById('photo-preview-' + shape);
    if (!el) return;
    el.style.backgroundImage = rec && rec.image ? 'url("' + rec.image + '")' : '';
    el.classList.toggle('has-border', border && !!(rec && rec.image));
  });
  var square = document.getElementById('photo-preview-square');
  if (square) square.style.height = Math.round(132 * photoFrameAspect()) + 'px';
}

function updatePhotoUI() {
  var rec = state.photo;
  var hasImage = !!(rec && rec.image);
  var hasSource = !!(rec && rec.original);

  var bw = document.getElementById('photo-bw');
  var enabled = document.getElementById('photo-enabled');
  var zoom = document.getElementById('photo-zoom');
  if (bw) { bw.checked = !!(rec && rec.bw); bw.disabled = !hasSource; }
  if (enabled) { enabled.checked = !!(rec && rec.enabled && hasImage); enabled.disabled = !hasImage; }
  if (zoom) { zoom.value = Math.round((rec ? rec.zoom : 1) * 100); zoom.disabled = !hasSource; }
  var zoomVal = document.getElementById('photo-zoom-val');
  if (zoomVal) zoomVal.textContent = Math.round((rec ? rec.zoom : 1) * 100) + '%';

  var resetBtn = document.getElementById('photo-reset-btn');
  var removeBtn = document.getElementById('photo-remove-btn');
  if (resetBtn) resetBtn.disabled = !hasSource;
  if (removeBtn) removeBtn.disabled = !hasImage;

  var empty = document.getElementById('photo-stage-empty');
  if (empty) empty.style.display = hasSource ? 'none' : 'flex';
  var mask = document.getElementById('photo-stage-mask');
  if (mask) mask.style.display = hasSource ? '' : 'none';
  updatePhotoMask();

  if (!hasImage) setPhotoStatus('No photo saved.');
  else if (rec.placeholder) setPhotoStatus('Showing the sample placeholder. Upload your own photo to replace it.');
  else setPhotoStatus('Saved.');

  updatePhotoPreviews();
  updatePhotoToggleButton();
}

function buildPhotoView() {
  loadPhotoStageImage(function() {
    if (state.photoImg) clampPhotoOffset();
    drawPhotoStage();
    updatePhotoUI();
  });
}

function onPhotoZoom(value) {
  var rec = state.photo;
  if (!rec || !state.photoImg) return;
  var prev = rec.zoom;
  rec.zoom = Math.max(1, Math.min(PHOTO_ZOOM_MAX, parseFloat(value) / 100));
  /* Zoom around the centre of the frame so the subject stays put */
  var img = state.photoImg;
  var base = photoBaseScale();
  var cx = (PHOTO_STAGE / 2 - rec.ox) / (img.naturalWidth * base * prev);
  var cy = (PHOTO_STAGE / 2 - rec.oy) / (img.naturalHeight * base * prev);
  rec.ox = PHOTO_STAGE / 2 - cx * img.naturalWidth * base * rec.zoom;
  rec.oy = PHOTO_STAGE / 2 - cy * img.naturalHeight * base * rec.zoom;
  clampPhotoOffset();
  drawPhotoStage();
  var out = document.getElementById('photo-zoom-val');
  if (out) out.textContent = Math.round(rec.zoom * 100) + '%';
  commitPhotoFraming();
}

function onPhotoBwToggle(on) {
  var rec = state.photo;
  if (!rec) return;
  rec.bw = !!on;
  drawPhotoStage();
  commitPhotoFraming(true);
}

function resetPhotoFraming() {
  var rec = state.photo;
  if (!rec || !state.photoImg) return;
  rec.zoom = 1;
  centerPhoto();
  drawPhotoStage();
  updatePhotoUI();
  commitPhotoFraming(true);
}

function requestPhotoUpload() {
  var rec = state.photo;
  var input = document.getElementById('photo-file-input');
  if (rec && rec.image && !rec.placeholder) {
    showConfirm('Replace your photo?',
      'Blatt stores one photo. Uploading a new image permanently replaces the current one.',
      'Choose photo', function() { input.click(); });
    return;
  }
  input.click();
}

function requestPhotoRemove() {
  showConfirm('Remove photo?',
    'The photo will be deleted from this browser. Your CV text is not affected.',
    'Remove', function() {
      state.photo = { enabled: false, original: '', image: '', zoom: 1, ox: 0, oy: 0, bw: false, placeholder: false };
      state.photoImg = null;
      savePhoto();
      renderPhoto();
      drawPhotoStage();
      updatePhotoUI();
      showToast('Photo removed');
    });
}

/* Uploads are downscaled before storage — a raw phone photo would blow the
   localStorage quota and slow the PDF export down for no visible gain. */
function ingestPhotoFile(file) {
  if (!file) return;
  if (!file.type || file.type.indexOf('image/') !== 0) {
    showToast('Please choose an image file', 'error');
    return;
  }
  var reader = new FileReader();
  reader.onerror = function() { showToast('Could not read that file', 'error'); };
  reader.onload = function(ev) {
    var img = new Image();
    img.onerror = function() { showToast('That image could not be opened', 'error'); };
    img.onload = function() {
      var scale = Math.min(1, PHOTO_MAX_SOURCE / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * scale));
      var h = Math.max(1, Math.round(img.naturalHeight * scale));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      var keepBw = !!(state.photo && state.photo.bw);
      state.photo = { enabled: true, original: c.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY), image: '',
                      zoom: 1, ox: 0, oy: 0, bw: keepBw, placeholder: false };
      loadPhotoStageImage(function() {
        centerPhoto();
        drawPhotoStage();
        commitPhotoFraming(true);
        updatePhotoUI();
        showToast('Photo added');
      });
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

document.getElementById('photo-file-input').addEventListener('change', function(e) {
  ingestPhotoFile(e.target.files[0]);
  this.value = '';
});

/* Drag to reposition inside the crop frame */
(function() {
  var stage = document.getElementById('photo-stage');
  if (!stage) return;
  stage.addEventListener('pointerdown', function(e) {
    if (!state.photoImg) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    /* On a phone the stage is drawn smaller than PHOTO_STAGE: scale the finger's path */
    state.photoDrag = { x: e.clientX, y: e.clientY, ox: state.photo.ox, oy: state.photo.oy,
                        k: PHOTO_STAGE / (stage.clientWidth || PHOTO_STAGE) };
    stage.classList.add('--dragging');
  });
  stage.addEventListener('pointermove', function(e) {
    if (!state.photoDrag) return;
    state.photo.ox = state.photoDrag.ox + (e.clientX - state.photoDrag.x) * state.photoDrag.k;
    state.photo.oy = state.photoDrag.oy + (e.clientY - state.photoDrag.y) * state.photoDrag.k;
    clampPhotoOffset();
    drawPhotoStage();
  });
  var endDrag = function() {
    if (!state.photoDrag) return;
    state.photoDrag = null;
    stage.classList.remove('--dragging');
    commitPhotoFraming(true);
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
})();

/* The shipped placeholder is an SVG. Rasterise it once so every export path
   (including the canvas-based PDF) treats it exactly like an uploaded photo. */
function initPhoto() {
  state.photo = getStoredPhoto();
  if (!state.photo.placeholder) return;
  var img = new Image();
  img.onload = function() {
    var c = document.createElement('canvas');
    c.width = PHOTO_OUTPUT;
    c.height = PHOTO_OUTPUT;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PHOTO_OUTPUT, PHOTO_OUTPUT);
    ctx.drawImage(img, 0, 0, PHOTO_OUTPUT, PHOTO_OUTPUT);
    state.photo.image = c.toDataURL('image/jpeg', 0.9);
    renderPhoto();
  };
  img.onerror = function() { /* Keep the SVG; it still renders on screen. */ };
  img.src = PLACEHOLDER_PHOTO;
}
