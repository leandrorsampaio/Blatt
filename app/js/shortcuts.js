/* ================================================================
 *  KEYBOARD SHORTCUTS -- Ctrl+S (save), Ctrl+P (download PDF)
 * ================================================================ */
document.addEventListener('keydown', function(e) {
  /* Ctrl+S / Cmd+S → Quick save */
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    quickSaveContent();
    syncPoll(true);
    return;
  }
  /* Ctrl+P / Cmd+P → Download PDF */
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    openDownloadModal();
    return;
  }
});
