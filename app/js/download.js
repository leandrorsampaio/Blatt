/* ================================================================
 *  DOWNLOAD / PDF -- PDF export via html2pdf.js (lazy-loaded)
 * ================================================================ */
var html2pdfLoaded = null;
function loadHtml2Pdf() {
  if (!html2pdfLoaded) html2pdfLoaded = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'app/vendor/html2pdf.bundle.min.js';
    s.onload = resolve;
    s.onerror = function() {
      html2pdfLoaded = null;
      s.remove();
      showToast('The PDF maker is missing: keep the app folder next to cv.html', 'error');
      reject(new Error('html2pdf.js did not load'));
    };
    document.head.appendChild(s);
  });
  return html2pdfLoaded;
}

function openDownloadModal() {
  const modal = document.getElementById('download-modal');
  const input = document.getElementById('pdf-filename');
  if (!input.value) input.value = cvMeta().filename;
  modal.classList.add('open');
  input.focus();
  input.select();
}

function closeDownloadModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('download-modal').classList.remove('open');
}

/* oneColumn: the sidebar stacks above the main column and the pages flow freely,
   so no parser can run the two columns together. Same fonts and colours. */
function printCV(oneColumn) {
  closeDownloadModal();

  /* Collect all page elements */
  var pages = document.querySelectorAll('#viewport .page, #viewport .page-extra');
  if (!pages.length) return;

  /* Grab current CSS variables from :root so the print reflects current formatting */
  var cssVars = '';
  for (var g of FORMAT_SCHEMA) {
    for (var item of g.items) {
      var val = getComputedStyle(document.documentElement).getPropertyValue('--' + item.key).trim();
      if (val) cssVars += '--' + item.key + ':' + val + ';';
    }
  }

  /* Link the app's stylesheets (fonts + all CV CSS) by full address, plus any <style> block */
  var styles = '';
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(function(s) {
    styles += s.tagName === 'LINK' ? '<link rel="stylesheet" href="' + esc(s.href) + '">' : s.outerHTML;
  });

  /* Clone page HTML (reset inline display:none from page navigation) */
  var pagesHTML = '';
  pages.forEach(function(p) {
    var clone = p.cloneNode(true);
    clone.style.cssText = 'display:flex;box-shadow:none;';
    pagesHTML += clone.outerHTML;
  });

  /* Build the print document — print overrides MUST come after copied styles.
     The browser turns <title> and <html lang> into the PDF's Title and language. */
  var meta = cvMeta();
  var html = '<!DOCTYPE html><html lang="' + esc(meta.language) + '"><head><meta charset="UTF-8">';
  html += '<title>' + esc(meta.title) + '</title>';
  html += styles;
  html += '<style>';
  html += ':root{' + cssVars + '}';
  /* Force background colours (blue bar, sidebar, headings) to print even when
     the browser's "Background graphics" option is off — needed for the ATS export */
  html += '*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}';
  html += '@page{size:A4;margin:0}';
  html += 'html,body{margin:0 !important;padding:0 !important;background:white !important;width:210mm !important;height:auto !important;overflow:visible !important}';
  html += '.page,.page-extra{display:flex !important;flex-direction:column;width:210mm;height:297mm;overflow:hidden;box-shadow:none !important;margin:0;page-break-after:always}';
  html += '.page:last-child,.page-extra:last-child{page-break-after:auto}';
  html += '.panel,.modal-overlay,.toast,.format-panel,.format-panel-toggle,.tab-bar,.editor-view,.configuration-view,.page-nav,.confirm-overlay{display:none !important}';
  html += '@media print{html,body{height:auto !important;overflow:visible !important}}';
  if (oneColumn) html += oneColumnPrintCss();
  html += '</style>';
  html += '</head><body>' + pagesHTML + '</body></html>';

  /* Open in new tab and trigger print */
  var printWindow = window.open('', '_blank');
  if (!printWindow) { showToast('Please allow pop-ups to print/export as PDF', 'error'); return; }
  printWindow.document.write(html);
  printWindow.document.close();
  /* Print once every stylesheet is in (a link gets its .sheet once loaded) and
     the fonts it lays out with have loaded -- the fonts only start loading at
     layout, and printing before they arrive falls back to Helvetica. onload may
     not fire after document.write in some browsers, so a timer starts this too;
     printed guards against printing twice, and 10s + 5s caps the wait. */
  var printed = false;
  var doPrint = function() {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
  };
  var started = Date.now();
  var printWhenReady = function() {
    if (printed) return;
    var doc = printWindow.document;
    var links = doc.querySelectorAll('link[rel="stylesheet"]');
    var loaded = Array.prototype.every.call(links, function(l) { return l.sheet; });
    if (!loaded && Date.now() - started < 10000) { setTimeout(printWhenReady, 100); return; }
    if (doc.body) void doc.body.offsetHeight;   /* lay out, so the fonts start loading */
    var fonts = doc.fonts ? doc.fonts.ready : Promise.resolve();
    Promise.race([fonts, new Promise(function(r) { setTimeout(r, 5000); })]).then(doPrint);
  };
  printWindow.onload = printWhenReady;
  setTimeout(printWhenReady, 500);
}

