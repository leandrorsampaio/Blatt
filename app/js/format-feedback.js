/* ================================================================
 *  FORMAT PULSE -- Visual feedback on format changes
 * ================================================================ */
function pulsePageHighlight() {
  var pages = document.querySelectorAll('#viewport .page, #viewport .page-extra');
  pages.forEach(function(page) {
    page.classList.remove('format-pulse');
    void page.offsetWidth;
    page.classList.add('format-pulse');
  });
}

/* ================================================================
 *  FORMAT HIGHLIGHT -- Hover on format controls highlights CV elements
 * ================================================================ */
var FORMAT_HIGHLIGHT_MAP = {
  'color-blue':      '.header h1, .sidebar h2, .main h2, .entry-org, .blue-bar, .page-extra-header, .page-extra-content h2, .page-extra-content .entry-org',
  'color-black':     '.header h1, .entry-role .role, .entry-detail strong, .page-extra-content .entry-role .role, .page-extra-content .entry-detail strong',
  'color-grey':      '.header .subtitle, .entry-role .dates, .entry-detail, .sidebar p, .sidebar ul li, .sidebar .contact-item, .page-extra-content .entry-role .dates, .page-extra-content .entry-detail',
  'fs-name':         '.header h1',
  'fs-heading':      '.header h1 .degree, .main h2, .page-extra-content h2',
  'fs-subtitle':     '.header .subtitle',
  'fs-sidebar-title':'.sidebar h2',
  'fs-org':          '.entry-org, .page-extra-content .entry-org',
  'fs-body':         '.entry-role .role, .sidebar .sidebar-item',
  'fs-small':        '.entry-detail, .entry-detail-list, .entry-role .dates, .sidebar p, .sidebar a, .sidebar .contact-item, .sidebar ul li, .page-extra-content .entry-detail, .page-extra-content .entry-detail-list, .page-extra-content .entry-role .dates',
  'bullet-indent':   '.entry-detail-list, .sidebar ul li, .page-extra-content .entry-detail-list',
  'sidebar-width':   '.sidebar',
  'bar-width':       '.blue-bar',
  'photo-position':     '.cv-photo',
  'photo-size':         '.cv-photo',
  'photo-border':       '.cv-photo',
  'photo-border-width': '.cv-photo',
};

/* Spacing keys use overlay visualization instead of element highlighting */
var SPACING_KEYS = ['page-margin-top', 'page-margin-right', 'page-margin-bottom', 'page-margin-left', 'col-gap', 'content-gap', 'sidebar-gap', 'heading-gap', 'entry-gap', 'sub-entry-gap', 'line-height'];

function highlightFormatTarget(key) {
  /* A tap fires mouseenter but no mouseleave: the highlight would stay on */
  if (window.matchMedia('(hover: none)').matches) return;
  if (SPACING_KEYS.indexOf(key) !== -1) {
    showSpacingOverlays(key);
    return;
  }
  var selector = FORMAT_HIGHLIGHT_MAP[key];
  if (!selector) return;
  var viewport = document.getElementById('viewport');
  viewport.querySelectorAll(selector).forEach(function(el) {
    el.classList.add('fmt-highlight');
  });
}

function clearFormatHighlight() {
  document.querySelectorAll('.fmt-highlight').forEach(function(el) {
    el.classList.remove('fmt-highlight');
  });
  clearSpacingOverlays();
}

/* ── Spacing overlays ── */
var spacingOverlays = [];

function clearSpacingOverlays() {
  spacingOverlays.forEach(function(el) { if (el.parentNode) el.parentNode.removeChild(el); });
  spacingOverlays = [];
}

function createOverlay(left, top, width, height, label) {
  if (width < 1 || height < 1) return;
  var div = document.createElement('div');
  div.className = 'fmt-spacing-overlay';
  div.style.left = left + 'px';
  div.style.top = top + 'px';
  div.style.width = width + 'px';
  div.style.height = height + 'px';
  if (label) div.innerHTML = '<span class="fmt-spacing-label">' + label + '</span>';
  document.body.appendChild(div);
  spacingOverlays.push(div);
}

