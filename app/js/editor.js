/* ================================================================
 *  EDITOR -- Form-based CV editing UI
 * ================================================================ */

function buildEditor(data) {
  state.editorData = structuredClone(data);
  renderEditor();
}

/* Targeted section re-render: replaces only the section at index si */
function refreshSection(si) {
  var old = document.querySelector('.ed-section[data-si="' + si + '"]');
  if (!old) return;
  var temp = document.createElement('div');
  temp.innerHTML = renderEditorSection(si);
  var newEl = temp.firstElementChild;
  old.replaceWith(newEl);
  /* Re-wire contenteditable and drop zones for this section */
  newEl.querySelectorAll('.ed-richtext').forEach(function(rt) {
    rt.addEventListener('input', function() { syncRichText(rt); markDirty(); });
    rt.addEventListener('paste', onRichTextPaste);
  });
  setupEntryDropZones(newEl);
}

/* Rich text (contenteditable or pasted HTML) -> the Markdown subset Blatt stores:
   **bold**, *italic*, [link](url), "- " bullets, one line per paragraph. Anything
   else (styles, fonts, headings, tables, images) is reduced to its text. Walks the
   DOM rather than regex-ing innerHTML, so entities like &nbsp; never leak through. */
const MD_BLOCK_TAGS = /^(DIV|P|H[1-6]|UL|OL|BLOCKQUOTE|PRE|TABLE|THEAD|TBODY|TR|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|DL|DT|DD|FIGURE|FIGCAPTION|ADDRESS|HR)$/;
const MD_SKIP_TAGS = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|HEAD|TITLE|META|LINK|IMG|SVG|IFRAME|OBJECT|VIDEO|AUDIO|CANVAS|BUTTON|INPUT|SELECT|TEXTAREA)$/;

function wrapInlineMd(text, open, close) {
  if (!text.trim() || text.indexOf('\n') !== -1) return text;
  var m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);  /* keep surrounding spaces outside the markers */
  return m[1] + open + m[2] + close + m[3];
}

function richNodesToMd(parent) {
  var out = '';
  var atLineStart = function() { return !out || out.charAt(out.length - 1) === '\n'; };
  var breakLine = function() { if (!atLineStart()) out += '\n'; };
  parent.childNodes.forEach(function(n) {
    if (n.nodeType === 3) {
      var t = n.nodeValue.replace(/[\s ]+/g, ' ');
      if (t.trim() || !atLineStart()) out += t;  /* source-code whitespace between blocks */
      return;
    }
    if (n.nodeType !== 1 || MD_SKIP_TAGS.test(n.tagName)) return;
    var tag = n.tagName;
    if (tag === 'BR') { out += '\n'; return; }
    if (tag === 'LI') {
      var item = richNodesToMd(n).trim();
      if (item) { breakLine(); out += (item.startsWith('- ') ? '' : '- ') + item; breakLine(); }
      return;
    }
    if (MD_BLOCK_TAGS.test(tag)) { breakLine(); out += richNodesToMd(n); breakLine(); return; }
    var inner = richNodesToMd(n);
    if (tag === 'A') {
      var href = n.getAttribute('href') || '';
      out += /^(https?:|mailto:)/i.test(href) ? wrapInlineMd(inner, '[', '](' + href + ')') : inner;
      return;
    }
    /* Google Docs wraps everything in <b style="font-weight:normal">; Docs/Word mark bold via CSS */
    var w = n.style ? n.style.fontWeight : '', fs = n.style ? n.style.fontStyle : '';
    var bold = ((tag === 'B' || tag === 'STRONG') && !/^(normal|lighter|[1-5]00)$/.test(w)) || /^(bold|bolder|[6-9]00)$/.test(w);
    var italic = ((tag === 'I' || tag === 'EM') && fs !== 'normal') || fs === 'italic';
    if (bold) inner = wrapInlineMd(inner, '**', '**');
    if (italic) inner = wrapInlineMd(inner, '*', '*');
    out += inner;
  });
  return out;
}

