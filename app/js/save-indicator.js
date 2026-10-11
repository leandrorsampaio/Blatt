/* ================================================================
 *  SAVE INDICATOR -- Dirty/clean state tracking
 * ================================================================ */

function toggleAccordion(si) {
  state.editorAccordion[si] = !state.editorAccordion[si];
  var section = document.querySelector('.ed-section[data-si="' + si + '"]');
  if (section) section.classList.toggle('collapsed', !state.editorAccordion[si]);
}

function markDirty() {
  state.editorDirty = true;
  const ind = document.getElementById('save-indicator');
  ind.textContent = 'Unsaved changes';
  ind.classList.add('unsaved');
  scheduleAutoSave();
}

function markClean() {
  state.editorDirty = false;
  const ind = document.getElementById('save-indicator');
  ind.textContent = 'Saved automatically';
  ind.classList.remove('unsaved');
}
