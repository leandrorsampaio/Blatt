/* ================================================================
 *  FORMAT PRESETS -- Save/load/import/export format configurations
 * ================================================================ */
function getPresets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

function setPresets(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function getActivePresetName() {
  return localStorage.getItem(ACTIVE_KEY) || 'Default';
}

function setActivePresetName(name) {
  localStorage.setItem(ACTIVE_KEY, name);
}

function refreshPresetSelect() {
  refreshLibraryIfOpen();
}

function loadPreset(name) {
  if (name === 'Default') {
    applyFormat(getDefaults());
  } else {
    const presets = getPresets();
    if (presets[name]) applyFormat(presets[name]);
  }
  setActivePresetName(name);
  setContentDesign(getActiveContentName(), name);
  syncUIFromFormat();
}

function savePreset() {
  const modal = document.getElementById('preset-modal');
  const input = document.getElementById('preset-name-input');
  const active = getActivePresetName();
  input.value = active === 'Default' ? '' : active;
  modal.classList.add('open');
  input.focus();
  input.select();
}

function closePresetModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('preset-modal').classList.remove('open');
}

function confirmSavePreset() {
  const name = document.getElementById('preset-name-input').value.trim();
  if (!name) return;
  if (name === 'Default') return;
  const presets = getPresets();
  presets[name] = { ...state.currentFormat };
  setPresets(presets);
  setActivePresetName(name);
  setContentDesign(getActiveContentName(), name);
  refreshPresetSelect();
  document.getElementById('preset-modal').classList.remove('open');
}

function deletePreset() {
  const active = getActivePresetName();
  if (active === 'Default') return;
  showConfirm('Delete design?', 'The design "' + active + '" will be permanently deleted.', 'Delete', function() {
    const presets = getPresets();
    delete presets[active];
    setPresets(presets);
    const links = getContentDesigns();
    Object.keys(links).forEach(function(cv) { if (links[cv] === active) links[cv] = 'Default'; });
    localStorage.setItem(CONTENT_DESIGNS, JSON.stringify(links));
    loadPreset('Default');
    refreshPresetSelect();
  });
}

function exportPreset() {
  const name = getActivePresetName();
  const data = { name: name, ...state.currentFormat };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name || 'format').replace(/\s+/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importPreset() {
  document.getElementById('import-input').click();
}

document.getElementById('import-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      const name = data.name || file.name.replace('.json', '');
      delete data.name;
      const defaults = getDefaults();
      const fmt = {};
      for (const key of Object.keys(defaults)) {
        fmt[key] = data[key] !== undefined ? data[key] : defaults[key];
      }
      const presets = getPresets();
      presets[name] = fmt;
      setPresets(presets);
      setActivePresetName(name);
      setContentDesign(getActiveContentName(), name);
      applyFormat(fmt);
      syncUIFromFormat();
      refreshPresetSelect();
    } catch (err) {
      showToast('Could not import file: invalid format', 'error');
    }
  };
  reader.readAsText(file);
  this.value = '';
});

/* Keyboard for preset modal */
document.getElementById('preset-name-input').addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closePresetModal();
  if (e.key === 'Enter') confirmSavePreset();
});
