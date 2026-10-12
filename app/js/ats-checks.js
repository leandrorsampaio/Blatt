/* ================================================================
 *  ATS VIEW AND CHECKS -- The ATS tab, its properties form and machine-readability checks
 * ================================================================ */

function buildAtsView() {
  if (state.showingTemplate) toggleTemplate(); else renderCV(state.currentMD);
  const saved = getContentMeta(getActiveContentName());
  const meta = cvMeta();
  document.getElementById('ats-version').textContent = 'CV version: ' + getActiveContentName();
  ['title', 'author', 'subject', 'filename'].forEach(function(k) {
    const input = document.getElementById('ats-' + k);
    input.value = saved[k] || '';
    input.placeholder = meta.auto[k];
  });
  document.getElementById('ats-keywords').value = saved.keywords || '';
  const select = document.getElementById('ats-language');
  select.innerHTML = '<option value="">Automatic: ' + esc(CV_LANGUAGES[meta.auto.language]) + (meta.detected ? ' (detected)' : '') + '</option>' +
    Object.keys(CV_LANGUAGES).map(function(code) { return '<option value="' + code + '">' + esc(CV_LANGUAGES[code]) + '</option>'; }).join('');
  select.value = CV_LANGUAGES[saved.language] ? saved.language : '';
  document.getElementById('ats-job').value = saved.jobAd || '';
  document.getElementById('ats-job-title').value = saved.jobTitle || '';
  state.atsReading = measureCvText();
  renderAtsChecks();
  renderAtsJob();
  renderAtsReading();
}

function onAtsField(key, value) {
  const name = getActiveContentName();
  const meta = getContentMeta(name);
  meta[key] = value;
  setContentMeta(name, meta);
  if (key === 'language') {
    applyCvLanguage(cvMeta().language);
    renderAtsChecks();
  }
}

function renderAtsChecks() {
  document.getElementById('ats-checks').innerHTML = atsCheckItems().map(function(item) {
    return '<li class="' + item.level + '"><span>' + item.html + '</span></li>';
  }).join('');
}

/* Every check as { level: ok|warn|error|info, html }; mixed lines and page count need
   state.atsReading (measureCvText()) to be current */
