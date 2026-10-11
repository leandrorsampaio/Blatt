/* ================================================================
 *  PDF TEXT LAYER -- Invisible text over the Image PDF, for ATS
 * ================================================================ */

/* ── Text layer for the Image PDF ──
   The Image PDF is a picture of each page, so on its own an ATS finds no text
   in it. Every run of words is written over its picture in invisible text, the
   way scanned documents get an OCR layer, in the same order as the Text PDF.
   jsPDF cannot embed the page's WOFF2 fonts, so the layer uses the PDF's
   built-in Helvetica, spaced out or squeezed to cover the words underneath. */
const PX_TO_MM = 25.4 / 96;
const OPEN_SANS_BASELINE = 1.069 / 1.362; /* ascent / line box height: where the baseline sits in a measured run */
const CP1252_HIGH = '€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ'; /* Windows-1252 bytes 0x80-0x9F */
/* Advance widths (1/1000 em) of the built-in Helvetica and Helvetica-Bold for Windows-1252
   bytes 32-255, as PDF readers use them -- jsPDF's own tables are slightly off */
const HELVETICA_WIDTHS = {
  normal: '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500'.split(',').map(Number),
  bold: '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556'.split(',').map(Number)
};
const WIN_ANSI_SWAP = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', '−': '-', '‐': '-', '‑': '-', '\u2009': ' ', '\u202f': ' ' };

/* The Windows-1252 byte of a character, or -1 */
function winAnsiByte(c) {
  const code = c.charCodeAt(0);
  if (c.length !== 1) return -1;
  if ((code >= 32 && code < 127) || (code >= 160 && code <= 255)) return code;
  const i = code > 255 ? CP1252_HIGH.indexOf(c) : -1;
  return i >= 0 ? 0x80 + i : -1;
}
function isWinAnsi(c) { return winAnsiByte(c) >= 0; }

/* The built-in PDF fonts only hold Windows-1252: other letters lose their accent or drop out */
function winAnsiText(text) {
  return Array.from(text.normalize('NFC')).map(function(c) {
    if (isWinAnsi(c)) return c;
    const base = c.normalize('NFD').replace(/\p{M}/gu, '');
    return base !== c && Array.from(base).every(isWinAnsi) ? base : (WIN_ANSI_SWAP[c] || '');
  }).join('');
}

function addTextLayer(pdf, pages) {
  const width = function(text, bold) {
    let units = 0;
    for (const c of text) units += HELVETICA_WIDTHS[bold ? 'bold' : 'normal'][winAnsiByte(c) - 32] || 0;
    return units / 1000 * pdf.getFontSize() / pdf.internal.scaleFactor;
  };
  pages.forEach(function(runs, index) {
    if (index >= pdf.getNumberOfPages()) return;
    pdf.setPage(index + 1);
    runs.forEach(function(run) {
      let text = winAnsiText(run.text);
      const bullet = text.startsWith('• ');
      if (bullet) text = text.slice(2);
      if (!text.trim()) return;
      pdf.setFont('helvetica', (run.bold ? 'bold' : '') + (run.italic ? 'italic' : '') || 'normal');
      pdf.setFontSize(run.size * 0.75); /* px -> pt */
      const x = run.left * PX_TO_MM;
      const y = (run.top + run.height * OPEN_SANS_BASELINE) * PX_TO_MM;
      /* Spread the difference between Helvetica and Open Sans over the letters. The spacing
         follows every letter, the last one too, so the run ends where the words underneath
         end and the gap to the next run stays a readable space. */
      const limit = run.size * PX_TO_MM * 0.25;
      const spare = (run.right - run.left) * PX_TO_MM - width(text, run.bold);
      const charSpace = Math.max(-limit, Math.min(limit, spare / text.length));
      if (bullet) pdf.text('•', x - width('• ', run.bold), y, { renderingMode: 'invisible' });
      pdf.text(text, x, y, { renderingMode: 'invisible', charSpace: charSpace });
    });
  });
}
