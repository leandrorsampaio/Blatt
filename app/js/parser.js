/* ================================================================
 *  PARSER -- Structured Markdown to data object
 * ================================================================ */
function parseMD(text) {
  const lines = text.split('\n');
  const data = { header: {}, sections: [] };
  let currentSection = null;
  let currentEntry = null;
  let lastField = null; /* track last field for continuation lines */

  for (const line of lines) {
    /* Indented continuation line (2+ spaces) → append to last field */
    if (lastField && /^  /.test(line)) {
      lastField.value += '\n' + line.slice(2);
      continue;
    }
    lastField = null; /* reset on any non-continuation line */

    /* # Name (Degree) */
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      const raw = line.slice(2).trim();
      const degreeMatch = raw.match(/\(([^)]+)\)\s*$/);
      if (degreeMatch) {
        data.header.degree = degreeMatch[1];
        data.header.name = raw.slice(0, degreeMatch.index).trim();
      } else {
        data.header.name = raw;
      }
      continue;
    }

    /* > Subtitle */
    if (line.startsWith('> ')) {
      data.header.subtitle = line.slice(2).trim();
      continue;
    }

    /* ## sidebar: Title  or  ## main: Title */
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      currentEntry = null;
      const raw = line.slice(3).trim();
      let type = 'sidebar';
      let title = raw;
      const prefixMatch = raw.match(/^(sidebar|main|page)\s*:\s*/i);
      if (prefixMatch) {
        type = prefixMatch[1].toLowerCase();
        title = raw.slice(prefixMatch[0].length).trim();
      }
      currentSection = { title, type, lines: [], entries: [], paragraphs: [] };
      /* Parse page header config from title: "left | right" or "hidden" */
      if (type === 'page') {
        if (title === 'hidden') {
          currentSection.pageHeader = { left: '', right: '', hidden: true };
        } else if (title.indexOf('|') !== -1) {
          var parts = title.split('|');
          var decLeft = parts[0].trim().replace(/\\n/g, '\n');
          var decRight = parts.slice(1).join('|').trim().replace(/\\n/g, '\n');
          currentSection.pageHeader = { left: decLeft, right: decRight, hidden: false };
        } else {
          currentSection.pageHeader = { left: '', right: '', hidden: false };
        }
      }
      data.sections.push(currentSection);
      continue;
    }

    /* ### Entry */
    if (line.startsWith('### ')) {
      currentEntry = { title: line.slice(4).trim(), fields: [] };
      if (currentSection) currentSection.entries.push(currentEntry);
      continue;
    }

    if (!currentSection) continue;

    /* Key: Value (any key, only inside an entry) */
    const fieldMatch = line.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?):\s+(.+)$/);
    if (fieldMatch && currentEntry) {
      var field = { key: fieldMatch[1].trim(), value: fieldMatch[2].trim() };
      currentEntry.fields.push(field);
      lastField = field; /* enable continuation */
      continue;
    }

    /* - Bullet item (only at section level, not inside entries) */
    if (line.startsWith('- ') && !currentEntry) {
      currentSection.lines.push(line.slice(2).trim());
      continue;
    }

    /* Paragraph text */
    const trimmed = line.trim();
    if (trimmed) {
      currentSection.paragraphs.push(trimmed);
    }
  }
  return data;
}

function fieldVal(fields, key) {
  const f = fields.find(f => f.key === key);
  return f ? f.value : '';
}