function richTextToMd(el) {
  return richNodesToMd(el).split('\n')
    .map(function(line) { return line.replace(/^ +| +$/g, ''); })
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Plain-text clipboard -> the same Markdown subset (bullet glyphs become "- ") */
function plainTextToMd(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]/g, ' ').split('\n')
    .map(function(line) { return line.replace(/^\s*[•◦▪‣∙·*]\s+/, '- ').replace(/^\s*-\s+/, '- ').replace(/ +$/, ''); })
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Paste into a rich-text field: keep the words, paragraphs, bullets, bold/italic and
   links; drop the source's styling. DOMParser builds an inert document: no scripts
   run and no images load. */
function onRichTextPaste(e) {
  var cd = e.clipboardData;
  if (!cd) return;
  e.preventDefault();
  var html = cd.getData('text/html');
  var md = html ? richTextToMd(new DOMParser().parseFromString(html, 'text/html').body)
                : plainTextToMd(cd.getData('text/plain'));
  if (md) document.execCommand('insertHTML', false, mdToEditorHtml(md));
}

function syncRichText(rt) {
  var text = richTextToMd(rt);
  /* Page header fields */
  if (rt.dataset.headerSide) {
    var markerSi = parseInt(rt.dataset.markerSi);
    var sec = state.editorData.sections[markerSi];
    if (!sec.pageHeader) sec.pageHeader = { left: '', right: '', hidden: false };
    sec.pageHeader[rt.dataset.headerSide] = text;
    return;
  }
  var si = parseInt(rt.dataset.si);
  if (rt.dataset.field === 'paragraphs') {
    state.editorData.sections[si].paragraphs = text ? [text] : [];
  } else if (rt.dataset.field === 'detail') {
    var ei = parseInt(rt.dataset.ei);
    if (!isNaN(ei)) setFieldVal(si, ei, 'Detail', text);
  }
}

function renderEditorSection(si) {
  var sec = state.editorData.sections[si];
  var isOpen = !!state.editorAccordion[si];
  var h = '';
  h += '<div class="ed-section' + (isOpen ? '' : ' collapsed') + '" data-si="' + si + '" data-type="' + sec.type + '">';
  h += '<div class="ed-section-header">';
  h += '<span class="ed-drag-handle" draggable="true" ondragstart="onSectionDragStart(event,' + si + ')" ondragend="onSectionDragEnd(event)">&#x2630;</span>';
  var typeLabel = sec.type === 'main' ? 'organization' : sec.type;
  h += '<span class="ed-section-type ' + sec.type + '">' + typeLabel + '</span>';
  h += '<input class="ed-section-title-input" value="' + esc(sec.title) + '" oninput="state.editorData.sections[' + si + '].title=this.value;markDirty()">';
  h += '<button class="ed-section-remove" onclick="confirmRemoveSection(' + si + ')" title="Remove section">&times;</button>';
  h += '<button class="ed-accordion-chevron" onclick="toggleAccordion(' + si + ')">&#x25BE;</button>';
  h += '</div>';
  h += '<div class="ed-section-body">';
  if (sec.type === 'sidebar') {
    h += renderSidebarEditor(si, sec);
  } else {
    h += renderMainEditor(si, sec);
  }
  h += '</div></div>';
  return h;
}

