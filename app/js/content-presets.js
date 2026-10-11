/* ================================================================
 *  CONTENT PRESETS -- Save/load/import/export CV content versions
 * ================================================================ */
const CONTENT_STORAGE = 'cv-content-presets';
const CONTENT_ACTIVE = 'cv-content-active';
const CONTENT_DEFAULT = 'cv-content-default'; /* persisted edits to the Default CV */
const CONTENT_DESIGNS = 'cv-content-designs'; /* CV version name -> design name */

function getContentPresets() {
  try { return JSON.parse(localStorage.getItem(CONTENT_STORAGE)) || {}; } catch { return {}; }
}
function setContentPresets(p) { localStorage.setItem(CONTENT_STORAGE, JSON.stringify(p)); }
function getUniqueContentName(name, presets) {
  const base = (name || 'Imported CV').trim() || 'Imported CV';
  /* "Default" is reserved for the built-in CV, even when it is not in presets. */
  if (base !== 'Default' && !Object.prototype.hasOwnProperty.call(presets, base)) return base;
  let index = 1;
  while (Object.prototype.hasOwnProperty.call(presets, base + ' (' + index + ')')) index++;
  return base + ' (' + index + ')';
}
function getActiveContentName() { return localStorage.getItem(CONTENT_ACTIVE) || 'Default'; }
function setActiveContentName(n) { localStorage.setItem(CONTENT_ACTIVE, n); }
/* Default CV content: the user's saved edits if present, else the embedded pristine copy */
function getDefaultMD() {
  return localStorage.getItem(CONTENT_DEFAULT) || document.getElementById('cv-default-data').textContent;
}
function setDefaultMD(md) { localStorage.setItem(CONTENT_DEFAULT, md); }
function getContentDesigns() {
  try { return JSON.parse(localStorage.getItem(CONTENT_DESIGNS)) || {}; } catch { return {}; }
}
function setContentDesign(name, design) {
  const designs = getContentDesigns();
  designs[name] = design;
  localStorage.setItem(CONTENT_DESIGNS, JSON.stringify(designs));
}
function getContentDesign(name) { return getContentDesigns()[name] || 'Default'; }

function refreshContentPresetSelect() {
  refreshLibraryIfOpen();
}

function loadContentPreset(name) {
  if (name === 'Default') {
    state.currentMD = getDefaultMD();
  } else {
    const presets = getContentPresets();
    if (presets[name]) state.currentMD = presets[name];
  }
  setActiveContentName(name);
  loadPreset(getContentDesign(name));
  renderCV(state.currentMD);
  markClean();
  refreshLibraryIfOpen();
}

function saveContentPreset() {
  /* Collect current state from editor if on editor tab */
  if (document.getElementById('editor-view').classList.contains('active')) {
    state.currentMD = editorToMD();
  }
  const modal = document.getElementById('content-preset-modal');
  const input = document.getElementById('content-preset-name');
  const active = getActiveContentName();
  input.value = active === 'Default' ? '' : active;
  modal.classList.add('open');
  input.focus();
  input.select();
}

function closeContentPresetModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('content-preset-modal').classList.remove('open');
}

function confirmSaveContentPreset() {
  const name = document.getElementById('content-preset-name').value.trim();
  if (!name || name === 'Default') return;
  const presets = getContentPresets();
  presets[name] = state.currentMD;
  setContentPresets(presets);
  setContentMeta(name, getContentMeta(getActiveContentName()));
  setActiveContentName(name);
  setContentDesign(name, getActivePresetName());
  refreshContentPresetSelect();
  document.getElementById('content-preset-modal').classList.remove('open');
  renderCV(state.currentMD);
  markClean();
}

/* Quick save: updates the active content preset without modal */
function quickSaveContent() {
  if (document.getElementById('editor-view').classList.contains('active')) {
    state.currentMD = editorToMD();
  }
  const active = getActiveContentName();
  if (active === 'Default') {
    setDefaultMD(state.currentMD);
  } else {
    const presets = getContentPresets();
    presets[active] = state.currentMD;
    setContentPresets(presets);
  }
  renderCV(state.currentMD);
  markClean();
}

function deleteContentPreset() {
  const active = getActiveContentName();
  if (active === 'Default') {
    /* Default has no separate copy to delete — offer to reset it to the original */
    showConfirm('Reset Default CV?', 'Your edits to the Default CV will be discarded and the original content restored.', 'Reset', function() {
      localStorage.removeItem(CONTENT_DEFAULT);
      setContentMeta('Default', null);
      loadContentPreset('Default');
      refreshContentPresetSelect();
    });
    return;
  }
  showConfirm('Delete CV content?', 'The saved CV "' + active + '" will be permanently deleted.', 'Delete', function() {
    const presets = getContentPresets();
    delete presets[active];
    setContentPresets(presets);
    const designs = getContentDesigns();
    delete designs[active];
    localStorage.setItem(CONTENT_DESIGNS, JSON.stringify(designs));
    setContentMeta(active, null);
    loadContentPreset('Default');
    refreshContentPresetSelect();
  });
}

function exportContentPreset() {
  const name = getActiveContentName();
  if (document.getElementById('editor-view').classList.contains('active')) {
    state.currentMD = editorToMD();
  }
  const data = { name: name, md: state.currentMD };
  const meta = getContentMeta(name);
  if (Object.keys(meta).length) data.meta = meta;
  /* One photo is shared by every CV version, so a backup carries it along. */
  if (state.photo && state.photo.image && !state.photo.placeholder) data.photo = state.photo;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name || 'cv-content').replace(/\s+/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importContentPreset() {
  document.getElementById('content-import-input').click();
}

document.getElementById('content-import-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      const presets = getContentPresets();
      const requestedName = data.name || file.name.replace('.json', '');
      const name = getUniqueContentName(requestedName, presets);
      presets[name] = data.md;
      setContentPresets(presets);
      setActiveContentName(name);
      setContentDesign(name, getActivePresetName());
      setContentMeta(name, data.meta);
      state.currentMD = data.md;
      if (data.photo && typeof data.photo === 'object' && data.photo.image) {
        state.photo = normalizePhoto(data.photo);
        state.photoImg = null;
        savePhoto();
      }
      renderCV(state.currentMD);
      refreshContentPresetSelect();
      markClean();
      showToast('Imported as "' + name + '"');
    } catch (err) { showToast('Could not import file: invalid format', 'error'); }
  };
  reader.readAsText(file);
  this.value = '';
});
