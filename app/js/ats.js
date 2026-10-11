/* ================================================================
 *  ATS -- PDF properties, CV language and machine-readability checks
 *
 *  Besides its visible text, a PDF tells machines its title, author,
 *  subject, keywords and language. Per CV version only what the user
 *  typed is stored (cv-content-meta); an empty field follows the CV.
 *
 *  The Text PDF comes out of the browser's print dialog, which only
 *  takes the title (<title>) and the language (<html lang>). The Image
 *  PDF is written by jsPDF and carries every property.
 * ================================================================ */
const CONTENT_META = 'cv-content-meta'; /* CV version name -> { title, author, subject, keywords, language, filename, jobAd, jobIgnore } */
const META_FIELDS = ['title', 'author', 'subject', 'keywords', 'language', 'filename'];
const STORED_FIELDS = META_FIELDS.concat(['jobAd', 'jobTitle', 'jobIgnore']); /* plus the job ad this version is matched against */

const CV_LANGUAGES = {
  en: 'English', de: 'German', fr: 'French', es: 'Spanish', pt: 'Portuguese', it: 'Italian', nl: 'Dutch',
  pl: 'Polish', sv: 'Swedish', da: 'Danish', nb: 'Norwegian', fi: 'Finnish', cs: 'Czech', ro: 'Romanian',
  hu: 'Hungarian', el: 'Greek', tr: 'Turkish', ru: 'Russian', uk: 'Ukrainian', ar: 'Arabic', hi: 'Hindi',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean'
};

/* Short words that give a language away; the CV text is scored against each list */
const LANGUAGE_HINTS = {
  en: 'the and of with for to on at from by',
  de: 'und der die das mit für von im bei zur zum des den dem eine einer sowie auf',
  fr: 'et le les des du une avec pour dans sur au aux par',
  es: 'y el los las del una con para por al como',
  pt: 'e o os as do da dos das em com para uma no na ao',
  it: 'e il gli del della dei con per una nel nella di',
  nl: 'en het van met voor een op bij als aan'
};

/* Headings a parser maps to its standard sections -- lowercase fragments in several languages */
const ATS_SECTIONS = [
  { label: 'Experience', stems: ['experience', 'employment', 'work history', 'career', 'erfahrung', 'werdegang', 'beruf',
    'expérience', 'experiencia', 'experiência', 'esperienz', 'ervaring', 'loopbaan', 'doświadczenie', 'erfarenhet', 'erfaring', 'kokemus'] },
  { label: 'Education', stems: ['education', 'academic', 'studies', 'bildung', 'studium', 'formation', 'études', 'formación',
    'educación', 'estudios', 'formação', 'educação', 'istruzione', 'formazione', 'opleiding', 'onderwijs', 'wykształcenie',
    'utbildning', 'uddannelse', 'utdanning', 'koulutus'] },
  { label: 'Skills', stems: ['skill', 'competenc', 'expertise', 'tools', 'technolog', 'kenntnisse', 'fähigkeit', 'kompetenz',
    'compétence', 'connaissance', 'habilidad', 'conocimiento', 'competência', 'habilidade', 'conhecimento', 'competenz',
    'conoscenz', 'vaardigheden', 'kennis', 'umiejętności', 'kompetens', 'färdigheter', 'ferdigheter', 'færdigheder', 'taidot', 'osaaminen'] }
];

const ATS_READING_DESC = {
  columns: 'Column by column is the order Blatt writes the text into the Text PDF: the header, then the sidebar, then the main column. Parsers that recognise columns read it like this.',
  across: 'Straight across is how older or simpler parsers read: every line over the full width of the page. Wherever the sidebar and the main column share a line, their text runs together.'
};

function getContentMetas() {
  try { return JSON.parse(localStorage.getItem(CONTENT_META)) || {}; } catch { return {}; }
}
function getContentMeta(name) {
  const meta = getContentMetas()[name];
  return meta && typeof meta === 'object' ? meta : {};
}
/* Store the typed fields of one CV version; empty fields are dropped, null forgets the version */
function setContentMeta(name, meta) {
  const metas = getContentMetas(), clean = {};
  STORED_FIELDS.forEach(function(k) {
    if (meta && typeof meta[k] === 'string' && meta[k].trim()) clean[k] = meta[k];
  });
  if (!Object.keys(clean).length && !Object.prototype.hasOwnProperty.call(metas, name)) return;
  if (Object.keys(clean).length) metas[name] = clean; else delete metas[name];
  localStorage.setItem(CONTENT_META, JSON.stringify(metas));
}

/* All CV text as plain words, for language detection and the checks */
function cvPlainText(data) {
  const parts = [data.header.name, data.header.degree, data.header.subtitle];
  data.sections.forEach(function(section) {
    if (section.type === 'page') return;
    parts.push(section.title);
    parts.push.apply(parts, section.paragraphs.concat(section.lines));
    section.entries.forEach(function(entry) {
      if (entry.title !== SAME_ORG) parts.push(entry.title);
      entry.fields.forEach(function(field) { parts.push(field.key, field.value); });
    });
  });
  return parts.filter(Boolean).map(plainText).join('\n');
}

/* Language code of the text, or '' when the hint words are too rare to tell */
function detectLanguage(text) {
  const words = text.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  const counts = {};
  words.forEach(function(w) { counts[w] = (counts[w] || 0) + 1; });
  let best = '', bestScore = 0;
  Object.keys(LANGUAGE_HINTS).forEach(function(code) {
    const score = LANGUAGE_HINTS[code].split(' ').reduce(function(n, w) { return n + (counts[w] || 0); }, 0);
    if (score > bestScore) { best = code; bestScore = score; }
  });
  return bestScore >= 3 && bestScore >= words.length * 0.03 ? best : '';
}

/* What a PDF of the current CV says about itself: the typed value, else one derived from the CV */
function cvMeta(data) {
  data = data || parseMD(state.currentMD);
  const name = plainText(data.header.name || '');
  const detected = detectLanguage(cvPlainText(data));
  const auto = {
    title: (name || 'CV') + ' – CV',
    author: name,
    subject: plainText(data.header.subtitle || ''),
    keywords: '',
    language: detected || 'en',
    filename: (name || 'CV').replace(/\s+/g, '_') + '_CV'
  };
  const saved = getContentMeta(getActiveContentName());
  const meta = { auto: auto, detected: detected };
  META_FIELDS.forEach(function(k) { meta[k] = (typeof saved[k] === 'string' && saved[k].trim()) || auto[k]; });
  if (!CV_LANGUAGES[meta.language]) meta.language = auto.language;
  meta.filename = meta.filename.replace(/\.(pdf|txt)$/i, '').replace(/[\\/:*?"<>|]+/g, '_');
  return meta;
}

/* The CV's language on the page and in the editor; the app's own UI stays English */
function applyCvLanguage(lang) {
  document.getElementById('viewport').lang = lang;
  document.getElementById('editor-view').lang = lang;
}

/* html2pdf hook: write the properties into the Image PDF before it is saved */
function applyPdfProperties(pdf) {
  const meta = cvMeta();
  pdf.setProperties({ title: meta.title, author: meta.author, subject: meta.subject, keywords: meta.keywords, creator: 'Blatt' });
  pdf.setLanguage(meta.language);
  pdf.viewerPreferences({ DisplayDocTitle: true });
}
