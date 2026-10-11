/* ================================================================
 *  FORMAT EDITOR -- CSS variable controls for colors, fonts, spacing
 * ================================================================ */
const FORMAT_SCHEMA = [
  { group: 'Theme Colors', items: [
    { key: 'color-blue',  label: 'Accent color', unit: '', type: 'color', default: '#2c3e6b' },
    { key: 'color-black', label: 'Text color',   unit: '', type: 'color', default: '#000000' },
    { key: 'color-grey',  label: 'Secondary color', unit: '', type: 'color', default: '#666666' },
  ]},
  { group: 'Font Sizes', items: [
    { key: 'fs-name',           label: 'Name',           unit: 'pt', step: 0.5, default: 20 },
    { key: 'fs-heading',        label: 'Headings',       unit: 'pt', step: 0.5, default: 13 },
    { key: 'fs-subtitle',       label: 'Subtitle',       unit: 'pt', step: 0.5, default: 10 },
    { key: 'fs-sidebar-title',  label: 'Sidebar title',  unit: 'pt', step: 0.5, default: 10.5 },
    { key: 'fs-org',            label: 'Organisation',   unit: 'pt', step: 0.5, default: 9.5 },
    { key: 'fs-body',           label: 'Body',           unit: 'pt', step: 0.5, default: 9 },
    { key: 'fs-small',          label: 'Small text',     unit: 'pt', step: 0.5, default: 8.5 },
  ]},
  { group: 'Page Settings', items: [
    { key: 'page-margin-top',    label: 'Top margin',    unit: 'mm', step: 0.5, default: 10 },
    { key: 'page-margin-right',  label: 'Right margin',  unit: 'mm', step: 0.5, default: 10 },
    { key: 'page-margin-bottom', label: 'Bottom margin', unit: 'mm', step: 0.5, default: 10 },
    { key: 'page-margin-left',   label: 'Left margin',   unit: 'mm', step: 0.5, default: 10 },
  ]},
  { group: 'Spacing', items: [
    { key: 'col-gap',        label: 'Column gap',     unit: 'mm', step: 0.5, default: 5 },
    { key: 'content-gap',    label: 'Content gap',    unit: 'mm', step: 0.5, default: 2 },
    { key: 'sidebar-gap',    label: 'Sidebar gap',    unit: 'mm', step: 0.5, default: 2 },
    { key: 'heading-gap',    label: 'Heading gap',    unit: 'mm', step: 0.5, default: 1 },
    { key: 'entry-gap',      label: 'Entry gap',      unit: 'mm', step: 0.5, default: 1.5 },
    { key: 'sub-entry-gap',  label: 'Sub-entry gap',  unit: 'mm', step: 0.1, default: 0.5 },
    { key: 'bullet-indent',  label: 'Bullet indent',  unit: 'mm', step: 0.5, default: 2 },
    { key: 'line-height',    label: 'Line height',    unit: '',   step: 5,   default: 140, suffix: '%' },
  ]},
  { group: 'Layout', items: [
    { key: 'sidebar-width', label: 'Sidebar width', unit: 'mm', step: 1, default: 66 },
    { key: 'bar-width',     label: 'Bar width',     unit: 'mm', step: 1, default: 12 },
  ]},
  { group: 'Photo', note: 'Upload and frame the photo in the <a onclick="switchTab(\'photo\')">Photo tab</a>. It only appears on page 1.', items: [
    { key: 'photo-position',     label: 'Placement', type: 'select', default: 'sidebar',
      options: [ { value: 'sidebar', label: 'Sidebar' }, { value: 'header', label: 'Header' } ] },
    { key: 'photo-size',         label: 'Size', type: 'range', unit: '', min: 0, max: 100, step: 1, default: 50, suffix: '%' },
    { key: 'photo-border',       label: 'Border', type: 'toggle', default: true },
    { key: 'photo-border-width', label: 'Border width', unit: 'px', step: 1, default: 5 },
  ]},
];

/* Format keys that are not plain CSS variables on :root — they change the CV
   structurally, so the photo has to be re-rendered when they change. */
const PHOTO_FORMAT_KEYS = ['photo-position', 'photo-border', 'photo-border-width'];

const STORAGE_KEY = 'cv-format-presets';
const ACTIVE_KEY = 'cv-format-active';

function getDefaults() {
  const d = {};
  for (const g of FORMAT_SCHEMA) for (const item of g.items) d[item.key] = item.default;
  return d;
}

function getItemMeta(key) {
  for (const g of FORMAT_SCHEMA) for (const item of g.items) if (item.key === key) return item;
  return null;
}

