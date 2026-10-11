/* ================================================================
 *  FIT TO SCREEN -- Scale A4 page to browser window
 * ================================================================ */

function applyFit() {
  const viewport = document.getElementById('viewport');
  if (state.fitted) {
    const pageWidthPx = 210 * 96 / 25.4;
    const pageHeightPx = 297 * 96 / 25.4;
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
