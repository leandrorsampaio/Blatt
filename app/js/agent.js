/* ================================================================
 *  AI COMMANDS -- window.blatt, for AI assistants working in this tab
 *
 *  An assistant that controls the browser (Claude in Chrome, from the
 *  side panel or from Claude Desktop) calls these instead of clicking
 *  through the editor. They act on the CV version being edited and
 *  return plain data; blatt.help() is the assistant's manual. Changes
 *  take the editor's own path -- preview, localStorage, server sync --
 *  and each can be undone, from the notice it shows or blatt.undo().
 * ================================================================ */
window.blatt = (function() {
  const UNDO_MAX = 20;
  const undoStack = []; /* { version, markdown, meta, created } before each change; until the page reloads */

  const HELP = [
    'BLATT -- commands for AI assistants (window.blatt)',
    '',
    'Blatt is the CV editor running in this tab. Use these commands instead of clicking through its editor.',
    'They act on the CV version being edited. Every change shows in the preview at once, is saved (and synced,',
    'when Blatt runs on a server), and can be undone by the user from the notice it shows.',
    '',
    'COMMANDS',
    '  blatt.getCV()                    -> { version, markdown }: the CV being edited, in the format below.',
    '  blatt.setCV(markdown, options)   Saves the whole CV (not a fragment) as new Markdown.',
    '                                   options.asNewVersion: "Name" saves it as a new CV version and leaves',
    '                                   the current one unchanged.',
    '                                   -> { saved, newVersion, warnings, checks }. warnings name lines that would',
    '                                   not show; checks are open ATS points. Fix both and save again.',
    '  blatt.atsCheck()                 -> what an applicant-tracking system (ATS) finds: name, contact, location,',
    '                                   headings, dates, layout.',
    '  blatt.matchJob(adText, options)  Compares the CV with a job ad. options.jobTitle overrides the title read from',
    '                                   the ad\'s first line. -> { jobTitle, score, tips, missing, wordsApart,',
    '                                   onlyListed (skills listed but in no job), shownInUse }',
    '  blatt.properties()               PDF properties of this version: title, author, subject, keywords,',
    '                                   language, filename (custom: false means it follows the CV).',
    '  blatt.setProperties({ ... })     Changes them; "" makes one follow the CV again.',
    '  blatt.versions()                 -> the CV versions and the one being edited.',
    '  blatt.useVersion(name)           Edits another version.',
    '  blatt.template()                 A blank CV with every kind of line.',
    '  blatt.undo()                     Restores the CV as it was before the last change made with these commands.',
    '',
    'WORKING FOR THE USER',
    '  - Never invent experience, employers, dates, degrees, numbers or skills. Rephrase, reorder and cut what',
    '    is there; ask the user for anything new.',
    '  - Read with getCV(), save the whole CV with setCV(). For a big rewrite (e.g. one job ad), offer',
    '    { asNewVersion: "..." } so the original stays.',
    '  - Tell the user what you changed. They can undo it from the notice in the page.',
    '',
    'THE MARKDOWN FORMAT',
    '  # Full Name (Degree)            first line; "(Degree)" is optional',
    '  > Job title                     the subtitle under the name',
    '',
    '  ## sidebar: Contact             a sidebar (left column) section: "- " items and plain text',
    '  - :pin: Street 1, 12345 City    icons: :pin: address, :phone: phone, :email: email',
    '  - :phone: +49 123 456789',
    '  - :email: [me@example.com](mailto:me@example.com)',
    '  - [linkedin.com/in/me](https://linkedin.com/in/me)',
    '',
    '  ## sidebar: Profile',
    '  Plain lines are a paragraph.',
    '',
    '  ## main: Experience             a main (right column) section: only "###" entries show here',
    '  ### Company | Department        the company first; "| Department" is optional',
    '  Title: Job title',
    '  Date: 03/2021 – Present',
    '  Detail: One sentence about the role.',
    '    - An achievement, indented two spaces',
    '    - **Bold** marks key results',
    '  Grade: 1.3                      Grade shows next to the title; any other "Key: value" is a labelled line',
    '',
    '  ### (same)                      another role at the same company',
    '  Title: Earlier job title',
    '  Date: 01/2018 – 02/2021',
    '',
    '  ## page:                        starts the next page; "## page: Left | Right" sets its header text,',
    '                                  "## page: hidden" hides it',
    '',
    '  Inline: **bold**, *italic*, [text](url). Inside an entry, every line is "Key: value" or a continuation',
    '  indented by two spaces.',
    '',
    'WHAT HELPS AN ATS',
    '  - Standard headings: Experience, Education, Skills, Languages, Certifications.',
    '  - Dates as MM/YYYY – MM/YYYY or – Present; at least a year.',
    '  - The company first in the "###" line, the job title in Title:.',
    '  - Contact as text: email, phone, city and country.',
    '  - The job ad\'s own words for skills the user really has; acronyms once in both forms,',
    '    e.g. "Search Engine Optimization (SEO)".',
    '  - Skills shown in use in the experience bullets, not only listed in the sidebar.',
  ].join('\n');

  const textOf = function(html) {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
  };
  const isOpen = function(id) { return document.getElementById(id).classList.contains('active'); };
  const versionNames = function() { return ['Default'].concat(Object.keys(getContentPresets())); };

  /* The CV as the user sees it now, including edits still in the editor */
  function currentMD() {
    if (isOpen('editor-view')) state.currentMD = editorToMD();
    return state.currentMD;
  }

  function store(version, md) {
    if (version === 'Default') { setDefaultMD(md); return; }
    const presets = getContentPresets();
    presets[version] = md;
    setContentPresets(presets);
  }

  function snapshot(created) {
    flushAutoSave();
    const version = getActiveContentName();
    undoStack.push({ version: version, markdown: currentMD(), meta: getContentMeta(version), created: created || null });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }

  /* Show state.currentMD wherever the user is: preview, editor or ATS tab */
  function refresh() {
    renderCV(state.currentMD);
    if (isOpen('editor-view')) buildEditor(parseMD(state.currentMD));
    if (isOpen('ats-view')) buildAtsView();
    refreshLibraryIfOpen();
    markClean();
  }

  function notice(message) {
    showToast(message, 'success', { label: 'Undo', run: undo });
  }

  /* An assistant may wrap the CV in a code fence */
  function clean(markdown) {
    if (typeof markdown !== 'string') throw new Error('Pass the whole CV as one Markdown string.');
    const lines = markdown.replace(/\r\n?/g, '\n').trim().split('\n');
    if (/^```/.test(lines[0]) && /^```\s*$/.test(lines[lines.length - 1])) { lines.shift(); lines.pop(); }
    return lines.join('\n').trim() + '\n';
  }

  /* Errors stop the save; warnings name lines the CV would not show */
  function validate(md) {
    const data = parseMD(md), errors = [], warnings = [];
    if (!data.header.name) errors.push('The first line must be the name: "# Full Name".');
    if (!data.sections.some(function(s) { return s.type !== 'page'; })) errors.push('No sections: start each with "## sidebar: Title" or "## main: Title".');
    let type = null, inEntry = false, field = false;
    md.split('\n').forEach(function(line, i) {
      const at = 'Line ' + (i + 1) + ' (' + line.trim().slice(0, 40) + ')';
      if (field && /^ {2}/.test(line)) return;
      field = false;
      if (!line.trim() || /^# |^> /.test(line)) return;
      if (/^## /.test(line)) {
        const m = line.slice(3).trim().match(/^(sidebar|main|page)\s*:/i);
        if (!m) warnings.push(at + ' has no "sidebar:", "main:" or "page:", so it becomes a sidebar section.');
        type = m ? m[1].toLowerCase() : 'sidebar';
        inEntry = false;
        return;
      }
      if (/^### /.test(line)) {
        if (type !== 'main') warnings.push(at + ' is not shown: "###" entries only show in main sections.');
        inEntry = true;
        return;
      }
      if (inEntry) {
        if (/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?):\s+(.+)$/.test(line)) { field = true; return; }
        warnings.push(at + ' is not shown: inside an entry write "Key: value", and indent continuation lines (e.g. Detail bullets) by two spaces.');
        return;
      }
      if (type === 'main') warnings.push(at + ' is not shown: main sections only show "###" entries.');
      else if (!type) warnings.push(at + ' comes before the first section and is not shown.');
    });
    return { errors: errors, warnings: warnings.slice(0, 12) };
  }

  function checks(all) {
    state.atsReading = measureCvText();
    return atsCheckItems().filter(function(item) { return all || item.level !== 'ok'; })
      .map(function(item) { return { level: item.level, text: textOf(item.html) }; });
  }

  function help() { return HELP; }

  function template() { return document.getElementById('cv-template-data').textContent.trim() + '\n'; }

  function getCV() { return { version: getActiveContentName(), markdown: currentMD().replace(/^\s*\n/, '') }; }

  function setCV(markdown, options) {
    const md = clean(markdown);
    const result = validate(md);
    if (result.errors.length) throw new Error('CV not saved. ' + result.errors.join(' '));
    const newName = options && options.asNewVersion ? String(options.asNewVersion).trim() : '';
    if (newName && versionNames().includes(newName)) {
      throw new Error('CV not saved: a version called "' + newName + '" exists. Pick another name, or leave asNewVersion out to change the version being edited.');
    }
    if (state.showingTemplate) toggleTemplate();
    snapshot(newName);
    const from = getActiveContentName();
    if (newName) {
      store(newName, md);
      setContentMeta(newName, getContentMeta(from));
      setContentDesign(newName, getActivePresetName());
      setActiveContentName(newName);
    } else {
      store(from, md);
    }
    state.currentMD = md;
    refresh();
    notice(newName ? 'An AI assistant saved your CV as the new version “' + newName + '”' : 'An AI assistant changed your CV');
    return { saved: getActiveContentName(), newVersion: !!newName, warnings: result.warnings, checks: checks(false) };
  }

  function atsCheck() { currentMD(); return { version: getActiveContentName(), checks: checks(true) }; }

  function matchJob(adText, options) {
    if (typeof adText !== 'string' || !adText.trim()) throw new Error('Pass the text of the job ad.');
    currentMD();
    const m = jobMatch(adText.trim(), options && options.jobTitle ? String(options.jobTitle).trim() : '', []);
    const labels = function(list) { return list.map(function(t) { return t.label; }); };
    return {
      jobTitle: m.title, score: m.percent + '%', tips: m.tips.map(function(t) { return t.level + ': ' + textOf(t.html); }),
      missing: labels(m.missing), wordsApart: labels(m.apart), onlyListed: labels(m.listed), shownInUse: labels(m.shown),
    };
  }

  function properties() {
    const version = getActiveContentName(), saved = getContentMeta(version), meta = cvMeta(parseMD(currentMD()));
    const out = {};
    META_FIELDS.forEach(function(k) { out[k] = { value: meta[k], custom: !!saved[k] }; });
    return { version: version, properties: out, languages: CV_LANGUAGES };
  }

  function setProperties(changes) {
    if (!changes || typeof changes !== 'object') throw new Error('Pass an object, e.g. { keywords: "..." }.');
    Object.keys(changes).forEach(function(k) {
      if (!META_FIELDS.includes(k)) throw new Error('Unknown property "' + k + '". Use: ' + META_FIELDS.join(', ') + '.');
      if (k === 'language' && changes[k] && !CV_LANGUAGES[changes[k]]) {
        throw new Error('Unknown language "' + changes[k] + '". Use one of: ' + Object.keys(CV_LANGUAGES).join(', ') + '.');
      }
    });
    snapshot();
    const version = getActiveContentName(), meta = Object.assign({}, getContentMeta(version));
    Object.keys(changes).forEach(function(k) {
      const value = changes[k] == null ? '' : String(changes[k]).trim();
      if (value) meta[k] = value; else delete meta[k];
    });
    setContentMeta(version, Object.keys(meta).length ? meta : null);
    applyCvLanguage(cvMeta().language);
    if (isOpen('ats-view')) buildAtsView();
    notice('An AI assistant changed the PDF properties');
    return properties();
  }

  function versions() { return { editing: getActiveContentName(), versions: versionNames() }; }

  function useVersion(name) {
    if (!versionNames().includes(name)) throw new Error('No version "' + name + '". Versions: ' + versionNames().join(', ') + '.');
    flushAutoSave();
    if (state.showingTemplate) toggleTemplate();
    loadContentPreset(name);
    refresh();
    return getCV();
  }

  function undo() {
    const snap = undoStack.pop();
    if (!snap) return { undone: false, message: 'Nothing to undo: no change was made with these commands since the page opened.' };
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
    if (state.showingTemplate) toggleTemplate();
    if (snap.created) {
      const presets = getContentPresets();
      delete presets[snap.created];
      setContentPresets(presets);
      setContentMeta(snap.created, null);
      const designs = getContentDesigns();
      delete designs[snap.created];
      localStorage.setItem(CONTENT_DESIGNS, JSON.stringify(designs));
    }
    store(snap.version, snap.markdown);
    setContentMeta(snap.version, Object.keys(snap.meta).length ? snap.meta : null);
    if (getActiveContentName() !== snap.version) {
      setActiveContentName(snap.version);
      loadPreset(getContentDesign(snap.version));
    }
    state.currentMD = snap.markdown;
    applyCvLanguage(cvMeta().language);
    refresh();
    showToast('Undone: your CV is back as it was', 'success');
    return { undone: true, version: snap.version };
  }

  return Object.freeze({
    help: help, getCV: getCV, setCV: setCV, atsCheck: atsCheck, matchJob: matchJob, properties: properties,
    setProperties: setProperties, versions: versions, useVersion: useVersion, template: template, undo: undo,
  });
})();

