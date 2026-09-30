// Live workshops: reads the "Workshops" tab of BBD_Program_Builder. Only rows with Show on Website = Yes are published.
const SHEET_ID = '1knPP2VwY5CvEdDXyehxpXybvVifsoVSYytzrhikYxOk';
const GID = '199471122';
const URLS = [
  'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID,
  'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&gid=' + GID
];


// Fills missing EN/DE (or GE) text by machine translation; results cached in the browser.
const TKEY = 'bbd-tr-v1';
let tcache = {}; try { tcache = JSON.parse(localStorage.getItem(TKEY) || '{}'); } catch (e) {}
const isGe = (s) => /[\u10A0-\u10FF]/.test(s || '');
async function tr(text, tl) {
  const s = (text || '').trim(); if (!s) return '';
  const k = tl + '|' + s; if (tcache[k]) return tcache[k];
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000);
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + tl + '&dt=t&q=' + encodeURIComponent(s), { signal: ac.signal });
    clearTimeout(t);
    const j = await r.json(); const out = (j[0] || []).map((x) => x[0]).join('').trim();
    if (out) { tcache[k] = out; try { localStorage.setItem(TKEY, JSON.stringify(tcache)); } catch (e) {} return out; }
  } catch (e) {}
  return s;
}
// { ge, en, de } from whatever is filled in; blanks are translated from the first available.
async function tri3(ge, en, de) {
  const src = ge || en || de; if (!src) return null;
  const geSrc = ge || (isGe(src) ? src : '');
  const enSrc = en || (!isGe(src) && src !== de ? src : '');
  const [g, e, d] = await Promise.all([geSrc || tr(src, 'ka'), enSrc || tr(src, 'en'), de || tr(enSrc || src, 'de')]);
  return { ge: g, en: e, de: d };
}

function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (q) { if (c === '"' && n === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// "Form fields (JSON)" cell: one object per workshop holding the KA/GE, EN and DE forms.
// Tolerant reader: finds each form's submit URL, the age and languages entry ids, and the language choices.
function toEntry(v) { const m = String(v).match(/entry\.(\d+)|^(\d{5,})$/); return m ? 'entry.' + (m[1] || m[2]) : null; }
function toAction(v) { const m = String(v).match(/https:\/\/docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/(e\/)?([\w-]+)/); return m ? 'https://docs.google.com/forms/d/' + (m[1] || '') + m[2] + '/formResponse' : null; }
function readForm(node) {
  const f = { action: null, age: null, langs: null, choices: null };
  const walk = (v, path) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      if (!f.choices && v.length && v.every((x) => typeof x === 'string') && /lang|ენ|sprach|choice|option/i.test(path)) f.choices = v.filter((x) => !/^(other|__other_option__)$/i.test(x));
      v.forEach((x, i) => walk(x, path + '.' + i));
      return;
    }
    if (typeof v === 'object') {
      const t = String(v.title || v.label || v.name || v.question || '');
      const id = toEntry(v.id || v.entry || v.entryId || v.field || '');
      if (id && t) { if (/age|ასაკ|alter/i.test(t)) f.age = f.age || id; else if (/lang|ენ|sprach/i.test(t)) { f.langs = f.langs || id; if (!f.choices && Array.isArray(v.choices || v.options)) f.choices = (v.choices || v.options).map((c) => typeof c === 'string' ? c : (c.label || c.value || '')).filter(Boolean); } }
      Object.keys(v).forEach((k) => walk(v[k], path + '.' + k));
      return;
    }
    const a = toAction(v); if (a && !f.action) f.action = a;
    const e = toEntry(v);
    if (e) { if (/age|ასაკ|alter/i.test(path) && !f.age) f.age = e; else if (/lang|ენ|sprach/i.test(path) && !f.langs) f.langs = e; }
  };
  walk(node, '');
  return f.action && f.age && f.langs ? f : null;
}
function parseForms(cell) {
  if (!cell) return null;
  let j; try { j = JSON.parse(cell); } catch (e) { return null; }
  const pick = (keys) => { for (const k of Object.keys(j)) if (keys.test(k)) return j[k]; return null; };
  const out = { ge: readForm(pick(/^(ka|ge|geo|kat)/i)), en: readForm(pick(/^en/i)), de: readForm(pick(/^de/i)) };
  return out.ge || out.en || out.de ? out : null;
}

export async function loadWorkshops() {
  let text = null;
  for (const u of URLS) {
    try { const r = await fetch(u + '&_=' + Date.now()); if (r.ok) { text = await r.text(); break; } } catch (e) {}
  }
  if (text == null) throw new Error('workshops sheet unavailable');
  const rows = parseCSV(text);
  const hi = rows.findIndex((r) => r.some((x) => /show on website/i.test(x)));
  if (hi < 0) return [];
  const H = rows[hi].map((h) => (h || '').trim().toLowerCase());
  const col = (name) => H.indexOf(name.toLowerCase());
  const iForms = H.findIndex((x) => /form fields/.test(x));
  const g = (r, name) => { const i = col(name); return i >= 0 ? (r[i] || '').trim() : ''; };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const ge = g(r, 'Title GE'), en = g(r, 'Title EN'), de = g(r, 'Title DE');
    if (!ge && !en && !de) continue;
    if (!/yes|true|დიახ|ja/i.test(g(r, 'Show on Website'))) continue;
    const dge = g(r, 'Description GE'), den = g(r, 'Description EN'), dde = g(r, 'Description DE');
    const reg = g(r, 'Registration URL');
    out.push({
      id: g(r, 'ID') || ge || en,
      title: await tri3(ge, en, de),
      desc: await tri3(dge, den, dde),
      leaderByLang: await (async (l) => { if (!l || !isGe(l)) return null; const ns = l.split(/\s*,\s*/); const [en, de] = await Promise.all(['en', 'de'].map((t) => Promise.all(ns.map((n) => isGe(n) ? tr(n, t) : n)))); return { ge: l, en: en.join(', '), de: de.join(', ') }; })(g(r, 'Facilitator')),
      date: g(r, 'Date'), time: g(r, 'Time'), room: g(r, 'Venue/Room'), leader: g(r, 'Facilitator'),
      deadline: g(r, 'Deadline'),
      forms: iForms >= 0 ? parseForms((r[iForms] || '').trim()) : null,
      regUrl: { ge: g(r, 'Registration URL GE') || reg, en: g(r, 'Registration URL EN') || reg, de: g(r, 'Registration URL DE') || reg }
    });
  }
  return out;
}
