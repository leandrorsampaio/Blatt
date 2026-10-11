/* ================================================================
 *  CONFIRM DIALOG
 * ================================================================ */

function showConfirm(title, message, btnLabel, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok-btn').textContent = btnLabel || 'Delete';
  state.confirmCallback = callback;
  document.getElementById('confirm-overlay').classList.add('open');
}

function closeConfirm(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('confirm-overlay').classList.remove('open');
  state.confirmCallback = null;
}

function executeConfirm() {
  if (state.confirmCallback) state.confirmCallback();
  document.getElementById('confirm-overlay').classList.remove('open');
  state.confirmCallback = null;
}

document.addEventListener('keydown', function(e) {
  const overlay = document.getElementById('confirm-overlay');
  if (!overlay.classList.contains('open')) return;
  if (e.key === 'Escape') closeConfirm();
  if (e.key === 'Enter') executeConfirm();
});
