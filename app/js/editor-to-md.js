/* ================================================================
 *  EDITOR TO MD -- Serialize editor state back to Markdown
 * ================================================================ */
function editorToMD() {
  /* State is already synced via syncRichText on each input event */
  let md = '';
  const hdr = state.editorData.header;
  let nameLine = hdr.name || '';
  if (hdr.degree) nameLine += ' (' + hdr.degree + ')';
  md += '# ' + nameLine + '\n';
  if (hdr.subtitle) md += '> ' + hdr.subtitle + '\n';
  md += '\n';

  for (const sec of state.editorData.sections) {
    if (sec.type === 'page') {
      var ph = sec.pageHeader || {};
      if (ph.hidden) {
        md += '## page: hidden\n';
      } else if (ph.left || ph.right) {
        var encLeft = (ph.left || '').replace(/\n/g, '\\n');
        var encRight = (ph.right || '').replace(/\n/g, '\\n');
        md += '## page: ' + encLeft + ' | ' + encRight + '\n';
      } else {
        md += '## page:\n';
      }
      md += '\n';
      continue;
    }
    md += '## ' + sec.type + ': ' + sec.title + '\n';

    if (sec.paragraphs && sec.paragraphs.length) {
      md += sec.paragraphs.join(' ') + '\n';
    }

    if (sec.lines) {
      for (const line of sec.lines) {
        md += '- ' + line + '\n';
      }
    }

    if (sec.entries) {
      for (const entry of sec.entries) {
        md += '\n### ' + entry.title + '\n';
        for (const f of entry.fields) {
          if (!f.value) continue;
          if (f.key) {
            /* Multi-line values: indent continuation lines with 2 spaces */
            var valLines = f.value.split('\n');
            md += f.key + ': ' + valLines[0] + '\n';
            for (var vl = 1; vl < valLines.length; vl++) {
              md += '  ' + valLines[vl] + '\n';
            }
          } else {
            md += f.value + '\n';
          }
        }
      }
    }

    md += '\n';
  }
  return md;
}