function applyFormat(fmt) {
  const root = document.documentElement;
  /* Start from the defaults so presets saved before a key existed still get it */
  const merged = { ...getDefaults(), ...fmt };
  for (const [key, value] of Object.entries(merged)) {
    const meta = getItemMeta(key);
    if (!meta) continue;
    if (meta.type === 'color') {
      root.style.setProperty('--' + key, value);
    } else if (meta.type === 'select' || meta.type === 'toggle') {
      /* Applied structurally by renderPhoto(), not as a CSS variable */
    } else {
      root.style.setProperty('--' + key, value + (meta.unit || ''));
    }
  }
  state.currentFormat = merged;
  renderPhoto();
  updateResetButtons();
}

function updateResetButtons() {
  const defaults = getDefaults();
  for (const key of Object.keys(defaults)) {
    const btn = document.getElementById('reset-' + key);
    if (btn) {
      const isDefault = String(state.currentFormat[key]) === String(defaults[key]);
      btn.classList.toggle('is-default', isDefault);
    }
  }
}

function buildDrawerUI() {
  const body = document.getElementById('drawer-body');
  let html = '';
  for (const group of FORMAT_SCHEMA) {
    html += '<div class="drawer-group open">';
    html += '<div class="drawer-group-title" onclick="this.parentElement.classList.toggle(\'open\')">' + esc(group.group) + '</div>';
    html += '<div class="drawer-group-content">';
    if (group.note) html += '<p class="fmt-note">' + group.note + '</p>';
    for (const item of group.items) {
      if (item.type === 'select') {
        html += '<div class="fmt-row" data-fmt-key="' + item.key + '" onmouseenter="highlightFormatTarget(\'' + item.key + '\')" onmouseleave="clearFormatHighlight()">';
        html += '<span class="fmt-label">' + esc(item.label) + '</span>';
        html += '<select class="fmt-select" id="fmt-' + item.key + '" onchange="onFormatChange(\'' + item.key + '\', this.value)">';
        for (const opt of item.options) {
          html += '<option value="' + esc(opt.value) + '"' + (opt.value === item.default ? ' selected' : '') + '>' + esc(opt.label) + '</option>';
        }
        html += '</select>';
        html += '<button class="fmt-reset is-default" id="reset-' + item.key + '" onclick="resetField(\'' + item.key + '\')" title="Reset">&#x21ba;</button>';
        html += '</div>';
      } else if (item.type === 'toggle') {
        html += '<div class="fmt-row" data-fmt-key="' + item.key + '" onmouseenter="highlightFormatTarget(\'' + item.key + '\')" onmouseleave="clearFormatHighlight()">';
        html += '<span class="fmt-label">' + esc(item.label) + '</span>';
        html += '<input type="checkbox" class="fmt-check-input" id="fmt-' + item.key + '"' + (item.default ? ' checked' : '') + ' onchange="onFormatChange(\'' + item.key + '\', this.checked)">';
        html += '<button class="fmt-reset is-default" id="reset-' + item.key + '" onclick="resetField(\'' + item.key + '\')" title="Reset">&#x21ba;</button>';
        html += '</div>';
      } else if (item.type === 'range') {
        html += '<div class="fmt-row" data-fmt-key="' + item.key + '" onmouseenter="highlightFormatTarget(\'' + item.key + '\')" onmouseleave="clearFormatHighlight()">';
        html += '<span class="fmt-label">' + esc(item.label) + '</span>';
        html += '<input type="range" class="fmt-range-input" id="fmt-' + item.key + '" value="' + item.default + '" min="' + item.min + '" max="' + item.max + '" step="' + item.step + '" oninput="onFormatChange(\'' + item.key + '\', parseFloat(this.value))">';
        html += '<span class="fmt-range-val" id="rangeval-' + item.key + '">' + item.default + (item.suffix || '') + '</span>';
        html += '<button class="fmt-reset is-default" id="reset-' + item.key + '" onclick="resetField(\'' + item.key + '\')" title="Reset">&#x21ba;</button>';
        html += '</div>';
      } else if (item.type === 'color') {
        html += '<div class="fmt-color-row" data-fmt-key="' + item.key + '" onmouseenter="highlightFormatTarget(\'' + item.key + '\')" onmouseleave="clearFormatHighlight()">';
        html += '<span class="fmt-label">' + esc(item.label) + '</span>';
        html += '<input type="color" class="fmt-color-input" id="fmt-' + item.key + '" value="' + item.default + '" onchange="onFormatChange(\'' + item.key + '\', this.value)" oninput="onFormatChange(\'' + item.key + '\', this.value)">';
        html += '<input type="text" class="fmt-color-hex" id="hex-' + item.key + '" value="' + item.default + '" onchange="onHexChange(\'' + item.key + '\', this.value)" maxlength="7">';
        html += '<button class="fmt-reset is-default" id="reset-' + item.key + '" onclick="resetField(\'' + item.key + '\')" title="Reset">&#x21ba;</button>';
        html += '</div>';
      } else {
        html += '<div class="fmt-row" data-fmt-key="' + item.key + '" onmouseenter="highlightFormatTarget(\'' + item.key + '\')" onmouseleave="clearFormatHighlight()">';
        html += '<span class="fmt-label">' + esc(item.label) + '</span>';
        html += '<input type="number" class="fmt-input" id="fmt-' + item.key + '" value="' + item.default + '" step="' + item.step + '" min="0" onchange="onFormatChange(\'' + item.key + '\', parseFloat(this.value))" oninput="onFormatChange(\'' + item.key + '\', parseFloat(this.value))">';
        html += '<span class="fmt-unit">' + (item.suffix || item.unit) + '</span>';
        html += '<button class="fmt-reset is-default" id="reset-' + item.key + '" onclick="resetField(\'' + item.key + '\')" title="Reset">&#x21ba;</button>';
        html += '</div>';
      }
    }
    html += '</div></div>';
  }
  body.innerHTML = html;
}

