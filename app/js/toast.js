/* ================================================================
 *  TOAST -- Visible feedback for user actions
 * ================================================================ */
var toastTimer = null;
/* action (optional): { label, run } adds a button, e.g. Undo, and keeps the toast up longer */
function showToast(message, type, action) {
  var existing = document.getElementById('app-toast');
  if (existing) existing.remove();
  clearTimeout(toastTimer);
  var el = document.createElement('div');
  el.id = 'app-toast';
  el.className = 'toast ' + (type || 'success');
  el.setAttribute('role', 'status');
  el.textContent = message;
  if (action) {
    var btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.onclick = function() { el.remove(); action.run(); };
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.classList.add('visible'); });
  });
  toastTimer = setTimeout(function() {
    el.classList.remove('visible');
    setTimeout(function() { if (el.parentNode) el.remove(); }, 200);
  }, action ? 12000 : 3000);
}