/* ── "Edit with AI": the prompt that points an assistant at these commands ── */
function openAiModal() {
  const where = location.protocol === 'file:' ? 'opened from my computer' : 'at ' + location.origin + location.pathname;
  document.getElementById('ai-prompt').value =
    'My CV is open in Blatt, in the Chrome tab “' + document.title + '” (' + where + ').\n' +
    'Blatt has JavaScript commands for AI assistants: in that tab, run blatt.help() and follow it. ' +
    'Use those commands instead of clicking through the editor, and don’t add anything to my CV that isn’t true.\n\n' +
    'What I’d like: ';
  document.getElementById('ai-file-note').hidden = location.protocol !== 'file:';
  document.getElementById('ai-modal').classList.add('open');
  const prompt = document.getElementById('ai-prompt');
  prompt.focus();
  prompt.setSelectionRange(prompt.value.length, prompt.value.length);
}

function closeAiModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('ai-modal').classList.remove('open');
}

function copyAiPrompt() {
  const prompt = document.getElementById('ai-prompt');
  const done = function() { showToast('Prompt copied: paste it into Claude'); };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(prompt.value).then(done, function() { prompt.select(); document.execCommand('copy'); done(); });
  } else {
    prompt.select();
    document.execCommand('copy');
    done();
  }
}