function renderEditor() {
  const el = document.getElementById('editor-view');
  let h = '';

  /* Header */
  h += '<div class="ed-header">';
  h += '<div class="ed-field grow"><label class="ed-label">Name</label><input class="ed-input" id="ed-name" value="' + esc(state.editorData.header.name || '') + '" oninput="state.editorData.header.name=this.value;markDirty()"></div>';
  h += '<div class="ed-field"><label class="ed-label">Degree</label><input class="ed-input" id="ed-degree" value="' + esc(state.editorData.header.degree || '') + '" oninput="state.editorData.header.degree=this.value;markDirty()"></div>';
  h += '<div class="ed-field full"><label class="ed-label">Subtitle</label><input class="ed-input" id="ed-subtitle" value="' + esc(state.editorData.header.subtitle || '') + '" oninput="state.editorData.header.subtitle=this.value;markDirty()"></div>';
  h += '</div>';

  /* Group sections into pages */
  var pages = [[]]; /* pages[0] = page 1 sections (indices into editorData.sections) */
  var edPageMarkerIndices = [-1]; /* section index of the page marker for each page (-1 for page 1) */
  for (let si = 0; si < state.editorData.sections.length; si++) {
    if (state.editorData.sections[si].type === 'page') {
      edPageMarkerIndices.push(si);
      pages.push([]);
    } else {
      pages[pages.length - 1].push(si);
    }
  }

  for (let pi = 0; pi < pages.length; pi++) {
    h += '<div class="ed-page-container" data-page="' + pi + '">';
    h += '<div class="ed-page-label">';
    h += '<span class="ed-page-label-text">Page ' + (pi + 1) + '</span>';
    if (pi > 0) h += '<button class="ed-page-remove" onclick="removePage(' + pi + ')" title="Remove page (sections move to previous page)">&times;</button>';
    h += '</div>';

    var pageSections = pages[pi];

    if (pi === 0) {
      /* Page 1: two-column layout (sidebar | main) */
      var sidebarIndices = pageSections.filter(function(si) { return state.editorData.sections[si].type === 'sidebar'; });
      var mainIndices = pageSections.filter(function(si) { return state.editorData.sections[si].type === 'main'; });

      h += '<div class="ed-page-columns">';

      /* Sidebar column */
      h += '<div class="ed-page-column" data-group="sidebar">';
      h += '<div class="ed-page-column-label">Sidebar</div>';
      if (sidebarIndices.length === 0) {
        h += '<div class="ed-page-empty">No sidebar sections</div>';
      }
      for (var idx = 0; idx < sidebarIndices.length; idx++) {
        h += renderEditorSection(sidebarIndices[idx]);
      }
      h += '<div style="margin-top:8px"><button class="ed-add-btn" onclick="addSectionToPage(0,\'sidebar\')">+ Sidebar</button></div>';
      h += '</div>';

      /* Main column */
      h += '<div class="ed-page-column" data-group="main">';
      h += '<div class="ed-page-column-label">Main Content</div>';
      if (mainIndices.length === 0) {
        h += '<div class="ed-page-empty">No main sections</div>';
      }
      for (var idx = 0; idx < mainIndices.length; idx++) {
        h += renderEditorSection(mainIndices[idx]);
      }
      h += '<div style="margin-top:8px"><button class="ed-add-btn" onclick="addSectionToPage(0,\'main\')">+ Main</button></div>';
      h += '</div>';

      h += '</div>'; /* close ed-page-columns */

    } else {
      /* Pages 2+: page header editor + main sections */
      var markerSi = edPageMarkerIndices[pi];
      var markerSec = state.editorData.sections[markerSi];
      if (!markerSec.pageHeader) markerSec.pageHeader = { left: '', right: '', hidden: false };
      var ph = markerSec.pageHeader;
      var defaultLeft = state.editorData.header.name || '';
      var defaultRight = 'Page ' + (pi + 1);
      var leftVal = ph.left || '';
      var rightVal = ph.right || '';

      h += '<label class="ed-page-header-hide"><input type="checkbox" ' + (ph.hidden ? 'checked' : '') + ' onchange="togglePageHeader(' + markerSi + ',this.checked)"> Hide page header</label>';
      h += '<div class="ed-page-header-row" data-marker-si="' + markerSi + '"' + (ph.hidden ? ' style="display:none"' : '') + '>';
      h += '<div class="ed-page-header-field">';
      h += '<label class="ed-label">Header Left</label>';
      h += '<div class="ed-page-header-input ed-richtext" contenteditable="true" data-placeholder="' + esc(defaultLeft) + '" data-marker-si="' + markerSi + '" data-header-side="left">' + mdToEditorHtml(leftVal) + '</div>';
      h += '</div>';
      h += '<div class="ed-page-header-field">';
      h += '<label class="ed-label">Header Right</label>';
      h += '<div class="ed-page-header-input ed-richtext" contenteditable="true" data-placeholder="' + esc(defaultRight) + '" data-marker-si="' + markerSi + '" data-header-side="right" data-align="right">' + mdToEditorHtml(rightVal) + '</div>';
      h += '</div>';
      h += '</div>';

      if (pageSections.length === 0) {
        h += '<div class="ed-page-empty">No sections — drag sections here or add new ones below</div>';
      }
      for (var idx = 0; idx < pageSections.length; idx++) {
        h += renderEditorSection(pageSections[idx]);
      }
      h += '<div style="display:flex;gap:8px;margin-top:8px">';
      h += '<button class="ed-add-btn" onclick="addSectionToPage(' + pi + ',\'main\')">+ Main</button>';
      h += '</div>';
    }

    h += '</div>'; /* close ed-page-container */
  }

  /* Add page button */
  h += '<div style="margin-top:8px">';
  h += '<button class="ed-add-btn" onclick="addPage()" style="border-color:#27ae60;color:#27ae60">+ New Page</button>';
  h += '</div>';

  el.innerHTML = h;

  /* Activate contenteditable fields: sync to state on input */
  el.querySelectorAll('.ed-richtext').forEach(function(rt) {
    rt.addEventListener('input', function() { syncRichText(rt); markDirty(); });
    rt.addEventListener('paste', onRichTextPaste);
  });

  /* Wire up drop zones for drag & drop */
  setupDropZones();
  setupEntryDropZones();
}

