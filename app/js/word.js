/* ================================================================
 *  WORD / GOOGLE DOCS -- Structured DOCX template and import
 * ================================================================ */
function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wordParagraph(text, style, bullet) {
  var props = style ? '<w:pPr><w:pStyle w:val="' + style + '"/>' + (bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '') + '</w:pPr>' : (bullet ? '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' : '');
  return '<w:p>' + props + '<w:r><w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p>';
}

function crc32(bytes) {
  var table = crc32.table || (crc32.table = (function() {
    var t = [];
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); t[n] = c >>> 0; }
    return t;
  })());
  var crc = 0xffffffff;
  for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(files) {
  var encoder = new TextEncoder();
  var entries = files.map(function(file) {
    var name = encoder.encode(file.name), data = encoder.encode(file.text);
    return { name: name, data: data, crc: crc32(data) };
  });
  var localLength = entries.reduce(function(n, e) { return n + 30 + e.name.length + e.data.length; }, 0);
  var centralLength = entries.reduce(function(n, e) { return n + 46 + e.name.length; }, 0);
  var out = new Uint8Array(localLength + centralLength + 22), view = new DataView(out.buffer), offset = 0;
  entries.forEach(function(e) {
    e.localOffset = offset;
    view.setUint32(offset, 0x04034b50, true); view.setUint16(offset + 4, 20, true);
    view.setUint32(offset + 14, e.crc, true); view.setUint32(offset + 18, e.data.length, true); view.setUint32(offset + 22, e.data.length, true);
    view.setUint16(offset + 26, e.name.length, true);
    out.set(e.name, offset + 30); out.set(e.data, offset + 30 + e.name.length);
    offset += 30 + e.name.length + e.data.length;
  });
  var centralOffset = offset;
  entries.forEach(function(e) {
    view.setUint32(offset, 0x02014b50, true); view.setUint16(offset + 4, 20, true); view.setUint16(offset + 6, 20, true);
    view.setUint32(offset + 16, e.crc, true); view.setUint32(offset + 20, e.data.length, true); view.setUint32(offset + 24, e.data.length, true);
    view.setUint16(offset + 28, e.name.length, true); view.setUint32(offset + 42, e.localOffset, true);
    out.set(e.name, offset + 46); offset += 46 + e.name.length;
  });
  view.setUint32(offset, 0x06054b50, true); view.setUint16(offset + 8, entries.length, true); view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralLength, true); view.setUint32(offset + 16, centralOffset, true);
  return out;
}

function downloadWordTemplate() {
  var body = [
    wordParagraph('[Full Name] ([Degree])', 'Title'),
    wordParagraph('[Job Title / Role]', 'Subtitle'),
    wordParagraph('sidebar: Contact', 'Heading1'),
    wordParagraph(':pin: [Street, Postcode City]', '', true), wordParagraph(':phone: [Phone number]', '', true), wordParagraph(':email: [Email address]', '', true),
    wordParagraph('sidebar: Profile', 'Heading1'), wordParagraph('[Write a short professional summary.]'),
    wordParagraph('sidebar: Skills', 'Heading1'), wordParagraph('[Skill]: [Level]', '', true), wordParagraph('[Skill]: [Level]', '', true),
    wordParagraph('sidebar: Languages', 'Heading1'), wordParagraph('[Language]: [Level]', '', true),
    wordParagraph('main: Experience', 'Heading1'), wordParagraph('[Department] | [Organisation]', 'Heading2'),
    wordParagraph('Title: [Job title]'), wordParagraph('Date: [MM/YYYY] – [Present]'), wordParagraph('Detail: [Short description of your role.]'),
    wordParagraph('[Achievement or responsibility]', '', true), wordParagraph('[Achievement or responsibility]', '', true),
    wordParagraph('main: Education', 'Heading1'), wordParagraph('[University / School]', 'Heading2'),
    wordParagraph('Title: [Degree / Qualification]'), wordParagraph('Date: [YYYY] – [YYYY]'), wordParagraph('Detail: [Thesis, focus, or relevant detail.]')
  ].join('');
  var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
  var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:i/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style></w:styles>';
  var numberingXml = '<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
  saveDocx(docxPackage(documentXml, stylesXml, numberingXml), 'Blatt_CV_Template.docx');
}

