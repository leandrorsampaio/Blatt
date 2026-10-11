/* ================================================================
 *  TEXT EXPORT -- Plain, readable CV content
 * ================================================================ */
function plainText(value) {
  return replaceMdLinks(String(value || ''), function(text) { return text; }, function(text) { return text; })
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/:pin:\s*/g, 'Address: ')
    .replace(/:phone:\s*/g, 'Phone: ')
    .replace(/:email:\s*/g, 'Email: ')
    .trim();
}

function buildTxtCV() {
  if (document.getElementById('editor-view').classList.contains('active')) {
    state.currentMD = editorToMD();
  }
  const data = parseMD(state.currentMD);
  const out = [];
  const name = plainText(data.header.name || 'CV');
  out.push(name + (data.header.degree ? ' (' + plainText(data.header.degree) + ')' : ''));
  if (data.header.subtitle) out.push(plainText(data.header.subtitle));

  data.sections.forEach(function(section) {
    if (section.type === 'page') return;
    out.push('', section.title.toUpperCase(), '='.repeat(section.title.length));
    if (section.type === 'sidebar') {
      section.paragraphs.forEach(function(p) { out.push(plainText(p)); });
      section.lines.forEach(function(line) { out.push('- ' + plainText(line)); });
      return;
    }
    section.entries.forEach(function(entry) {
      if (entry.title && entry.title !== '(same)') out.push('', plainText(entry.title));
      entry.fields.forEach(function(field) {
        const value = plainText(field.value);
        const lines = value.split('\n');
        out.push(plainText(field.key) + ': ' + (lines.shift() || ''));
        lines.forEach(function(line) { out.push('  ' + line); });
      });
    });
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function downloadTxt() {
  const text = buildTxtCV();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = cvMeta().filename + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}
