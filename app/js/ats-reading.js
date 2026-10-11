/* ================================================================
 *  ATS READING ORDER -- Where every run of words lands, and in which order parsers read it
 * ================================================================ */

/* Lay a copy of the rendered pages out off-screen and note where every run
   of words lands -- the raw material for both reading orders below. */
function measureCvText() {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-10000px;top:0;width:210mm;pointer-events:none';
  holder.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('#viewport .page, #viewport .page-extra').forEach(function(page) {
    const clone = page.cloneNode(true);
    clone.style.display = 'flex';
    holder.appendChild(clone);
  });
  document.body.appendChild(holder);
  const pages = Array.from(holder.children).map(measurePageText);
  holder.remove();
  return pages;
}

/* Runs of words in document order, each with its box on the page and its column */
function measurePageText(page) {
  const origin = page.getBoundingClientRect();
  const range = document.createRange();
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const runs = [];
  let lastItem = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const column = parent.closest('.sidebar') ? 'side' : parent.closest('.main') ? 'main' : 'page';
    const heading = !!parent.closest('h1, h2, h3');
    const item = parent.closest('li');
    const style = getComputedStyle(parent);
    const font = { size: parseFloat(style.fontSize), bold: parseInt(style.fontWeight, 10) >= 600, italic: style.fontStyle !== 'normal' };
    const words = /\S+/g;
    let run = null, m;
    while ((m = words.exec(node.nodeValue))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      let word = m[0];
      /* The list marker is not in the DOM text, but the PDF carries it */
      if (item && item !== lastItem) { word = '• ' + word; lastItem = item; }
      const box = { top: r.top - origin.top, left: r.left - origin.left, right: r.right - origin.left, height: r.height };
      if (run && Math.abs(box.top - run.top) < box.height / 2 && box.left >= run.right - 1) {
        run.text += ' ' + word;
        run.right = box.right;
      } else {
        if (run) runs.push(run);
        run = Object.assign({ text: word, top: box.top, left: box.left, right: box.right, height: box.height, column: column, heading: heading }, font);
      }
    }
    if (run) runs.push(run);
  }
  return runs;
}

/* Group runs into printed lines. 'columns' keeps the order the text is written
   in; 'across' reads each line over the full page width, like a simple parser. */
function atsLines(runs, mode) {
  const middle = function(r) { return r.top + r.height / 2; };
  const ordered = mode === 'across' ? runs.slice().sort(function(a, b) { return middle(a) - middle(b) || a.left - b.left; }) : runs;
  const lines = [];
  ordered.forEach(function(run) {
    const line = lines[lines.length - 1];
    const last = line && line[line.length - 1];
    const sameRow = last && Math.abs(middle(run) - middle(last)) < Math.min(run.height, last.height) / 2;
    if (sameRow && (mode === 'across' || run.left >= last.right - 1)) line.push(run);
    else lines.push([run]);
  });
  if (mode === 'across') lines.forEach(function(line) { line.sort(function(a, b) { return a.left - b.left; }); });
  return lines;
}

function atsLinesHtml(lines) {
  let html = '', prev = null;
  lines.forEach(function(line) {
    const first = line[0];
    /* Blank line before a heading, or where reading jumps back up into the next column */
    if (prev && (first.heading || first.top < prev.top - prev.height)) html += '\n';
    html += line.map(function(run, i) {
      const gap = i ? run.left - line[i - 1].right : 0;
      const space = !i ? '' : gap > run.height ? '     ' : gap > run.height * 0.1 ? ' ' : '';
      return space + '<span class="col-' + run.column + '">' + esc(run.text) + '</span>';
    }).join('') + '\n';
    prev = first;
  });
  return html;
}

/* Lines where a simple parser runs the sidebar into the main column */
function atsMixedLines() {
  return (state.atsReading || []).reduce(function(n, runs) {
    return n + atsLines(runs, 'across').filter(function(line) {
      return line.some(function(r) { return r.column === 'side'; }) && line.some(function(r) { return r.column === 'main'; });
    }).length;
  }, 0);
}

function setAtsReadingMode(mode) {
  state.atsReadingMode = mode;
  renderAtsReading();
}

function renderAtsReading() {
  const mode = state.atsReadingMode;
  document.querySelectorAll('#ats-reading-toggle button').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === mode); });
  let desc = ATS_READING_DESC[mode];
  if (mode === 'across') {
    const mixed = atsMixedLines();
    desc += mixed ? ' On your CV that happens on ' + mixed + ' line' + (mixed === 1 ? '' : 's') + '. The one-column Text PDF in Download PDF avoids this.'
      : ' On your CV the two columns never share a line.';
  }
  document.getElementById('ats-reading-desc').textContent = desc;
  document.getElementById('ats-reading').innerHTML = (state.atsReading || []).map(function(runs, i) {
    return (i ? '\n<span class="ats-pagebreak">── Page ' + (i + 1) + ' ──</span>\n\n' : '') + atsLinesHtml(atsLines(runs, mode));
  }).join('');
}