function showSpacingOverlays(key) {
  clearSpacingOverlays();
  var viewport = document.getElementById('viewport');
  var pages = viewport.querySelectorAll('.page, .page-extra');

  if (key === 'col-gap') {
    /* Show the gap between sidebar and main columns */
    var sidebar = viewport.querySelector('.page .sidebar');
    var main = viewport.querySelector('.page .main');
    if (!sidebar || !main) return;
    var sStyle = getComputedStyle(sidebar);
    var mStyle = getComputedStyle(main);
    var sRect = sidebar.getBoundingClientRect();
    var mRect = main.getBoundingClientRect();
    var gapLeft = sRect.right - parseFloat(sStyle.paddingRight);
    var gapRight = mRect.left + parseFloat(mStyle.paddingLeft);
    var gapTop = Math.min(sRect.top, mRect.top);
    var gapBottom = Math.max(sRect.bottom, mRect.bottom);
    var val = getComputedStyle(document.documentElement).getPropertyValue('--col-gap').trim();
    createOverlay(gapLeft, gapTop, gapRight - gapLeft, gapBottom - gapTop, val);
  }

  else if (key === 'page-margin-top') {
    pages.forEach(function(page) {
      var pRect = page.getBoundingClientRect();
      var val = getComputedStyle(document.documentElement).getPropertyValue('--page-margin-top').trim();
      var m = parseFloat(val) * 96 / 25.4;
      createOverlay(pRect.left, pRect.top, pRect.width, m, val);
    });
  }

  else if (key === 'page-margin-bottom') {
    pages.forEach(function(page) {
      var pRect = page.getBoundingClientRect();
      var val = getComputedStyle(document.documentElement).getPropertyValue('--page-margin-bottom').trim();
      var m = parseFloat(val) * 96 / 25.4;
      createOverlay(pRect.left, pRect.bottom - m, pRect.width, m, val);
    });
  }

  else if (key === 'page-margin-left') {
    pages.forEach(function(page) {
      var pRect = page.getBoundingClientRect();
      var val = getComputedStyle(document.documentElement).getPropertyValue('--page-margin-left').trim();
      var m = parseFloat(val) * 96 / 25.4;
      createOverlay(pRect.left, pRect.top, m, pRect.height, val);
    });
  }

  else if (key === 'page-margin-right') {
    pages.forEach(function(page) {
      var pRect = page.getBoundingClientRect();
      var val = getComputedStyle(document.documentElement).getPropertyValue('--page-margin-right').trim();
      var m = parseFloat(val) * 96 / 25.4;
      createOverlay(pRect.right - m, pRect.top, m, pRect.height, val);
    });
  }

  else if (key === 'content-gap') {
    viewport.querySelectorAll('.spacer-content').forEach(function(el) { el.classList.add('fmt-highlight'); });
  }

  else if (key === 'sidebar-gap') {
    viewport.querySelectorAll('.spacer-sidebar').forEach(function(el) { el.classList.add('fmt-highlight'); });
  }

  else if (key === 'heading-gap') {
    viewport.querySelectorAll('.spacer-heading').forEach(function(el) { el.classList.add('fmt-highlight'); });
  }

  else if (key === 'entry-gap') {
    viewport.querySelectorAll('.spacer-entry').forEach(function(el) { el.classList.add('fmt-highlight'); });
  }

  else if (key === 'sub-entry-gap') {
    viewport.querySelectorAll('.spacer-sub').forEach(function(el) { el.classList.add('fmt-highlight'); });
  }

  else if (key === 'line-height') {
    viewport.querySelectorAll('.entry-detail, .entry-detail-list, .entry-role, .sidebar p, .sidebar ul, .sidebar .contact-item').forEach(function(el) {
      el.classList.add('fmt-highlight');
    });
  }
}
