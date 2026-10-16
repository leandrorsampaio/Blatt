/* ================================================================
 *  STORAGE VERSION -- Schema versioning for future migrations
 * ================================================================ */
var STORAGE_VERSION = 3;

function migrateStorage() {
  var current = parseInt(localStorage.getItem('cv-storage-version') || '0', 10);
  if (current >= STORAGE_VERSION) return;

  /* v2: "Default" is a built-in CV, not a saved preset. Older imports could
     create a second Default item; rename that imported copy safely. */
  if (current < 2) {
    try {
      const presets = JSON.parse(localStorage.getItem(CONTENT_STORAGE)) || {};
      if (Object.prototype.hasOwnProperty.call(presets, 'Default')) {
        const repairedName = getUniqueContentName('Default', presets);
        presets[repairedName] = presets.Default;
        delete presets.Default;
        setContentPresets(presets);
      }
    } catch (err) { /* Keep malformed legacy storage untouched. */ }
  }

  /* v3: the old rich-text converter saved pasted non-breaking spaces as a literal "&nbsp;" */
  if (current < 3) {
    try {
      var fixNbsp = function(md) { return typeof md === 'string' ? md.replace(/&nbsp;/g, ' ') : md; };
      if (localStorage.getItem(CONTENT_DEFAULT)) setDefaultMD(fixNbsp(localStorage.getItem(CONTENT_DEFAULT)));
      const presets = getContentPresets();
      Object.keys(presets).forEach(function(k) { presets[k] = fixNbsp(presets[k]); });
      if (Object.keys(presets).length) setContentPresets(presets);
    } catch (err) { /* Keep malformed legacy storage untouched. */ }
  }

  localStorage.setItem('cv-storage-version', String(STORAGE_VERSION));
}

/* ================================================================
 *  BOOT -- Initialization sequence
 * ================================================================ */
migrateStorage();
initPhoto();
buildDrawerUI();

/* Load saved format preset or defaults */
(function() {
  const active = getActivePresetName();
  const presets = getPresets();
  if (active !== 'Default' && presets[active]) {
    applyFormat(presets[active]);
  } else {
    applyFormat(getDefaults());
  }
  syncUIFromFormat();
  refreshPresetSelect();
})();

/* Load saved CV version and its remembered design, if it has one. */
state.currentMD = getDefaultMD();
(function() {
  const active = getActiveContentName();
  const presets = getContentPresets();
  if (active !== 'Default' && presets[active]) {
    state.currentMD = presets[active];
  }
  const rememberedDesign = getContentDesign(active);
  const formatPresets = getPresets();
  if (rememberedDesign === 'Default' || formatPresets[rememberedDesign]) {
    loadPreset(rememberedDesign);
  }
  refreshContentPresetSelect();
})();

initPhoneLayout();
renderCV(state.currentMD);
applyFit();
initServerSync();
