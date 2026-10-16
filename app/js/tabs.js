/* ================================================================
 *  TAB SWITCHING -- Preview / Editor / Photo / ATS, and Configuration (the gear)
 * ================================================================ */
function switchTab(tab) {
  const btns = document.querySelectorAll('.tab-bar button');
  btns.forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const viewport = document.getElementById('viewport');
  const editorView = document.getElementById('editor-view');
  const photoView = document.getElementById('photo-view');
  const atsView = document.getElementById('ats-view');
  const configurationView = document.getElementById('configuration-view');
  const panel = document.getElementById('preview-panel');
  const formatPanel = document.querySelector('.format-panel');
  const formatToggle = document.getElementById('format-toggle');
  photoView.classList.toggle('active', tab === 'photo');
  atsView.classList.toggle('active', tab === 'ats');

  if (tab === 'preview') {
    viewport.classList.add('active');
    editorView.classList.remove('active');
    configurationView.classList.remove('active');
    panel.style.display = '';
    document.getElementById('page-nav').style.display = '';
    formatToggle.style.display = '';
    /* Restore format panel to its last user-chosen state (on a phone it opens closed) */
    if (isPhoneLayout()) state.formatPanelMinimized = true;
    if (!state.formatPanelMinimized) {
      formatPanel.classList.remove('hidden');
      viewport.classList.remove('full-width');
      formatToggle.innerHTML = '&#x25C0;';
    } else {
      formatPanel.classList.add('hidden');
      viewport.classList.add('full-width');
      formatToggle.innerHTML = '&#x25B6;';
    }
    /* Rebuild preview from editor if it was used */
    if (state.editorDirty) {
      state.currentMD = editorToMD();
    }
    renderCV(state.currentMD);
  } else if (tab === 'editor') {
    viewport.classList.remove('active');
    editorView.classList.add('active');
    configurationView.classList.remove('active');
    panel.style.display = 'none';
    document.getElementById('page-nav').style.display = 'none';
    formatPanel.classList.add('hidden');
    formatToggle.style.display = 'none';
    buildEditor(parseMD(state.currentMD));
  } else if (tab === 'photo') {
    viewport.classList.remove('active');
    editorView.classList.remove('active');
    configurationView.classList.remove('active');
    panel.style.display = 'none';
    document.getElementById('page-nav').style.display = 'none';
    formatPanel.classList.add('hidden');
    formatToggle.style.display = 'none';
    if (state.editorDirty) state.currentMD = editorToMD();
    buildPhotoView();
  } else if (tab === 'ats') {
    viewport.classList.remove('active');
    editorView.classList.remove('active');
    configurationView.classList.remove('active');
    panel.style.display = 'none';
    document.getElementById('page-nav').style.display = 'none';
    formatPanel.classList.add('hidden');
    formatToggle.style.display = 'none';
    if (state.editorDirty) state.currentMD = editorToMD();
    buildAtsView();
  } else if (tab === 'configuration') {
    viewport.classList.remove('active');
    editorView.classList.remove('active');
    configurationView.classList.add('active');
    panel.style.display = 'none';
    document.getElementById('page-nav').style.display = 'none';
    formatPanel.classList.add('hidden');
    formatToggle.style.display = 'none';
    if (state.editorDirty) state.currentMD = editorToMD();
    renderLibrary();
  }
}

function toggleFormatPanel() {
  state.formatPanelMinimized = !state.formatPanelMinimized;
  const formatPanel = document.querySelector('.format-panel');
  const viewport = document.getElementById('viewport');
  const toggle = document.getElementById('format-toggle');
  if (state.formatPanelMinimized) {
    formatPanel.classList.add('hidden');
    viewport.classList.add('full-width');
    toggle.innerHTML = '&#x25B6;';
  } else {
    formatPanel.classList.remove('hidden');
    viewport.classList.remove('full-width');
    toggle.innerHTML = '&#x25C0;';
  }
  if (state.fitted) applyFit();
}