function renderSidebarEditor(si, sec) {
  let h = '';

  /* Paragraphs (as contenteditable) */
  if (sec.paragraphs && sec.paragraphs.length) {
    h += '<div class="ed-toolbar"><button onclick="document.execCommand(\'bold\')" title="Bold"><b>B</b></button><button onclick="document.execCommand(\'italic\')" title="Italic"><i>I</i></button><button onclick="document.execCommand(\'insertUnorderedList\')" title="Bullet List">&#x2022;</button><button onclick="openLinkModal()" title="Insert Link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button></div>';
    h += '<div class="ed-richtext" contenteditable="true" data-placeholder="Write paragraph text..." data-si="' + si + '" data-field="paragraphs">' + mdToEditorHtml(sec.paragraphs.join(' ')) + '</div>';
  }

  /* Bullet items */
  for (let li = 0; li < sec.lines.length; li++) {
    const item = sec.lines[li];
    let iconVal = '';
    let textVal = item;
    for (const token of [':pin:', ':phone:', ':email:']) {
      if (item.startsWith(token)) {
        iconVal = token;
        textVal = item.slice(token.length).trim();
        break;
      }
    }
    h += '<div class="ed-item-row">';
    h += '<select class="ed-item-icon" onchange="updateLineIcon(' + si + ',' + li + ',this.value);markDirty()">';
    h += '<option value=""' + (!iconVal ? ' selected' : '') + '>None</option>';
    h += '<option value=":pin:"' + (iconVal === ':pin:' ? ' selected' : '') + '>Pin</option>';
    h += '<option value=":phone:"' + (iconVal === ':phone:' ? ' selected' : '') + '>Phone</option>';
    h += '<option value=":email:"' + (iconVal === ':email:' ? ' selected' : '') + '>Email</option>';
    h += '</select>';
    h += '<input class="ed-item-input" value="' + esc(textVal) + '" oninput="updateLineText(' + si + ',' + li + ',this.value);markDirty()">';
    h += '<button class="ed-item-remove" onclick="removeLine(' + si + ',' + li + ')">&times;</button>';
    h += '</div>';
  }
  h += '<button class="ed-add-btn" onclick="addLine(' + si + ')">+ Add Item</button>';

  /* Paragraph add btn if no paragraphs yet */
  if (!sec.paragraphs || !sec.paragraphs.length) {
    h += ' <button class="ed-add-btn" onclick="addParagraph(' + si + ')">+ Add Text</button>';
  }

  return h;
}