function atsCheckItems() {
  const data = parseMD(state.currentMD);
  const meta = cvMeta(data);
  const text = cvPlainText(data);
  const items = [];
  const add = function(level, html) { items.push({ level: level, html: html }); };

  if (data.header.name) add('ok', 'Name: <strong>' + esc(plainText(data.header.name)) + '</strong>');
  else add('error', 'No name at the top of the CV.');

  const email = text.match(/[^\s@<>()\[\]]+@[^\s@<>()\[\]]+\.[a-z]{2,}/i);
  if (email) add('ok', 'Email: ' + esc(email[0]));
  else add('error', 'No email address. A parser only finds contact details written as text in the CV.');

  /* Phone: contact details live in the sidebar; dates in the main column would look like numbers too */
  const sideLines = [];
  data.sections.forEach(function(s) { if (s.type === 'sidebar') sideLines.push.apply(sideLines, s.lines.concat(s.paragraphs)); });
  const phone = sideLines.find(function(l) { return l.startsWith(':phone:'); }) ||
    sideLines.find(function(l) { return (l.match(/\d/g) || []).length >= 7 && /\+?\d[\d ()\/.-]{6,}\d/.test(l); });
  if (phone) add('ok', 'Phone: ' + esc(plainText(phone).replace(/^Phone:\s*/, '')));
  else add('warn', 'No phone number found.');

  /* Location: portals filter by place before anyone reads the CV */
  const pin = sideLines.find(function(l) { return l.startsWith(':pin:'); });
  const place = pin ? plainText(pin).replace(/^Address:\s*/, '') : [data.header.subtitle || ''].concat(sideLines).map(plainText).find(function(l) {
    return /\b\d{4,5}\s+\p{Lu}\p{L}+/u.test(l) || ATS_COUNTRIES.test(l);
  });
  if (place) add('ok', 'Location: ' + esc(place));
  else add('warn', 'No location found. Many portals filter applicants by place before anyone reads the CV: add your city and country (the location icon in Contact). If the job needs a work permit, say whether you have one.');

  /* Links: a parser reads the visible text, not the address behind it */
  const hiddenLinks = [];
  cvRawTexts(data).forEach(function(raw) {
    replaceMdLinks(raw, function(text, url) {
      const address = linkAddress(url);
      if (!address) return '';
      if (!text.toLowerCase().includes(address.split(/[/?#]/)[0].toLowerCase())) hiddenLinks.push({ text: plainText(text), address: address });
      return '';
    }, function() { return ''; });
  });
  hiddenLinks.slice(0, 3).forEach(function(l) {
    add('warn', 'The link “' + esc(l.text) + '” shows no address. A parser reads the text, not the link behind it: write “' + esc(l.address) + '” as the link text.');
  });

  const placeholder = text.match(/\[[^\]\n]{2,}\]/) || text.match(/lorem ipsum/i);
  if (placeholder) add('error', 'Template text is still in the CV: “' + esc(placeholder[0]) + '”.');

  const chosen = getContentMeta(getActiveContentName()).language;
  const languageName = CV_LANGUAGES[meta.language];
  if (CV_LANGUAGES[chosen] && meta.detected && chosen !== meta.detected) {
    add('warn', 'Language is set to ' + languageName + ', but the text reads like ' + CV_LANGUAGES[meta.detected] + '.');
  } else if (!CV_LANGUAGES[chosen] && !meta.detected) {
    add('warn', 'Blatt could not tell which language this CV is in, so it says ' + languageName + '. Choose the right one under Language.');
  } else {
    add('ok', 'Language: ' + languageName + (CV_LANGUAGES[chosen] ? '' : ' (detected)'));
  }

  const titles = data.sections.filter(function(s) { return s.type !== 'page'; }).map(function(s) { return s.title; });
  const isKind = isSectionKind;
  const found = [], missing = [];
  ATS_SECTIONS.forEach(function(kind) {
    const title = titles.find(function(t) { return isKind(t, kind); });
    if (title) found.push('“' + esc(plainText(title)) + '”'); else missing.push(kind.label);
  });
  if (found.length) add('ok', 'Headings a parser recognises: ' + found.join(', '));
  missing.forEach(function(label) { add('warn', 'No heading a parser recognises as ' + label.toLowerCase() + ', such as “' + label + '”.'); });

  /* Jobs and degrees: parsers work out years of experience from their dates */
  const timeline = data.sections.filter(function(s) {
    return s.type === 'main' && (isKind(s.title, ATS_SECTIONS[0]) || isKind(s.title, ATS_SECTIONS[1]));
  });
  const undated = [];
  timeline.forEach(function(section) {
    let org = '';
    section.entries.forEach(function(entry) {
      if (entry.title !== SAME_ORG) org = plainText(entry.title.split('|')[0]);
      if (!/\b(19|20)\d{2}\b/.test(fieldVal(entry.fields, 'Date'))) undated.push(org || fieldVal(entry.fields, 'Title'));
    });
  });
  if (undated.length) add('warn', 'No year in the date of: ' + esc(undated.slice(0, 3).join(', ')) + (undated.length > 3 ? ' and ' + (undated.length - 3) + ' more' : '') + '. Write dates like 03/2021 – Present.');
  else if (timeline.length) add('ok', 'Every job and degree has a date with a year.');

  /* The Image PDF's hidden text uses the built-in PDF fonts (Windows-1252) */
  const unsupported = Array.from(new Set(Array.from(text).filter(function(c) { return c.trim() && winAnsiText(c) !== c; })));
  if (unsupported.length) add('warn', 'The Image PDF’s hidden text cannot hold ' + unsupported.slice(0, 6).map(function(c) { return '“' + esc(c) + '”'; }).join(' ') +
    (unsupported.length > 6 ? ' and more' : '') + '. For job portals, send a Text PDF: it keeps every letter.');

  const mixed = atsMixedLines();
  if (mixed) add('info', 'Simpler parsers read straight across the page and run your two columns together on ' + mixed + ' line' + (mixed === 1 ? '' : 's') + '. See below, or use the one-column Text PDF for job portals.');

  const pages = (state.atsReading || []).length;
  if (pages > 2) add('info', pages + ' pages. Recruiters usually expect one or two.');

  return items;
}

const ATS_COUNTRIES = new RegExp('\\b(' + ['Germany', 'Deutschland', 'Austria', 'Österreich', 'Switzerland', 'Schweiz', 'Suisse', 'Svizzera',
  'France', 'Spain', 'España', 'Portugal', 'Italy', 'Italia', 'Netherlands', 'Nederland', 'Belgium', 'België', 'Belgique', 'Luxembourg',
  'Ireland', 'United Kingdom', 'UK', 'England', 'Scotland', 'Poland', 'Polska', 'Czechia', 'Czech Republic', 'Sweden', 'Sverige',
  'Denmark', 'Danmark', 'Norway', 'Norge', 'Finland', 'Suomi', 'Greece', 'Romania', 'Hungary', 'Turkey', 'Türkiye', 'USA', 'United States',
  'Canada', 'Mexico', 'México', 'Brazil', 'Brasil', 'Argentina', 'Chile', 'Colombia', 'India', 'Australia', 'New Zealand', 'Singapore',
  'Japan', 'China', 'South Africa', 'United Arab Emirates', 'UAE', 'Israel', 'Remote'].join('|') + ')\\b');

/* What a link points at, as a person would type it: "linkedin.com/in/x", "me@example.com" */
function linkAddress(url) {
  if (!/^(https?:|mailto:)/i.test(url)) return '';
  return url.replace(/^mailto:/i, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

/* Raw Markdown of every CV text, with its links still in place */
function cvRawTexts(data) {
  const parts = [data.header.subtitle];
  data.sections.forEach(function(s) {
    if (s.type === 'page') return;
    parts.push.apply(parts, s.lines.concat(s.paragraphs));
    s.entries.forEach(function(e) { parts.push(e.title); e.fields.forEach(function(f) { parts.push(f.value); }); });
  });
  return parts.filter(Boolean);
}

function isSectionKind(title, kind) {
  return kind.stems.some(function(stem) { return title.toLowerCase().includes(stem); });
}
