/* ================================================================
 *  FIT TO SCREEN -- Scale A4 page to browser window
 * ================================================================ */

/* Phones get their own layout (app.css, same breakpoint): they open on the Editor,
   the Preview tab shows a card with a thumbnail of page 1, and the CV itself opens
   full screen, every page at the screen's width, scrolling down like a PDF. */
var PHONE_QUERY = window.matchMedia('(max-width: 760px)');
function isPhoneLayout() { return PHONE_QUERY.matches; }

const PAGE_WIDTH_PX = 210 * 96 / 25.4;

function applyFit() {
  const viewport = document.getElementById('viewport');
  if (isPhoneLayout()) {
    /* No scaling: the card shows a thumbnail, and full screen zooms each page (app.css) */
    viewport.style.transform = '';
    viewport.style.height = '';
    document.documentElement.style.setProperty('--cv-full-zoom', String((window.innerWidth - 16) / PAGE_WIDTH_PX));
    return;
  }
  if (state.fitted) {
    const pageHeightPx = 297 * 96 / 25.4;
    const toolbarHeight = 60;
    const padding = 40;
    const fmtPanel = document.querySelector('.format-panel');
    const panelWidth = (fmtPanel && fmtPanel.classList.contains('hidden')) ? 0 : 280;
    const availW = window.innerWidth - panelWidth - padding * 2;
    const availH = window.innerHeight - toolbarHeight - padding;
    const scale = Math.min(availW / PAGE_WIDTH_PX, availH / pageHeightPx, 1);
    viewport.style.transform = 'scale(' + scale + ')';
    viewport.style.transformOrigin = 'top center';
    viewport.style.height = (pageHeightPx * scale + toolbarHeight + padding) + 'px';
  } else {
    viewport.style.transform = '';
    viewport.style.height = '';
  }
}

/* On a phone the format panel starts closed and the Editor comes first */
function initPhoneLayout() {
  if (!isPhoneLayout()) return;
  state.formatPanelMinimized = true;
  document.querySelector('.format-panel').classList.add('hidden');
  document.getElementById('viewport').classList.add('full-width');
  document.getElementById('format-toggle').innerHTML = '&#x25B6;';
}

/* ── Phone: the CV card and the full-screen CV ── */

/* The card's thumbnail is a copy of page 1, without ids so nothing finds it instead of the real page */
function renderPhoneCard() {
  const frame = document.getElementById('phone-cv-thumb-frame');
  if (!isPhoneLayout()) { frame.replaceChildren(); return; }
  const clone = document.getElementById('page').cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(function(el) { el.removeAttribute('id'); });
  /* As large as fits between the tab bar, the name and button below, and the toolbar */
  const width = Math.max(160, Math.min(300, window.innerWidth - 32, (window.innerHeight - 300) / Math.SQRT2));
  const scale = width / PAGE_WIDTH_PX;
  clone.style.cssText = 'transform:scale(' + scale + ')';
  frame.style.width = width + 'px';
  frame.style.height = (width * Math.SQRT2) + 'px';
  frame.replaceChildren(clone);
  const pages = state.totalPages === 1 ? '1 page' : state.totalPages + ' pages';
  document.getElementById('phone-cv-name').textContent = state.showingTemplate ? 'Blank template' : (state.currentName || 'Your CV');
  document.getElementById('phone-cv-pages').textContent = 'A4 · ' + pages;
  document.getElementById('cv-full-title').textContent = pages;
}

function isCvFullscreen() { return document.body.classList.contains('cv-full-open'); }

/* The phone's Back button closes the full-screen CV instead of leaving Blatt */
function openCvFullscreen() {
  if (isCvFullscreen()) return;
  applyFit();
  document.body.classList.add('cv-full-open');
  document.getElementById('viewport').classList.add('cv-full');
  document.getElementById('viewport').scrollTop = 0;
  history.pushState({ blattCvFull: true }, '');
}

function closeCvFullscreen(fromHistory) {
  if (!isCvFullscreen()) return;
  if (!state.formatPanelMinimized) toggleFormatPanel();
  document.body.classList.remove('cv-full-open');
  document.getElementById('viewport').classList.remove('cv-full');
  renderPhoneCard();
  if (!fromHistory && history.state && history.state.blattCvFull) history.back();
}

window.addEventListener('popstate', function() { closeCvFullscreen(true); });

function toggleFit() {
  state.fitted = !state.fitted;
  const btn = document.getElementById('fit-btn');
  btn.querySelector('span').textContent = state.fitted ? 'Real Size' : 'Fit to Screen';
  if (state.fitted) btn.classList.add('active'); else btn.classList.remove('active');
  applyFit();
}

/* A phone's address bar showing or hiding resizes the window too: only a new width
   (turning the phone) redraws the card */
var lastWidth = window.innerWidth;
window.addEventListener('resize', function() {
  if (state.fitted || isPhoneLayout()) applyFit();
  if (isPhoneLayout() && window.innerWidth !== lastWidth) renderPhoneCard();
  lastWidth = window.innerWidth;
});
PHONE_QUERY.addEventListener('change', function() {
  if (!isPhoneLayout()) closeCvFullscreen();
  applyFit();
  renderPhoneCard();
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
  renderPhoneCard();
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
  renderPhoneCard();
}