function renderMainEditor(si, sec) {
  let h = '';
  var ei = 0;
  while (ei < sec.entries.length) {
    var entry = sec.entries[ei];
    if (entry.title === '(same)') { ei++; continue; }

    h += '<div class="ed-entry" data-si="' + si + '" data-ei="' + ei + '" data-scope="entry">';

    /* Entry header with drag handle */
    h += '<div class="ed-entry-header">';
    h += '<span class="ed-entry-drag-handle" draggable="true" ondragstart="onEntryDragStart(event,' + si + ',' + ei + ')" ondragend="onEntryDragEnd(event)">&#x2630;</span>';
    h += '<span style="font-size:8pt;font-weight:600;color:var(--color-black);flex:1">' + esc(entry.title || 'New Entry') + '</span>';
    h += '<button class="ed-item-remove" onclick="confirmRemoveEntry(' + si + ',' + ei + ')">&times;</button>';
    h += '</div>';

    /* Fixed labeled fields */
    h += renderEntryFixedFields(si, ei, entry, false);

    /* Sub-entries */
    var subStart = ei + 1;
    while (subStart < sec.entries.length && sec.entries[subStart].title === '(same)') { subStart++; }

    h += '<div class="ed-sub-entries" data-si="' + si + '" data-parent-ei="' + ei + '">';
    for (var sei = ei + 1; sei < subStart; sei++) {
      h += '<div class="ed-sub-entry" data-si="' + si + '" data-ei="' + sei + '" data-scope="sub-entry">';
      h += '<div class="ed-sub-entry-header">';
      h += '<span class="ed-entry-drag-handle" draggable="true" ondragstart="onSubEntryDragStart(event,' + si + ',' + sei + ',' + ei + ')" ondragend="onSubEntryDragEnd(event)">&#x2630;</span>';
      h += '<span style="font-size:8pt;color:var(--color-grey);font-style:italic;flex:1">(same organisation)</span>';
      h += '<button class="ed-item-remove" onclick="confirmRemoveEntry(' + si + ',' + sei + ')">&times;</button>';
      h += '</div>';
      h += renderEntryFixedFields(si, sei, sec.entries[sei], true);
      h += '</div>';
    }
    h += '<button class="ed-add-btn" onclick="addSubEntry(' + si + ',' + (subStart - 1) + ')">+ Sub-entry (same org)</button>';
    h += '</div>';

    h += '</div>';
    ei = subStart;
  }
  h += '<button class="ed-add-btn" onclick="addEntry(' + si + ',false)">+ Entry</button>';
  return h;
}

function getFieldVal(entry, key) {
  var f = entry.fields.find(function(f) { return f.key === key; });
  return f ? f.value : '';
}

function mdInlineToHtml(str) {
  /* Convert markdown links, bold, italic to HTML for contenteditable.
     Links are stashed behind NUL sentinels so all other text is escaped. */
  var tokens = [];
  function stash(html) { tokens.push(html); return '\0' + (tokens.length - 1) + '\0'; }
  var out = replaceMdLinks(str, function(t, url) {
    return stash('<a href="' + esc(url) + '">' + esc(t) + '</a>');
  }, function(plain) { return plain; });
  out = esc(out)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>');
  return out.replace(/\0(\d+)\0/g, function(_, i) { return tokens[i]; });
}

