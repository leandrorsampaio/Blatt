/* ================================================================
 *  HELPERS -- Escaping, inline markdown, field lookup
 * ================================================================ */
const SAME_ORG = '(same)';

const ICONS = {
  ':pin:': '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  ':phone:': '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  ':email:': '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top:1px"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'
};

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Markdown link parsing via a balanced-bracket scanner (not regex), so URLs
   may contain arbitrarily nested parentheses — e.g. /wiki/Foo_(bar_(baz)). */
function matchMdLinkAt(s, i) {
  if (s[i] !== '[') return null;
  var close = s.indexOf(']', i + 1);
  if (close === -1 || close === i + 1 || s[close + 1] !== '(') return null;
  var text = s.slice(i + 1, close);
  var j = close + 2, depth = 1, url = '';
  while (j < s.length && depth > 0) {
    var c = s[j];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
    url += c;
    j++;
  }
  if (depth !== 0 || !url) return null;
  return { text: text, url: url, end: j + 1 };
}

/* Walk s, calling linkFn(text,url) on each [text](url) and textFn(str) on the
   plain text around them; returns the concatenated result. */
function replaceMdLinks(s, linkFn, textFn) {
  var out = '', i = 0, last = 0;
  while (i < s.length) {
    if (s[i] === '[') {
      var m = matchMdLinkAt(s, i);
      if (m) {
        out += textFn(s.slice(last, i)) + linkFn(m.text, m.url);
        i = last = m.end;
        continue;
      }
    }
    i++;
  }
  return out + textFn(s.slice(last));
}

/* True if the whole string is exactly one markdown link */
function isPureMdLink(s) {
  var m = matchMdLinkAt(s, 0);
  return !!m && m.end === s.length;
}

function inlineMarkdown(str) {
  return renderInlineMarkdown(str);
}
