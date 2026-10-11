/* ================================================================
 *  ATS JOB AD MATCH -- Key terms of a pasted job ad against the CV
 * ================================================================ */

/* ── Job ad match ──
   Key terms are picked locally: runs of words between stop words and
   punctuation, weighted by how often they occur and whether they look like a
   tool, acronym or name. Words are compared by a crude stem, so "managed"
   finds "management" and "Entwickler" finds "Entwicklung". */
const JOB_WORD = /[\p{L}\p{N}][\p{L}\p{N}+#.\/&'’-]*[\p{L}\p{N}+#]|[\p{L}\p{N}]/gu;
const JOB_STEM_SUFFIXES = ['ungen', 'ations', 'ation', 'ating', 'ated', 'ates', 'ate', 'ments', 'ment', 'ings', 'ing',
  'ities', 'ity', 'ions', 'ion', 'ung', 'ies', 'ers', 'er', 'ed', 'es', 'en', 'al', 's'];
const JOB_MAX_TERMS = 40;
const JOB_MAX_PHRASES = 25;

/* Benefits and company blurbs name no skills; a line starting like this ends the
   useful part of the ad, a tasks or requirements heading starts it again */
const JOB_SKIP_HEADING = /^[^\p{L}]*(what we offer|we offer|our offer|benefits|perks|why (join|work)|about us|about the company|who we are|wir bieten|was wir bieten|das bieten wir|unser angebot|über uns|wer wir sind|o que oferecemos|oferecemos|benefícios|sobre nós|ofrecemos|beneficios|sobre nosotros|nous offrons|avantages|qui sommes-nous|offriamo|chi siamo|wij bieden|wat wij bieden|over ons)/iu;
const JOB_KEEP_HEADING = /^[^\p{L}]*(what you('ll| will)|your (tasks|role|responsibilities|profile|mission|skills)|responsibilities|requirements|qualifications|what you (bring|need|have)|who you are|about you|about the role|the role|must.have|nice.to.have|skills|deine aufgaben|ihre aufgaben|aufgaben|dein profil|ihr profil|anforderungen|was du mitbringst|das bringst du mit|qualifikation|suas atividades|responsabilidades|requisitos|qualificações|funciones|tus funciones|tu perfil|vos missions|votre profil|missions|profil recherché|compétences|mansioni|requisiti|il tuo profilo|jouw taken|functie-eisen|wat vragen wij|jouw profiel)/iu;

/* English ads put verbs in front of the skill ("Own the roadmap", "and track KPIs"). These are
   dropped at the start of a phrase; the second list only at the start of a bullet, since
   its words are skills too ("UX design", "customer support"). */
const JOB_VERBS = ('own run define drive ensure collaborate translate validate track identify implement improve maintain monitor ' +
  'prioritize prioritise coordinate conduct communicate establish execute oversee gather understand evaluate optimize optimise ' +
  'influence align facilitate engage explore discover investigate prepare provide contribute build help bring take write shape ' +
  'turn make deliver create develop manage use analyze analyse').split(' ');
const JOB_LEAD_VERBS = new Set(JOB_VERBS.concat('design support plan report research review lead scale launch ship grow mentor coach partner present work act set hire champion'.split(' ')));
const JOB_PHRASE_VERBS = new Set(JOB_VERBS);

/* Grammar words, plus the words every job ad uses ("experience", "team", "skills") */
const JOB_STOP_WORDS = new Set([
  /* English */
  'a about above after again against all also am an and and/or any are as at be because been before being below between both but by can could did do does doing down during each either else etc even ever every few for from further had has have having he her here hers him his how however i if in into is it its itself just less like many may me might more most much must my no nor not now of off on once only or other our ours out over own per same shall she should so some such than that the their them then there these they this those through thus to too under until up upon us very via was we were what when where whether which while who whom whose why will with within without would yet you your yours e.g i.e',
  'ability able across additional apply applicant applicants application applications based benefits best bonus candidate candidates career chance closely colleagues company competitive contribute culture daily day days diverse diversity eager employee employees employer environment equal ensure excellent excited exciting experience experienced expertise familiar familiarity field flexible friendly gender good great grow growing growth help highly hiring hours ideal ideally include includes including join joining knowledge least level looking love make minimum mission nice offer offering office opportunities opportunity part passion passionate perks plus position preferred proficiency proficient proven qualification qualifications related relevant remote required requirement requirements responsibilities responsible role salary similar skill skills solid strong success successful team teams thrive time understanding use using various vacation way well wide work working world year years together clear clearly hands-on concept concepts principles practices methods methodologies techniques fundamentals basics tools',
  /* German */
  'aber alle allem allen aller alles als also am an andere anderen auch auf aus bei beim bereits bis bzw da dabei damit dann das dass dein deine deinen deiner dem den denn der des deshalb die dies diese diesem diesen dieser dieses doch dort du durch ein eine einem einen einer eines er es etwa euch euer eure für gegen habe haben hat hier ich ihm ihn ihr ihre ihrem ihren ihrer im in ins ist ja je jede jedem jeden jeder jedes kann kannst kein keine können man mehr mein meine mit muss musst nach neben nicht noch nun nur ob oder ohne sehr sein seine sich sie sind so sowie soll sollte sondern über um und uns unser unsere unseren unserer unter viel vom von vor was weil weiter welche wenn wer werden wie wieder wir wird wo z.b u.a d.h m/w/d w/m/d m/f/d f/m/d d/m/w',
  'abgeschlossene abgeschlossenes abgeschlossenen arbeit arbeiten arbeitsplatz aufgabe aufgaben ausgeprägte ausgeprägtes ausgeprägten bereich bereichen bewerbung bieten bringst bringen einschlägige erfahrung erfahrungen erste ersten freuen gerne gute guten gutes idealerweise jahre jahren kenntnisse kenntnissen kollegen mindestens möglichkeit möglichkeiten neue neuen profil rolle sichere sicheres sicherer stelle suchen team teams tätigkeit umgang unternehmen vergleichbare vergleichbaren vorteil wünschenswert verhandlungssicher verhandlungssichere verhandlungssicheres fließend fließende fließendes sehr hohe hohes hoher ausgezeichnete strukturierte selbstständige eigenständige studium ausbildung qualifikation anforderungen methoden konzepte grundlagen',
  /* French */
  'au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous afin ainsi chez comme dont entre plus selon sous tout toute toutes tous très',
  'ans année années bonne bonnes candidat candidature capacité compétences connaissances équipe équipes excellente expérience expériences idéalement maîtrise minimum mission missions offrons poste profil rejoindre souhaité souhaitée',
  /* Spanish */
  'al algo ante antes como con contra cual cuando del desde donde durante el ella ellas ellos entre era es esa esas ese eso esos esta estas este esto estos fue ha hay las les lo los más mi mis mucho muy nada ni nos nosotros nuestra nuestro nuestros otra otro para pero poco por porque quien sea ser si sin sobre su sus también tanto tu tus una uno unos y ya',
  'año años buen buena buenas candidato capacidad conocimiento conocimientos deseable equipo equipos excelente experiencia funciones mínimo ofrecemos perfil puesto requisitos valorable',
  /* Portuguese */
  'ao aos às com da das dele deles do dos é ela elas ele eles em essa essas esse esses eu foi há isso isto já lhe mas mesmo meu minha muito na nas não nem no nossa nosso num numa os ou pela pelas pelo pelos qual quando quem sem seu seus sua suas tem um umas uns você vocês',
  'ano anos atividades boa bom boas capacidade conhecimento conhecimentos desejável diferencial equipe equipes excelente experiência experiências oferecemos requisitos responsabilidades time vaga',
  /* Italian */
  'ad agli ai alla alle allo anche che chi ci dal dalla dei del della delle dello di gli il io lo loro ma mi nei nel nella noi non più sia sua sue suo suoi tra vi',
  'anni anno buona buone capacità conoscenza conoscenze esperienza offriamo ottima ottime profilo requisiti ruolo squadra',
  /* Dutch */
  'aan al als bij dan dat deze die dit door een er haar heb hebben het hij hoe hun ik jij jouw maar mijn naar niet nog nu om onder ons onze ook op over te tot uit uw van veel voor wat wel wie wij wordt zal ze zij zijn zo',
  'bieden ervaring functie goede jaar jaren kandidaat kennis profiel uitstekende vaardigheden'
].join(' ').split(/\s+/).map(foldWord));

/* Lowercase without accents, so "Expérience" and "experience" compare equal */
function foldWord(word) {
  return word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function stemWord(word) {
  if (/[^\p{L}]/u.test(word)) return word; /* C++, Node.js, B2B: compared as written */
  for (let pass = 0; pass < 2; pass++) {
    const suffix = JOB_STEM_SUFFIXES.find(function(s) { return word.length - s.length >= 4 && word.endsWith(s); });
    if (!suffix) break;
    word = word.slice(0, -suffix.length);
  }
  return word.length >= 5 && word.endsWith('e') ? word.slice(0, -1) : word;
}

/* Text -> segments between punctuation and line breaks; every word with its stem */
function jobSegments(text) {
  return text.split(/[\n\r•·▪●;:!?()[\]{}"“”„|]+|[.,](?=\s|$)|\s[-–—]\s|[–—]/).map(function(segment) {
    if (segment === segment.toUpperCase()) segment = segment.toLowerCase(); /* headings in capitals */
    const words = [];
    (segment.match(JOB_WORD) || []).forEach(function(raw, index) {
      raw = raw.replace(/['’]s$/, '');
      /* "Stakeholder-Management" and "stakeholder management" are the same words */
      const pieces = JOB_STOP_WORDS.has(foldWord(raw)) ? [raw] : raw.split(/-+/).filter(Boolean);
      pieces.forEach(function(piece, h) {
        /* "SQL/Python" is two skills; "CI/CD" and "A/B" are one */
        const parts = piece.includes('/') && piece.split('/').some(function(p) { return p.length > 3; }) ? piece.split('/') : [piece];
        parts.forEach(function(part, i) {
          const fold = foldWord(part).replace(/^[.'’]+|[.'’]+$/g, '');
          const caps = part.length > 1 && /\p{Lu}/u.test(part) && !/\p{Ll}/u.test(part); /* SQL, AWS, IT */
          words.push({
            raw: part, fold: fold, stem: stemWord(fold), split: i > 0, caps: caps,
            first: index === 0 && h === 0 && i === 0,
            special: caps || /[^\p{L}'’-]/u.test(part),
            capital: (index > 0 || h > 0) && /^\p{Lu}/u.test(part)
          });
        });
      });
    });
    return words;
  });
}

function jobRelevantText(text) {
  let skip = false;
  return text.split(/\r?\n/).filter(function(line) {
    const heading = line.trim().length <= 60;
    if (heading && JOB_SKIP_HEADING.test(line)) skip = true;
    else if (heading && JOB_KEEP_HEADING.test(line)) skip = false;
    return !skip;
  }).join('\n');
}

/* The job ad's key terms: single words and phrases of up to three words */
function jobKeyTerms(text, ignored) {
  text = jobRelevantText(text);
  /* German capitalises every noun: there capitals say nothing, and lowercase words are verbs and adjectives */
  const german = detectLanguage(text) === 'de';
  const stats = {};
  jobSegments(text).forEach(function(segment) {
    const chunks = [[]];
    segment.forEach(function(w) {
      const stop = !w.caps && (w.fold.length < 2 || !/\p{L}/u.test(w.fold) || JOB_STOP_WORDS.has(w.fold) ||
        (w.first && JOB_LEAD_VERBS.has(w.fold)) || (!chunks[chunks.length - 1].length && JOB_PHRASE_VERBS.has(w.fold)) ||
        (german && !w.special && !/^\p{Lu}/u.test(w.raw)));
      if (stop || w.split) chunks.push([]);
      if (!stop) chunks[chunks.length - 1].push(w);
    });
    chunks.forEach(function(chunk) {
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i + n <= chunk.length; i++) {
          const words = chunk.slice(i, i + n);
          const key = words.map(function(w) { return w.stem; }).join(' ');
          const marked = words.filter(function(w) { return w.special || (w.capital && !german); }).length;
          const term = stats[key] || (stats[key] = { key: key, n: n, count: 0, whole: false, marked: -1 });
          term.count++;
          if (n === chunk.length) term.whole = true;
          /* Show the spelling that carries the most capitals the ad meant (Jira, SQL) */
          if (marked > term.marked) {
            term.marked = marked;
            term.label = words.map(function(w) { return w.special || marked || german ? w.raw : w.raw.toLowerCase(); }).join(' ');
          }
        }
      }
    });
  });

  const terms = Object.keys(stats).map(function(k) { return stats[k]; }).filter(function(t) { return !ignored.includes(t.key); });
  terms.forEach(function(t) { t.score = t.count * [0, 1, 2.2, 2][t.n] + (t.marked > 0 ? 2 : 0) + (t.whole && t.n > 1 ? 1 : 0); });
  const byScore = function(a, b) { return b.score - a.score || b.n - a.n; };
  const inside = function(outer, inner) { return outer.n > inner.n && (' ' + outer.key + ' ').includes(' ' + inner.key + ' '); };
  const chosen = [];
  /* Phrases first, then single words that also occur outside the chosen phrases */
  const pick = function(t, limit) {
    const covered = chosen.filter(function(p) { return inside(p, t); }).reduce(function(s, p) { return s + p.count; }, 0);
    if (chosen.length < limit && t.count > covered) chosen.push(t);
  };
  terms.filter(function(t) { return t.n > 1 && (t.count >= 2 || t.whole); }).sort(byScore)
    .forEach(function(t) { pick(t, JOB_MAX_PHRASES); });
  terms.filter(function(t) { return t.n === 1 && (t.count >= 2 || t.marked > 0 || german) && (t.key.length > 2 || t.marked > 0); }).sort(byScore)
    .forEach(function(t) { pick(t, JOB_MAX_TERMS); });
  return chosen.sort(byScore);
}

/* Text as stems, for phrase lookups: "|" marks a break the phrase may not cross */
function stemIndex(text) {
  const stems = new Set(), sequence = [], words = [];
  jobSegments(text).forEach(function(segment) {
    segment.forEach(function(w, i) { stems.add(w.stem); sequence.push(w.stem); words.push(Object.assign({ prev: segment[i - 1] || null }, w)); });
    sequence.push('|');
  });
  return { stems: stems, words: words, joined: ' ' + sequence.join(' ') + ' ' };
}
function stemKey(text) { return stemIndex(text).words.map(function(w) { return w.stem; }).join(' '); }
function hasPhrase(index, key) { return !!key && index.joined.includes(' ' + key + ' '); }

/* The whole CV, and only its job and project entries -- where a skill is shown in use */
function cvIndex(data) {
  const entries = [];
  data.sections.forEach(function(s) {
    if (s.type !== 'main') return;
    s.entries.forEach(function(e) {
      if (e.title !== SAME_ORG) entries.push(e.title);
      e.fields.forEach(function(f) { entries.push(f.value); });
    });
  });
  return { all: stemIndex(cvPlainText(data)), used: stemIndex(entries.map(plainText).join('\n')) };
}

/* Spoken languages are listed, never "shown in use" */
const LANGUAGE_NAMES = new Set(Object.keys(CV_LANGUAGES).map(function(k) { return CV_LANGUAGES[k]; })
  .concat('Deutsch Englisch Französisch Spanisch Portugiesisch Italienisch Niederländisch Polnisch Russisch'.split(' '))
  .map(function(name) { return stemKey(name); }));

/* found: the phrase is in the CV (inUse: in a job or project entry); apart: its words are, but not together */
function matchJobTerms(terms, cv) {
  return terms.map(function(t) {
    const status = hasPhrase(cv.all, t.key) ? 'found'
      : t.n > 1 && t.key.split(' ').every(function(s) { return cv.all.stems.has(s); }) ? 'apart' : 'missing';
    const inUse = status === 'found' && (hasPhrase(cv.used, t.key) || LANGUAGE_NAMES.has(t.key));
    return Object.assign({ status: status, inUse: inUse }, t);
  });
}

/* ── Job title ──
   Recruiters search by title first, so the ad's title belongs in the subtitle
   or the latest role when it is true. */
const JOB_SENIORITY = new Set('senior sr junior jr lead principal staff head chief associate assistant trainee intern werkstudent praktikant leitender leitende'.split(' '));

/* The ad's first line up to its gender marker, "(m/w/d)", or else up to a dash */
function jobAdTitle(ad) {
  let line = ad.split(/\r?\n/).map(function(l) { return l.trim(); }).find(Boolean) || '';
  const marker = line.split(/\(\s*(?:[mwfdx]\s*\/\s*)+[mwfdx]\s*\)|\((?:all genders|alle geschlechter|gn)\)/i)[0].trim();
  if (marker) line = marker;
  line = line.replace(/\([^)]*\)/g, ' ').replace(/\b[mwfdx]\s*\/\s*[mwfdx](\s*\/\s*[mwfdx])?\b/gi, ' ').replace(/[*:]in\b/g, '')
    .split(/\s[–—|-]\s|\s@\s|,/)[0].replace(/\s+/g, ' ').trim();
  return line.length <= 80 ? line : '';
}

function latestRole(data) {
  const section = data.sections.find(function(s) { return s.type === 'main' && isSectionKind(s.title, ATS_SECTIONS[0]); });
  const entry = section && section.entries.find(function(e) { return fieldVal(e.fields, 'Title'); });
  return entry ? plainText(fieldVal(entry.fields, 'Title')) : '';
}

function jobTitleCheck(title, data) {
  const words = stemIndex(title).words;
  const key = words.map(function(w) { return w.stem; }).join(' ');
  const core = words.filter(function(w) { return !JOB_SENIORITY.has(w.fold); }).map(function(w) { return w.stem; }).join(' ');
  const places = [['subtitle', plainText(data.header.subtitle || '')], ['latest role', latestRole(data)]].filter(function(p) { return p[1]; });
  const quote = function(t) { return '“' + esc(t) + '”'; };
  for (const p of places) {
    if (hasPhrase(stemIndex(p[1]), key)) return { level: 'ok', html: 'Job title ' + quote(title) + ' is in your ' + p[0] + '.' };
  }
  for (const p of places) {
    if (core && core !== key && hasPhrase(stemIndex(p[1]), core)) {
      return { level: 'warn', html: 'Your ' + p[0] + ' says ' + quote(p[1]) + '; the ad asks for ' + quote(title) + '. Use the ad’s wording where it is true.' };
    }
  }
  return { level: 'warn', html: 'The job title ' + quote(title) + ' is not in your subtitle or latest role. Recruiters search by title first: if it fits, use the same title in your subtitle.' };
}

/* ── Acronyms ──
   A search for "SEO" misses a CV that only says "Search Engine Optimization",
   and the other way round. Known pairs, plus any "Long Form (LF)" the ad or the
   CV spells out itself. Acronyms nobody searches in full (KPI, SaaS, B2B) are left out. */
const ACRONYMS = {
  'AI': 'Artificial Intelligence', 'ML': 'Machine Learning', 'NLP': 'Natural Language Processing', 'LLM': 'Large Language Model',
  'BI': 'Business Intelligence', 'SEO': 'Search Engine Optimization|Search Engine Optimisation', 'SEM': 'Search Engine Marketing',
  'CRM': 'Customer Relationship Management', 'ERP': 'Enterprise Resource Planning',
  'OKR': 'Objectives and Key Results', 'SLA': 'Service Level Agreement', 'UX': 'User Experience',
  'UI': 'User Interface', 'QA': 'Quality Assurance', 'HR': 'Human Resources', 'R&D': 'Research and Development', 'P&L': 'Profit and Loss',
  'M&A': 'Mergers and Acquisitions', 'FP&A': 'Financial Planning and Analysis', 'GDPR': 'General Data Protection Regulation',
  'PMP': 'Project Management Professional', 'MBA': 'Master of Business Administration', 'CPA': 'Certified Public Accountant',
  'CFA': 'Chartered Financial Analyst', 'IoT': 'Internet of Things', 'CMS': 'Content Management System', 'CX': 'Customer Experience',
  'GTM': 'Go-to-Market', 'PoC': 'Proof of Concept', 'NPS': 'Net Promoter Score',
  'ARR': 'Annual Recurring Revenue', 'PLM': 'Product Lifecycle Management',
  'TDD': 'Test-Driven Development', 'IAM': 'Identity and Access Management', 'SRE': 'Site Reliability Engineering',
  'KI': 'Künstliche Intelligenz', 'BWL': 'Betriebswirtschaftslehre', 'VWL': 'Volkswirtschaftslehre', 'DSGVO': 'Datenschutz-Grundverordnung'
};
const ACRONYM_SMALL_WORDS = new Set('and of for to as a the und der die das de du des'.split(' '));

/* "Search Engine Optimization (SEO)" and "SEO (Search Engine Optimization)" spelled out in a text */
function spelledOutAcronyms(text) {
  const pairs = [];
  const initials = function(long) {
    return long.split(/[\s-]+/).filter(function(w) { return w && !ACRONYM_SMALL_WORDS.has(w.toLowerCase()); }).map(function(w) { return w[0]; }).join('').toLowerCase();
  };
  const letters = function(acronym) { return acronym.replace(/s$/, '').replace(/[^\p{L}]/gu, '').toLowerCase(); };
  const add = function(long, acronym) {
    long = long.trim();
    if (initials(long) === letters(acronym)) pairs.push({ acronym: acronym.replace(/s$/, ''), long: [long] });
  };
  for (const m of text.matchAll(/((?:\p{Lu}[\p{L}-]*\s+(?:(?:and|of|for|to|as|a|und|der)\s+)?){1,6})\((\p{Lu}[\p{L}&\/]{1,6})\)/gu)) add(m[1], m[2]);
  for (const m of text.matchAll(/\b(\p{Lu}[\p{Lu}&\/]{1,6}s?)\s*\(((?:[\p{L}-]+\s*){2,6})\)/gu)) add(m[2], m[1]);
  return pairs;
}

function hasAcronym(index, acronym) {
  const loose = acronym.length > 3 || /\p{Ll}/u.test(acronym); /* "IT" is not "it", but "SaaS" is "SAAS" */
  return index.words.some(function(w) {
    /* After a capitalised name it is part of a product: "Power BI", "Azure ML" */
    if (w.prev && w.prev.capital && /\p{Ll}/u.test(w.prev.raw)) return false;
    return w.raw === acronym || w.raw === acronym + 's' || (loose && (w.fold === foldWord(acronym) || w.fold === foldWord(acronym) + 's'));
  });
}

/* Pairs the ad uses in one form or the other, but the CV only in one */
function acronymTips(ad, cvText, cv) {
  const adIndex = stemIndex(ad), seen = new Set(), tips = [];
  const pairs = Object.keys(ACRONYMS).map(function(a) { return { acronym: a, long: ACRONYMS[a].split('|') }; })
    .concat(spelledOutAcronyms(ad), spelledOutAcronyms(cvText));
  pairs.forEach(function(p) {
    if (seen.has(p.acronym)) return;
    const longIn = function(index) { return p.long.find(function(l) { return hasPhrase(index, stemKey(l)); }); };
    if (!hasAcronym(adIndex, p.acronym) && !longIn(adIndex)) return;
    const cvAcronym = hasAcronym(cv.all, p.acronym), cvLong = longIn(cv.all);
    if (cvAcronym === !!cvLong) return;
    seen.add(p.acronym);
    tips.push({ acronym: p.acronym, long: cvLong || p.long[0], has: cvAcronym ? p.acronym : cvLong });
  });
  return tips;
}

function onAtsJobInput(value) {
  onAtsField('jobAd', value);
  clearTimeout(state.atsJobTimer);
  state.atsJobTimer = setTimeout(renderAtsJob, 250);
}

function onAtsJobTitle(value) {
  onAtsField('jobTitle', value);
  clearTimeout(state.atsJobTimer);
  state.atsJobTimer = setTimeout(renderAtsJob, 250);
}

function ignoreJobTerm(key) {
  const name = getActiveContentName(), meta = getContentMeta(name);
  meta.jobIgnore = (meta.jobIgnore ? meta.jobIgnore + '\n' : '') + key;
  setContentMeta(name, meta);
  renderAtsJob();
}

function restoreJobTerms() {
  const name = getActiveContentName(), meta = getContentMeta(name);
  delete meta.jobIgnore;
  setContentMeta(name, meta);
  renderAtsJob();
}

function renderAtsJob() {
  clearTimeout(state.atsJobTimer);
  const meta = getContentMeta(getActiveContentName());
  const box = document.getElementById('ats-job-result');
  const ad = (meta.jobAd || '').trim();
  const titleInput = document.getElementById('ats-job-title');
  titleInput.placeholder = ad ? jobAdTitle(ad) : '';
  if (!ad) { box.innerHTML = ''; return; }
  const ignored = (meta.jobIgnore || '').split('\n').filter(Boolean);
  const data = parseMD(state.currentMD), cvText = cvPlainText(data), cv = cvIndex(data);
  const terms = matchJobTerms(jobKeyTerms(ad, ignored), cv);

  /* Job title and acronym tips, in the style of the checks list */
  const title = (meta.jobTitle || '').trim() || jobAdTitle(ad);
  const tips = [];
  if (title) { const t = jobTitleCheck(title, data); tips.push('<li class="' + t.level + '"><span>' + t.html + '</span></li>'); }
  acronymTips(ad, cvText, cv).forEach(function(t) {
    tips.push('<li class="warn"><span>Write “' + esc(t.long) + ' (' + esc(t.acronym) + ')” once: your CV only says “' + esc(t.has) +
      '”, and a search for the other form misses it.</span></li>');
  });
  const tipList = tips.length ? '<ul class="ats-checks">' + tips.join('') + '</ul>' : '';
  const restore = ignored.length ? '<p class="ats-job-ignored">' + ignored.length + ' term' + (ignored.length === 1 ? '' : 's') +
    ' ignored · <button onclick="restoreJobTerms()">Show again</button></p>' : '';
  if (!terms.length) { box.innerHTML = tipList + '<p class="ats-job-ignored">No key terms found yet. Paste more of the ad.</p>' + restore; return; }

  const by = function(status) { return terms.filter(function(t) { return t.status === status; }); };
  const found = by('found'), apart = by('apart'), missing = by('missing');
  const shown = found.filter(function(t) { return t.inUse; }), listed = found.filter(function(t) { return !t.inUse; });
  const percent = Math.round((found.length + apart.length / 2) / terms.length * 100);
  const chips = function(list) {
    return '<div class="ats-terms">' + list.map(function(t) {
      return '<span class="ats-term ' + (t.status === 'found' && !t.inUse ? 'listed' : t.status) + '">' + esc(t.label) + (t.count > 1 ? ' <small>×' + t.count + '</small>' : '') +
        '<button title="Not relevant – ignore" onclick="ignoreJobTerm(' + JSON.stringify(t.key).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + ')">×</button></span>';
    }).join('') + '</div>';
  };
  const group = function(list, title, hint) {
    return list.length ? '<div class="ats-job-group"><h5>' + title + ' (' + list.length + ')</h5>' + (hint ? '<p>' + hint + '</p>' : '') + chips(list) + '</div>' : '';
  };
  box.innerHTML = tipList +
    '<div class="ats-job-score"><div class="ats-job-meter"><span style="width:' + percent + '%"></span></div>' +
    '<span><strong>' + percent + '% match</strong> · your CV uses ' + found.length + ' of the ' + terms.length + ' key terms' +
    (apart.length ? ', and the words of ' + apart.length + ' more' : '') + '</span></div>' +
    group(missing, 'Not in your CV', 'Add the ones that are true for you, in the words of the ad. Leave out anything you could not back up in an interview.') +
    group(apart, 'Words there, but not together', 'Recruiters often search for the exact phrase.') +
    group(listed, 'Only listed, not shown in use', 'They appear in your sidebar or skills, but in no job or project. Mention them where you used them: AI-based matching and recruiters weigh skills they can see in action.') +
    group(shown, 'Shown in your experience', '') + restore;
}
