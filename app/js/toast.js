/* ================================================================
 *  TOAST -- Visible feedback for user actions
 * ================================================================ */
var toastTimer = null;
function showToast(message, type) {
  var existing = document.getElementById('app-toast');
  if (existing) existing.remove();
  clearTimeout(toastTimer);
  var el = document.createElement('div');
  el.id = 'app-toast';
  el.className = 'toast ' + (type || 'success');
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.classList.add('visible'); });
  });
  toastTimer = setTimeout(function() {
    el.classList.remove('visible');
    setTimeout(function() { if (el.parentNode) el.remove(); }, 200);
  }, 3000);
}
