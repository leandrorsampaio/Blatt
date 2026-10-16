/* ================================================================
 *  FIT TO SCREEN -- Scale A4 page to browser window
 * ================================================================ */

/* Phones get their own layout (app.css, same breakpoint): a bottom toolbar, the
   format panel as a bottom sheet, the editor in one column. */
var PHONE_QUERY = window.matchMedia('(max-width: 760px)');
function isPhoneLayout() { return PHONE_QUERY.matches; }

function applyFit() {
  const viewport = document.getElementById('viewport');
  const pageWidthPx = 210 * 96 / 25.4;
  const pageHeightPx = 297 * 96 / 25.4;
  if (state.fitted && isPhoneLayout()) {
    /* The scaled page sits below the tab bar and above the toolbar or the open
       format sheet. The viewport is scaled from its top left corner, so its
       padding is set in unscaled pixels to land the page there. */
    const top = 44 + 12;
    const sheet = document.querySelector('.format-panel');
    const below = sheet && !sheet.classList.contains('hidden') ? sheet.getBoundingClientRect().height
      : document.getElementById('preview-panel').offsetHeight;
    const availW = window.innerWidth - 16;
    const availH = window.innerHeight - top - below - 12;
    const scale = Math.min(availW / pageWidthPx, availH / pageHeightPx, 1);
    viewport.classList.add('phone-fit');
    viewport.style.transform = 'scale(' + scale + ')';
    viewport.style.transformOrigin = 'top left';
    viewport.style.paddingTop = (top / scale) + 'px';
    viewport.style.paddingLeft = ((window.innerWidth - pageWidthPx * scale) / 2 / scale) + 'px';
    viewport.style.height = window.innerHeight + 'px';
    return;
  }
  viewport.classList.remove('phone-fit');
  viewport.style.paddingTop = '';
  viewport.style.paddingLeft = '';
  if (state.fitted) {
    const toolbarHeight = 60;
    const padding = 40;
    const fmtPanel = document.querySelector('.format-panel');
    const panelWidth = (fmtPanel && fmtPanel.classList.contains('hidden')) ? 0 : 280;
    const availW = window.innerWidth - panelWidth - padding * 2;
    const availH = window.innerHeight - toolbarHeight - padding;
    const scale = Math.min(availW / pageWidthPx, availH / pageHeightPx, 1);
    viewport.style.transform = 'scale(' + scale + ')';
    viewport.style.transformOrigin = 'top center';
    viewport.style.height = (pageHeightPx * scale + toolbarHeight + padding) + 'px';
  } else {
    viewport.style.transform = '';
    viewport.style.height = '';
  }
}

/* On a phone the format panel starts closed: it would cover the page */
function initPhoneLayout() {
  if (!isPhoneLayout()) return;
  state.formatPanelMinimized = true;
  document.querySelector('.format-panel').classList.add('hidden');
  document.getElementById('viewport').classList.add('full-width');
  document.getElementById('format-toggle').innerHTML = '&#x25B6;';
}

function toggleFit() {
  state.fitted = !state.fitted;
  const btn = document.getElementById('fit-btn');
  btn.querySelector('span').textContent = state.fitted ? 'Real Size' : 'Fit to Screen';
  if (state.fitted) btn.classList.add('active'); else btn.classList.remove('active');
  applyFit();
}

window.addEventListener('resize', function() {
  if (state.fitted) applyFit();
});
PHONE_QUERY.addEventListener('change', function() { applyFit(); });

/* ================================================================
 *  PAGE NAVIGATION -- Multi-page browsing
 * ================================================================ */

function updatePageNav() {
  const pages = document.querySelectorAll('#viewport .page, #viewport .page-extra');
  state.totalPages = pages.length;
  if (state.currentPage > state.totalPages) state.currentPage = state.totalPages;
  if (state.currentPage < 1) state.currentPage = 1;
  var nav = document.getElementById('page-nav');
  nav.style.display = state.totalPages > 1 ? 'flex' : 'none';
  document.getElementById('page-nav-label').textContent = state.currentPage + ' / ' + state.totalPages;
  document.getElementById('page-prev-btn').disabled = (state.currentPage <= 1);
  document.getElementById('page-next-btn').disabled = (state.currentPage >= state.totalPages);
  /* Show only current page */
  pages.forEach(function(p, i) {
    p.style.display = (i + 1 === state.currentPage) ? '' : 'none';
  });
}

function goToPage(n) {
  if (n < 1 || n > state.totalPages) return;
  state.currentPage = n;
  updatePageNav();
  if (state.fitted) applyFit();
}

/* Arrow keys for page flip (only when not in an input/textarea/contenteditable) */
document.addEventListener('keydown', function(e) {
  if (state.totalPages <= 1) return;
  var tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.isContentEditable) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); goToPage(state.currentPage - 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); goToPage(state.currentPage + 1); }
});

/* Swipe left or right on the fitted page to turn it. Not while pinch-zoomed in:
   then a swipe pans the zoomed page. */
(function() {
  var start = null;
  var viewport = document.getElementById('viewport');
  viewport.addEventListener('touchstart', function(e) {
    start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  viewport.addEventListener('touchend', function(e) {
    if (!start || !state.fitted || state.totalPages <= 1) return;
    if (window.visualViewport && window.visualViewport.scale > 1.05) return;
    var dx = e.changedTouches[0].clientX - start.x;
    var dy = e.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goToPage(state.currentPage + (dx < 0 ? 1 : -1));
  });
})();

/* ================================================================
 *  TEMPLATE TOGGLE -- Switch between user data and blank template
 * ================================================================ */

function toggleTemplate() {
  const btn = document.getElementById('toggle-btn');
  if (state.showingTemplate) {
    renderCV(state.currentMD);
    btn.querySelector('span').textContent = 'Show Template';
    btn.classList.remove('active');
  } else {
    renderCV(document.getElementById('cv-template-data').textContent);
    btn.querySelector('span').textContent = 'Show My CV';
    btn.classList.add('active');
  }
  state.showingTemplate = !state.showingTemplate;
}