/* A minimal .docx: document, styles, bullet numbering and, optionally, document properties */
function docxPackage(documentXml, stylesXml, numberingXml, coreXml) {
  var files = [
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      (coreXml ? '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' : '') + '</Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      (coreXml ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' : '') + '</Relationships>' },
    { name: 'word/document.xml', text: documentXml }, { name: 'word/styles.xml', text: stylesXml }, { name: 'word/numbering.xml', text: numberingXml },
    { name: 'word/_rels/document.xml.rels', text: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>' }
  ];
  if (coreXml) files.push({ name: 'docProps/core.xml', text: coreXml });
  return new Blob([makeStoredZip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function saveDocx(blob, filename) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

/* ── Word export of the CV itself ──
   Some portals read Word files more reliably than PDFs. One column in the
   order of the Text PDF (header, sidebar, main column), real heading styles,
   bullets, and the role and its dates on one line. */
var WORD_TEXT_WIDTH = 9638; /* A4 width minus 2 cm margins, in twentieths of a point */

function wordRun(text, format) {
  format = format || {};
  var props = (format.bold ? '<w:b/>' : '') + (format.italic ? '<w:i/>' : '') + (format.color ? '<w:color w:val="' + format.color + '"/>' : '') +
    (format.size ? '<w:sz w:val="' + format.size + '"/>' : '');
  return '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r>';
}

/* Inline Markdown -> runs: **bold**, *italic*, and links as their visible text (plus the address if the text hides it) */
function wordRuns(md, format) {
  format = format || {};
  var runs = [];
  var push = function(text) {
    text.split(/(\*\*.+?\*\*|\*.+?\*)/).forEach(function(part) {
      if (!part) return;
      if (/^\*\*.+\*\*$/.test(part)) runs.push(wordRun(part.slice(2, -2), { bold: true, italic: format.italic }));
      else if (/^\*.+\*$/.test(part)) runs.push(wordRun(part.slice(1, -1), { bold: format.bold, italic: true }));
      else runs.push(wordRun(part, format));
    });
    return '';
  };
  replaceMdLinks(String(md || ''), function(text, url) {
    var address = linkAddress(url);
    return push(address && !text.toLowerCase().includes(address.split(/[/?#]/)[0].toLowerCase()) ? text + ' (' + address + ')' : text);
  }, push);
  return runs.join('');
}

function wordPara(runs, opts) {
  opts = opts || {};
  var props = (opts.style ? '<w:pStyle w:val="' + opts.style + '"/>' : '') + (opts.keepNext ? '<w:keepNext/>' : '') +
    (opts.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '') +
    (opts.tab ? '<w:tabs><w:tab w:val="right" w:pos="' + opts.tab + '"/></w:tabs>' : '') +
    (opts.before ? '<w:spacing w:before="' + opts.before + '"/>' : '');
  return '<w:p>' + (props ? '<w:pPr>' + props + '</w:pPr>' : '') + runs + '</w:p>';
}

/* Headings carry their look directly too: not every Word reader applies paragraph styles */
function wordCvBody(data, accent) {
  var body = wordPara(wordRun(plainText(data.header.name || '') + (data.header.degree ? ' (' + plainText(data.header.degree) + ')' : ''), { bold: true, size: 40 }), { style: 'Title' });
  if (data.header.subtitle) body += wordPara(wordRun(plainText(data.header.subtitle), { italic: true, color: '666666', size: 24 }), { style: 'Subtitle' });
  var sections = data.sections.filter(function(s) { return s.type === 'sidebar'; }).concat(data.sections.filter(function(s) { return s.type === 'main'; }));
  sections.forEach(function(section) {
    body += wordPara(wordRun(plainText(section.title), { bold: true, color: accent, size: 26 }), { style: 'Heading1' });
    if (section.type === 'sidebar') {
      if (section.paragraphs.length) body += wordPara(wordRuns(section.paragraphs.join(' ')));
      section.lines.forEach(function(line) {
        var icon = /^:(pin|phone|email):\s*/.test(line);
        body += wordPara(wordRuns(line.replace(/^:(pin|phone|email):\s*/, '')), { bullet: !icon && !isPureMdLink(line) });
      });
      return;
    }
    section.entries.forEach(function(entry) {
      var sub = entry.title === SAME_ORG;
      if (!sub) body += wordPara(wordRun(entry.title.split('|').map(function(p) { return p.trim(); }).join(', '), { color: accent, size: 21 }), { style: 'Heading2' });
      var title = fieldVal(entry.fields, 'Title'), date = fieldVal(entry.fields, 'Date'), grade = fieldVal(entry.fields, 'Grade');
      if (title || date) {
        body += wordPara((title ? wordRun(plainText(title), { bold: true }) : '') + (grade ? wordRun(' (' + plainText(grade) + ')') : '') +
          (date ? '<w:r><w:tab/></w:r>' + wordRun(plainText(date)) : ''), { tab: WORD_TEXT_WIDTH, keepNext: true, before: sub ? 120 : 0 });
      }
      entry.fields.forEach(function(field) {
        if (['Title', 'Date', 'Grade', 'Detail'].includes(field.key)) return;
        body += wordPara(wordRun(field.key + ': ', { bold: true }) + wordRuns(field.value.replace(/\n/g, ' ')));
      });
      fieldVal(entry.fields, 'Detail').split('\n').map(function(l) { return l.trim(); }).filter(Boolean).forEach(function(line) {
        body += line.startsWith('- ') ? wordPara(wordRuns(line.slice(2)), { bullet: true }) : wordPara(wordRuns(line));
      });
    });
  });
  return body;
}

function downloadWordCV() {
  closeDownloadModal();
  if (document.getElementById('editor-view').classList.contains('active')) state.currentMD = editorToMD();
  var data = parseMD(state.currentMD), meta = cvMeta(data);
  var accent = getComputedStyle(document.documentElement).getPropertyValue('--color-blue').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(accent)) accent = '333333';
  var w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + w + '><w:body>' + wordCvBody(data, accent) +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';
  var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + w + '>' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:lang w:val="' + meta.language + '"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="24"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="' + accent + '"/><w:sz w:val="26"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="0"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:color w:val="' + accent + '"/><w:sz w:val="21"/></w:rPr></w:style>' +
    '</w:styles>';
  var numberingXml = '<?xml version="1.0" encoding="UTF-8"?><w:numbering ' + w + '><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="284" w:hanging="284"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
  var coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(meta.title) + '</dc:title>' + (meta.subject ? '<dc:subject>' + xmlEscape(meta.subject) + '</dc:subject>' : '') +
    (meta.author ? '<dc:creator>' + xmlEscape(meta.author) + '</dc:creator>' : '') + (meta.keywords ? '<cp:keywords>' + xmlEscape(meta.keywords) + '</cp:keywords>' : '') +
    '<dc:language>' + meta.language + '</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>';
  var filename = (document.getElementById('pdf-filename').value.trim() || meta.filename).replace(/\.(pdf|docx)$/i, '') + '.docx';
  saveDocx(docxPackage(documentXml, stylesXml, numberingXml, coreXml), filename);
}

async function readDocxPart(buffer, partName) {
  var bytes = new Uint8Array(buffer), view = new DataView(buffer), eocd = -1;
  for (var pos = Math.max(0, bytes.length - 65557); pos <= bytes.length - 22; pos++) if (view.getUint32(pos, true) === 0x06054b50) eocd = pos;
  if (eocd < 0) throw new Error('Not a valid DOCX file');
  var entries = view.getUint16(eocd + 10, true), offset = view.getUint32(eocd + 16, true), decoder = new TextDecoder();
  for (var i = 0; i < entries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid DOCX archive');
    var compression = view.getUint16(offset + 10, true), compressedSize = view.getUint32(offset + 20, true), nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true), localOffset = view.getUint32(offset + 42, true);
    var name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name === partName) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Invalid DOCX entry');
      var localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true), data = bytes.slice(localOffset + 30 + localNameLength + localExtraLength, localOffset + 30 + localNameLength + localExtraLength + compressedSize);
      if (compression === 0) return decoder.decode(data);
      if (compression === 8 && window.DecompressionStream) {
        var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return decoder.decode(new Uint8Array(await new Response(stream).arrayBuffer()));
      }
      throw new Error('This DOCX compression is not supported in this browser');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('The document has no readable Word content');
}

function docxToMarkdown(xml) {
  var doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not read the Word document');
  var paragraphs = Array.prototype.slice.call(doc.getElementsByTagName('w:p')), lines = [], inMainEntry = false;
  paragraphs.forEach(function(p) {
    var text = Array.prototype.slice.call(p.getElementsByTagName('w:t')).map(function(t) { return t.textContent; }).join('').trim();
    if (!text) return;
    var styleNode = p.getElementsByTagName('w:pStyle')[0], style = styleNode ? (styleNode.getAttribute('w:val') || styleNode.getAttribute('val') || '').toLowerCase().replace(/\s/g, '') : '';
    var bullet = p.getElementsByTagName('w:numPr').length > 0;
    if (style === 'title') { lines.push('# ' + text); return; }
    if (style === 'subtitle') { lines.push('> ' + text); return; }
    if (style === 'heading1' || style === 'headingone') { lines.push('## ' + text); inMainEntry = false; return; }
    if (style === 'heading2' || style === 'headingtwo' || style === 'heading3') { lines.push('### ' + text); inMainEntry = true; return; }
    lines.push((bullet ? (inMainEntry ? '  - ' : '- ') : '') + text);
  });
  var markdown = lines.join('\n');
  var parsed = parseMD(markdown);
  if (!parsed.header.name || !parsed.sections.length) throw new Error('Use the supplied template: a Title and Heading 1 section are required');
  return markdown;
}

function importWordDocument() { document.getElementById('word-import-input').click(); }

document.getElementById('word-import-input').addEventListener('change', async function(e) {
  var file = e.target.files[0];
  if (!file) return;
  try {
    var markdown = docxToMarkdown(await readDocxPart(await file.arrayBuffer(), 'word/document.xml'));
    var parsed = parseMD(markdown), presets = getContentPresets();
    var name = getUniqueContentName(parsed.header.name || file.name.replace(/\.docx$/i, ''), presets);
    presets[name] = markdown; setContentPresets(presets); setActiveContentName(name); setContentDesign(name, getActivePresetName()); setContentMeta(name, null);
    state.currentMD = markdown; renderCV(markdown); refreshContentPresetSelect(); markClean();
    showToast('Word document imported as "' + name + '"');
  } catch (err) { showToast(err.message || 'Could not import this Word document', 'error'); }
  this.value = '';
});

document.getElementById('content-preset-name').addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeContentPresetModal();
  if (e.key === 'Enter') confirmSaveContentPreset();
});