function onFormatChange(key, value) {
  const meta = getItemMeta(key);
  if (!meta) return;
  state.currentFormat[key] = value;
  if (meta.type === 'color') {
    document.documentElement.style.setProperty('--' + key, value);
    document.getElementById('hex-' + key).value = value;
  } else if (meta.type === 'select' || meta.type === 'toggle') {
    /* Structural — handled by the renderPhoto() call below */
  } else {
    document.documentElement.style.setProperty('--' + key, value + (meta.unit || ''));
    if (meta.type === 'range') {
      const out = document.getElementById('rangeval-' + key);
      if (out) out.textContent = value + (meta.suffix || '');
    }
  }
  if (PHOTO_FORMAT_KEYS.indexOf(key) !== -1) renderPhoto();
  updateResetButtons();
  pulsePageHighlight();
  scheduleAutoSave();
}

function onHexChange(key, value) {
  /* Accept #RGB, #RRGGBB, with or without the leading # */
  var v = value.trim().replace(/^#/, '');
  var m = /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
  if (!m) return;
  var hex = m[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  var full = '#' + hex.toLowerCase();
  state.currentFormat[key] = full;
  document.getElementById('fmt-' + key).value = full;
  document.getElementById('hex-' + key).value = full;
  document.documentElement.style.setProperty('--' + key, full);
  updateResetButtons();
  pulsePageHighlight();
  scheduleAutoSave();
}

function resetField(key) {
  const meta = getItemMeta(key);
  if (!meta) return;
  state.currentFormat[key] = meta.default;
  const input = document.getElementById('fmt-' + key);
  if (meta.type === 'toggle') {
    if (input) input.checked = meta.default;
  } else if (meta.type === 'select') {
    if (input) input.value = meta.default;
  } else {
    if (input) input.value = meta.default;
    if (meta.type === 'color') {
      document.getElementById('hex-' + key).value = meta.default;
      document.documentElement.style.setProperty('--' + key, meta.default);
    } else {
      document.documentElement.style.setProperty('--' + key, meta.default + (meta.unit || ''));
      if (meta.type === 'range') {
        const out = document.getElementById('rangeval-' + key);
        if (out) out.textContent = meta.default + (meta.suffix || '');
      }
    }
  }
  if (PHOTO_FORMAT_KEYS.indexOf(key) !== -1) renderPhoto();
  updateResetButtons();
  pulsePageHighlight();
  scheduleAutoSave();
}

function syncUIFromFormat() {
  for (const [key, value] of Object.entries(state.currentFormat)) {
    const meta = getItemMeta(key);
    const input = document.getElementById('fmt-' + key);
    if (input) {
      if (meta && meta.type === 'toggle') input.checked = !!value;
      else input.value = value;
    }
    const hex = document.getElementById('hex-' + key);
    if (hex) hex.value = value;
    if (meta && meta.type === 'range') {
      const out = document.getElementById('rangeval-' + key);
      if (out) out.textContent = value + (meta.suffix || '');
    }
  }
  updateResetButtons();
}