function mdToEditorHtml(text) {
  if (!text) return '';
  var lines = text.split('\n');
  var html = '';
  var inList = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.trim().startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + mdInlineToHtml(line.trim().slice(2)) + '</li>';
    } else {
      /* A closed list already ends the line, so no <br> after it */
      if (inList) { html += '</ul>'; inList = false; }
      else if (i > 0) html += '<br>';
      html += mdInlineToHtml(line);
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function setFieldVal(si, ei, key, value) {
  var entry = state.editorData.sections[si].entries[ei];
  var f = entry.fields.find(function(f) { return f.key === key; });
  if (f) { f.value = value; }
  else { entry.fields.push({ key: key, value: value }); }
  markDirty();
}

function renderEntryFixedFields(si, ei, entry, isSub) {
  var h = '<div class="ed-entry-fields">';

  /* Company name (main entries only) */
  if (!isSub) {
    h += '<div class="ed-entry-labeled-field">';
    h += '<label class="ed-label">Company Name</label>';
    h += '<input class="ed-input" value="' + esc(entry.title) + '" placeholder="e.g. TechScale GmbH | Engineering" oninput="state.editorData.sections[' + si + '].entries[' + ei + '].title=this.value;markDirty()">';
    h += '</div>';
  }

  /* Job title / Role */
  h += '<div class="ed-entry-labeled-field">';
  h += '<label class="ed-label">' + (isSub ? 'Role' : 'Job Title') + '</label>';
  h += '<input class="ed-input" value="' + esc(getFieldVal(entry, 'Title')) + '" placeholder="e.g. Senior Software Engineer" oninput="setFieldVal(' + si + ',' + ei + ',\'Title\',this.value)">';
  h += '</div>';

  /* Date */
  h += '<div class="ed-entry-labeled-field">';
  h += '<label class="ed-label">Date</label>';
  h += '<input class="ed-input" value="' + esc(getFieldVal(entry, 'Date')) + '" placeholder="e.g. 03/2021 – Present" oninput="setFieldVal(' + si + ',' + ei + ',\'Date\',this.value)">';
  h += '</div>';

  /* Description (richtext) */
  var detailVal = getFieldVal(entry, 'Detail') || '';
  h += '<div class="ed-entry-labeled-field">';
  h += '<label class="ed-label">' + (isSub ? 'Description' : 'Job Description') + '</label>';
  h += '<div class="ed-toolbar"><button onclick="document.execCommand(\'bold\')" title="Bold"><b>B</b></button><button onclick="document.execCommand(\'italic\')" title="Italic"><i>I</i></button><button onclick="document.execCommand(\'insertUnorderedList\')" title="Bullet List">&#x2022;</button><button onclick="openLinkModal()" title="Insert Link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button></div>';
  h += '<div class="ed-richtext" contenteditable="true" data-placeholder="Describe responsibilities, achievements..." data-si="' + si + '" data-ei="' + ei + '" data-field="detail">' + mdToEditorHtml(detailVal) + '</div>';
  h += '</div>';

  /* Additional custom fields (Grade, Topics, Tasks, or any custom Label: Value) */
  var FIXED_KEYS = ['Title', 'Date', 'Detail'];
  for (var fi = 0; fi < entry.fields.length; fi++) {
    var f = entry.fields[fi];
    if (FIXED_KEYS.indexOf(f.key) !== -1) continue;
    h += '<div class="ed-entry-labeled-field ed-custom-field" style="display:flex;gap:6px;align-items:flex-end">';
    h += '<div style="flex:0 0 34%"><label class="ed-label">Label</label>';
    h += '<input class="ed-input" value="' + esc(f.key) + '" placeholder="e.g. Topics" oninput="updateFieldKey(' + si + ',' + ei + ',' + fi + ',this.value)"></div>';
    h += '<div style="flex:1"><label class="ed-label">Value</label>';
    h += '<input class="ed-input" value="' + esc(f.value) + '" placeholder="Value" oninput="updateFieldValue(' + si + ',' + ei + ',' + fi + ',this.value)"></div>';
    h += '<button class="ed-item-remove" onclick="removeField(' + si + ',' + ei + ',' + fi + ')" title="Remove field">&times;</button>';
    h += '</div>';
  }
  h += '<button class="ed-add-btn" onclick="addField(' + si + ',' + ei + ')">+ Add field</button>';

  h += '</div>';
  return h;
}

function updateFieldKey(si, ei, fi, val) {
  state.editorData.sections[si].entries[ei].fields[fi].key = val;
  markDirty();
}
function updateFieldValue(si, ei, fi, val) {
  state.editorData.sections[si].entries[ei].fields[fi].value = val;
  markDirty();
}

/* ── Editor helpers ── */
function updateLineIcon(si, li, icon) {
  const text = getLineText(state.editorData.sections[si].lines[li]);
  state.editorData.sections[si].lines[li] = icon ? icon + ' ' + text : text;
}

function updateLineText(si, li, text) {
  const item = state.editorData.sections[si].lines[li];
  let icon = '';
  for (const token of [':pin:', ':phone:', ':email:']) {
    if (item.startsWith(token)) { icon = token + ' '; break; }
  }
  state.editorData.sections[si].lines[li] = icon + text;
}

function getLineText(item) {
  for (const token of [':pin:', ':phone:', ':email:']) {
    if (item.startsWith(token)) return item.slice(token.length).trim();
  }
  return item;
}

function removeLine(si, li) { state.editorData.sections[si].lines.splice(li, 1); refreshSection(si); markDirty(); }
function addLine(si) { state.editorData.sections[si].lines.push(''); refreshSection(si); markDirty(); }
function addParagraph(si) { state.editorData.sections[si].paragraphs = ['']; refreshSection(si); markDirty(); }
function removeSection(si) { state.editorData.sections.splice(si, 1); renderEditor(); markDirty(); }
function confirmRemoveSection(si) {
  var name = state.editorData.sections[si].title || 'this section';
  showConfirm('Delete section?', 'The section "' + name + '" and all its content will be removed.', 'Delete', function() { removeSection(si); });
}
function addSection(type) {
  state.editorData.sections.push({ title: '', type: type, lines: [], entries: type === 'main' ? [] : undefined, paragraphs: [] });
  renderEditor(); markDirty();
}

function addSectionToPage(pageIdx, type) {
  /* Find the insertion index: right before the (pageIdx)-th page marker, or at end */
  var pageCount = 0;
  var insertAt = state.editorData.sections.length;
  for (var i = 0; i < state.editorData.sections.length; i++) {
    if (state.editorData.sections[i].type === 'page') {
      pageCount++;
      if (pageCount > pageIdx) { insertAt = i; break; }
    }
  }
  var newSec = { title: '', type: type, lines: [], entries: type === 'main' ? [] : undefined, paragraphs: [] };
  state.editorData.sections.splice(insertAt, 0, newSec);
  renderEditor(); markDirty();
}

function addPage() {
  /* Add a page marker at the end */
  state.editorData.sections.push({ title: '', type: 'page', lines: [], entries: [], paragraphs: [], pageHeader: { left: '', right: '', hidden: false } });
  renderEditor(); markDirty();
}

function removePage(pageIdx) {
  /* Find the pageIdx-th page marker and remove it (sections merge into previous page) */
  var pageCount = 0;
  for (var i = 0; i < state.editorData.sections.length; i++) {
    if (state.editorData.sections[i].type === 'page') {
      pageCount++;
      if (pageCount === pageIdx) {
        state.editorData.sections.splice(i, 1);
        renderEditor(); markDirty();
        return;
      }
    }
  }
}
function togglePageHeader(markerSi, hidden) {
  var sec = state.editorData.sections[markerSi];
  if (!sec.pageHeader) sec.pageHeader = { left: '', right: '', hidden: false };
  sec.pageHeader.hidden = hidden;
  /* Show/hide the header row in the editor */
  var row = document.querySelector('.ed-page-header-row[data-marker-si="' + markerSi + '"]');
  if (row) row.style.display = hidden ? 'none' : '';
  markDirty();
}

function addEntry(si, same) {
  state.editorData.sections[si].entries.push({ title: same ? '(same)' : '', fields: [{ key: 'Title', value: '' }, { key: 'Date', value: '' }, { key: 'Detail', value: '' }] });
  refreshSection(si); markDirty();
}
function addSubEntry(si, afterEi) {
  state.editorData.sections[si].entries.splice(afterEi + 1, 0, { title: '(same)', fields: [{ key: 'Title', value: '' }, { key: 'Date', value: '' }, { key: 'Detail', value: '' }] });
  refreshSection(si); markDirty();
}
function removeEntry(si, ei) { state.editorData.sections[si].entries.splice(ei, 1); refreshSection(si); markDirty(); }
function confirmRemoveEntry(si, ei) {
  var name = state.editorData.sections[si].entries[ei].title || 'this entry';
  if (name === '(same)') name = 'this sub-entry';
  showConfirm('Delete entry?', 'The entry "' + name + '" will be removed.', 'Delete', function() { removeEntry(si, ei); });
}
function addField(si, ei) { state.editorData.sections[si].entries[ei].fields.push({ key: '', value: '' }); refreshSection(si); markDirty(); }
function removeField(si, ei, fi) { state.editorData.sections[si].entries[ei].fields.splice(fi, 1); refreshSection(si); markDirty(); }