/* The page margins move to @page so that every printed sheet gets them, not just the first */
function oneColumnPrintCss() {
  var v = function(key) { return getComputedStyle(document.documentElement).getPropertyValue('--' + key).trim(); };
  return '@page{size:A4;margin:' + v('page-margin-top') + ' ' + v('page-margin-right') + ' ' + v('page-margin-bottom') + ' ' + v('page-margin-left') + '}' +
    'html,body{width:auto !important}' +
    '.page,.page-extra{display:block !important;width:auto !important;height:auto !important;min-height:0 !important;overflow:visible !important;page-break-after:auto !important;background:none !important}' +
    '.header,.sidebar,.main,.page-extra-content{padding:0 !important}' +
    '.content{display:block !important;margin-top:var(--content-gap)}' +
    '.sidebar{width:auto !important;min-width:0 !important}' +
    '.main,.page-extra-content{margin-top:var(--content-gap)}' +
    '.blue-bar,.page-extra-header{display:none !important}' +
    /* The square photo keeps its sidebar width instead of spanning the page */
    '.cv-photo--square{width:calc(var(--sidebar-width) - var(--page-margin-left) - var(--col-gap))}' +
    '.cv-photo--circle{top:0;right:0}' +
    'h2,.spacer-heading,.entry-org,.entry-role{break-after:avoid}' +
    '.entry,.contact-item,li{break-inside:avoid}' +
    /* The date follows the title on the same line instead of sitting at the right
       edge: parsers that group text by blocks would otherwise read the date after
       the bullets and fail to pair it with the job */
    '.entry-role{justify-content:flex-start !important;gap:0 !important}' +
    '.entry-role .dates{margin-left:6px}' +
    '.entry-role .dates::before{content:"| "}';
}

function confirmDownload() {
  document.getElementById('download-modal').classList.remove('open');
  loadHtml2Pdf().then(function() {
    var a4HeightPx = Math.floor(297 * 96 / 25.4);
    var filename = document.getElementById('pdf-filename').value.trim() || 'CV';
    if (!filename.endsWith('.pdf')) filename += '.pdf';

    var allPages = document.querySelectorAll('#viewport .page, #viewport .page-extra');
    var textPages = measureCvText();
    var finish = function(pdf) { applyPdfProperties(pdf); addTextLayer(pdf, textPages); };

    if (allPages.length <= 1) {
      var opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 3, useCORS: true, height: a4HeightPx, windowHeight: a4HeightPx },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
      };
      html2pdf().set(opt).from(allPages[0]).toPdf().get('pdf').then(finish).save();
    } else {
      /* Build a wrapper with all pages visible, each exactly 297mm tall.
         Use html2canvas total height = N * a4HeightPx so jsPDF splits cleanly. */
      var wrapper = document.createElement('div');
      allPages.forEach(function(p) {
        var clone = p.cloneNode(true);
        clone.style.display = 'flex';
        clone.style.width = '210mm';
        clone.style.height = '297mm';
        clone.style.maxHeight = '297mm';
        clone.style.overflow = 'hidden';
        clone.style.boxShadow = 'none';
        wrapper.appendChild(clone);
      });
      wrapper.style.width = '210mm';
      document.body.appendChild(wrapper);

      var totalHeight = a4HeightPx * allPages.length;
      var opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 3, useCORS: true, height: totalHeight, windowHeight: totalHeight },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
      };
      html2pdf().set(opt).from(wrapper).toPdf().get('pdf').then(finish).save().then(function() {
        document.body.removeChild(wrapper);
      });
    }
  }).catch(function(err) { console.error(err); });
}

/* Close modal on Escape */
document.addEventListener('keydown', function(e) {
  const modal = document.getElementById('download-modal');
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') closeDownloadModal();
});

