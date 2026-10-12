/* ================================================================
 *  LIBRARY -- Configuration (the gear in the tab bar): CV versions and designs
 * ================================================================ */

function refreshLibraryIfOpen() {
  const view = document.getElementById('configuration-view');
  if (view && view.classList.contains('active')) renderLibrary();
}

function renderLibrary() {
  const activeContent = getActiveContentName();
  const activeDesign = getActivePresetName();
  const content = getContentPresets();
  const designs = getPresets();
  const contentList = document.getElementById('library-content-list');
  const designList = document.getElementById('library-design-list');
  const currentDesign = document.getElementById('library-current-design');
  if (!contentList || !designList) return;
  const contentNames = ['Default'].concat(Object.keys(content).sort());
  const designNames = ['Default'].concat(Object.keys(designs).sort());
  currentDesign.textContent = 'Using: ' + activeDesign;
  contentList.innerHTML = contentNames.map(function(name) {
    const current = name === activeContent;
    return '<div class="library-item' + (current ? ' current' : '') + '">' +
      '<span class="library-item-name" title="' + esc(name) + '">' + esc(name) + '</span>' +
      (current ? '<span class="library-badge">Current</span>' : '<button onclick="loadContentPreset(' + JSON.stringify(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + ')">Use</button>') +
      '<button class="library-danger" onclick="deleteContentVersion(' + JSON.stringify(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + ')" title="' + (name === 'Default' ? 'Restore the original CV' : 'Delete CV version') + '">' + (name === 'Default' ? 'Reset' : 'Delete') + '</button>' +
      '</div>';
  }).join('');
  designList.innerHTML = designNames.map(function(name) {
    const current = name === activeDesign;
    return '<div class="library-item' + (current ? ' current' : '') + '">' +
      '<span class="library-item-name" title="' + esc(name) + '">' + esc(name) + '</span>' +
      (current ? '<span class="library-badge">Current</span>' : '<button onclick="useDesign(' + JSON.stringify(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + ')">Use</button>') +
      '<button class="library-danger" onclick="deleteDesign(' + JSON.stringify(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + ')" title="' + (name === 'Default' ? 'Restore default design' : 'Delete design') + '">' + (name === 'Default' ? 'Reset' : 'Delete') + '</button>' +
      '</div>';
  }).join('');
}

function deleteContentVersion(name) {
  if (name === 'Default') { deleteContentPreset(); return; }
  if (name !== getActiveContentName()) {
    showConfirm('Delete CV version?', 'The CV version "' + name + '" will be permanently deleted.', 'Delete', function() {
      const presets = getContentPresets();
      delete presets[name];
      setContentPresets(presets);
      const links = getContentDesigns(); delete links[name]; localStorage.setItem(CONTENT_DESIGNS, JSON.stringify(links));
      setContentMeta(name, null);
      renderLibrary();
    });
    return;
  }
  deleteContentPreset();
}

function useDesign(name) {
  loadPreset(name);
  setContentDesign(getActiveContentName(), name);
  renderLibrary();
}

function deleteDesign(name) {
  if (name === 'Default') { useDesign('Default'); return; }
  if (name !== getActivePresetName()) {
    showConfirm('Delete design?', 'The design "' + name + '" will be permanently deleted.', 'Delete', function() {
      const presets = getPresets(); delete presets[name]; setPresets(presets);
      const links = getContentDesigns();
      Object.keys(links).forEach(function(cv) { if (links[cv] === name) links[cv] = 'Default'; });
      localStorage.setItem(CONTENT_DESIGNS, JSON.stringify(links));
      renderLibrary();
    });
    return;
  }
  deletePreset();
}
