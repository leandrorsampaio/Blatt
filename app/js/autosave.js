/* ================================================================
 *  AUTO-SAVE -- Debounced save to localStorage (1.5s delay)
 * ================================================================ */

function scheduleAutoSave() {
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(runAutoSave, 1500);
}

/* Write a pending auto-save now (server sync needs localStorage up to date). */
function flushAutoSave() {
  if (state.autoSaveTimer) runAutoSave();
}

function runAutoSave() {
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = null;
  const active = getActiveContentName();
  if (document.getElementById('editor-view').classList.contains('active')) {
    state.currentMD = editorToMD();
  }
  if (active !== 'Default') {
    const presets = getContentPresets();
    presets[active] = state.currentMD;
    setContentPresets(presets);
  } else {
    /* Persist edits to the Default CV so they survive a reload */
    setDefaultMD(state.currentMD);
  }
  /* Also persist format */
  const fmtActive = getActivePresetName();
  if (fmtActive !== 'Default') {
    const fmtPresets = getPresets();
    fmtPresets[fmtActive] = { ...state.currentFormat };
    setPresets(fmtPresets);
  }
  const ind = document.getElementById('save-indicator');
  ind.textContent = 'Auto-saved';
  ind.classList.remove('unsaved');
  ind.classList.add('saving');
  setTimeout(function() { ind.classList.remove('saving'); }, 1200);
}
