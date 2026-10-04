// Live programme: reads the "Program Builder" tab of the festival programme sheet.
// Only rows with Status = Confirmed and Show on Website = Yes are published (per the sheet's own rule).
const SHEET_ID = '1knPP2VwY5CvEdDXyehxpXybvVifsoVSYytzrhikYxOk';
const GID = '1632004297';
const URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID;
const GVIZ = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&headers=0&gid=' + GID;


// Fills missing EN/DE (or GE) text by machine translation; results cached in the browser.
const TKEY = 'bbd-tr-v1';
let tcache = {}; try { tcache = JSON.parse(localStorage.getItem(TKEY) || '{}'); } catch (e) {}
const isGe = (s) => /[\u10A0-\u10FF]/.test(s || '');
// Fixed terms: substituted before machine translation so they never get mistranslated.
const GLOSS = [
  ['საავტორო ბლოკი', { en: 'Author block', de: 'Autorenblock' }],
  ['მატარებელი კომიქსი', { en: 'Matarebeli Comics', de: 'Matarebeli Comics' }],
  ['მატარებელი', { en: 'Matarebeli', de: 'Matarebeli' }]
];
const KA_LAT = { 'ა':'a','ბ':'b','გ':'g','დ':'d','ე':'e','ვ':'v','ზ':'z','თ':'t','ი':'i','კ':'k','ლ':'l','მ':'m','ნ':'n','ო':'o','პ':'p','ჟ':'zh','რ':'r','ს':'s','ტ':'t','უ':'u','ფ':'p','ქ':'k','ღ':'gh','ყ':'q','შ':'sh','ჩ':'ch','ც':'ts','ძ':'dz','წ':'ts','ჭ':'ch','ხ':'kh','ჯ':'j','ჰ':'h' };
const translit = (s) => s.replace(/[\u10D0-\u10F0]+/g, (w) => { const r = w.split('').map((c) => KA_LAT[c] || c).join(''); return r.charAt(0).toUpperCase() + r.slice(1); });
async function tr(text, tl) {
  let s = (text || '').trim(); if (!s) return '';
  if (tl !== 'ka') GLOSS.forEach(([ka, t]) => { s = s.split(ka).join(t[tl] || t.en); });
  if (!isGe(s)) return s;
  const cap = (v) => v.charAt(0).toLocaleUpperCase(tl) + v.slice(1);
  const k = tl + '|' + s; if (tcache[k]) return cap(tcache[k]);
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000);
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + tl + '&dt=t&q=' + encodeURIComponent(s), { signal: ac.signal });
    clearTimeout(t);
    const j = await r.json(); const out = (j[0] || []).map((x) => x[0]).join('').trim();
    if (out) { tcache[k] = cap(out); try { localStorage.setItem(TKEY, JSON.stringify(tcache)); } catch (e) {} return cap(out); }
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

// "პანელი / Panel" → { ge: 'პანელი', en: 'Panel' }
function bi(v) {
  const s = (v || '').trim();
  if (!s) return { ge: '', en: '' };
  const i = s.indexOf(' / ');
  return i < 0 ? { ge: s, en: s } : { ge: s.slice(0, i).trim(), en: s.slice(i + 3).trim() };
}

const DE = {
  'panel': 'Panel', 'talk': 'Gespräch', 'break': 'Pause', 'kids activity': 'Kinderprogramm', 'other': 'Programm',
  'reading': 'Lesung', 'workshop': 'Workshop', 'book launch': 'Buchpremiere', 'music': 'Musik', 'performance': 'Performance',
  'main stage': 'Hauptbühne', 'kids corner': 'Kinderecke',
  'georgian': 'Georgisch', 'german': 'Deutsch', 'english': 'Englisch'
};
const tri = (v) => { const b = bi(v); return { ge: b.ge, en: b.en, de: DE[b.en.toLowerCase()] || b.en }; };

export async function loadProgram() {
  let text;
  try {
    const res = await fetch(URL + '&_=' + Date.now());
    if (!res.ok) throw new Error('export ' + res.status);
    text = await res.text();
  } catch (e) {
    const res = await fetch(GVIZ + '&_=' + Date.now());
    if (!res.ok) throw new Error('programme sheet ' + res.status);
    text = await res.text();
  }
  const rows = parseCSV(text);

  const hi = rows.findIndex((r) => (r[0] || '').trim().toLowerCase() === 'id' && r.some((x) => /status/i.test(x)));
  if (hi < 0) throw new Error('header row not found');
  const H = rows[hi].map((h) => h.toLowerCase());
  const col = (...keys) => H.findIndex((h) => keys.some((k) => h.includes(k)));
  const isDescH = (h) => h.includes('description') || h.includes('აღწერა');
  const langOf = (h) => /\(\s*(ka|ge|geo)\s*\)|\b(ka|ge|geo)\s*$|ქართ/.test(h) ? 'ka' : /\(\s*en\s*\)|\ben\s*$|english|ინგლ/.test(h) ? 'en' : /\(\s*de\s*\)|\bde\s*$|deutsch|german|გერმ/.test(h) ? 'de' : '';
  const descCol = (l) => H.findIndex((h) => isDescH(h) && langOf(h) === l);
  // Speakers/guests: base column + optional (EN)/(DE) versions.
  const isSpkH = (h) => /speaker|სპიკერ|სტუმ|sprecher|referent|gäste|gaeste/.test(h);
  const spkLang = (h) => langOf(h) || (/sprecher|referent|gäste|gaeste/.test(h) && !/speaker|სპიკერ|სტუმ/.test(h) ? 'de' : '');
  const spkCol = (l) => H.findIndex((h) => isSpkH(h) && spkLang(h) === l);
  const C = {
    id: 0, date: col('date'), start: col('start') >= 0 ? col('start') : 2, end: col('end') >= 0 ? col('end') : 3,
    ka: col('title (ka)'), en: col('title (en)'), de: H.findIndex((h) => !isDescH(h) && !isSpkH(h) && (h.includes('/ de') || h.includes('(de)'))),
    type: col('type'), room: col('stage', 'room'), speakers: spkCol('') >= 0 ? spkCol('') : spkCol('ka'), spkEn: spkCol('en'), spkDe: spkCol('de'),
    lang: col('language'), desc: descCol(''), descKa: descCol('ka'), descEn: descCol('en'), descDe: descCol('de'), status: col('status'), show: col('website'),
    more: col('more info', 'details'), form: col('interest', 'sign-up', 'signup', 'registration', 'form link')
  };
  const g = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');

  const groups = new Map();
  const hiddenKeys = new Set();
  for (const r of rows.slice(hi + 1)) {
    if (/^sample$/i.test(g(r, C.id))) continue;
    const titleKa = g(r, C.ka);
    if (!titleKa && !g(r, C.en)) continue;
    const confirmed = /confirmed|დადასტურებული/i.test(g(r, C.status));
    const shown = /yes|დიახ/i.test(g(r, C.show));
    if (!confirmed || !shown) { hiddenKeys.add([g(r, C.date), g(r, C.start), titleKa || g(r, C.en)].join('|')); continue; }

    const key = [g(r, C.date), g(r, C.start), g(r, C.end), titleKa, g(r, C.room)].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        date: g(r, C.date), start: g(r, C.start), end: g(r, C.end),
        title: { ge: titleKa || g(r, C.en), en: g(r, C.en) || titleKa, de: g(r, C.de) || g(r, C.en) || titleKa },
        raw: { ge: titleKa, en: g(r, C.en), de: g(r, C.de) },
        type: tri(g(r, C.type)), room: tri(g(r, C.room)),
        langs: [], speakers: [], spkEn: [], spkDe: [], description: g(r, C.desc), dKa: g(r, C.descKa), dEn: g(r, C.descEn), dDe: g(r, C.descDe), more: g(r, C.more), form: g(r, C.form)
      });
    }
    const it = groups.get(key);
    g(r, C.speakers).split(',').map((s) => s.trim()).filter(Boolean)
      .forEach((s) => { if (it.speakers.indexOf(s) < 0) it.speakers.push(s); });
    [['spkEn', C.spkEn], ['spkDe', C.spkDe]].forEach(([k, c]) => g(r, c).split(',').map((s) => s.trim()).filter(Boolean)
      .forEach((s) => { if (it[k].indexOf(s) < 0) it[k].push(s); }));
    const l = tri(g(r, C.lang));
    if (l.en && !it.langs.some((x) => x.en === l.en)) it.langs.push(l);
    if (!it.description) it.description = g(r, C.desc);
    if (!it.dKa) it.dKa = g(r, C.descKa); if (!it.dEn) it.dEn = g(r, C.descEn); if (!it.dDe) it.dDe = g(r, C.descDe);
    if (!it.more) it.more = g(r, C.more);
    if (!it.form) it.form = g(r, C.form);
  }

  const toMin = (t) => { const m = /(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 9999; };
  const out = Array.from(groups.values()).sort((a, b) => (a.date || '').localeCompare(b.date || '') || toMin(a.start) - toMin(b.start));
  // Titles, descriptions and speaker names in all three languages (the Notes column is internal and never read).
  await Promise.all(out.map(async (it) => {
    const t = await tri3(it.raw.ge, it.raw.en, it.raw.de); if (t) it.title = t;
    // Per-language description columns win; empty ones fall back to the plain Description column, then machine translation.
    const d = it.description || '';
    const ka = it.dKa || (isGe(d) ? d : ''), en = it.dEn || (d && !isGe(d) ? d : ''), de = it.dDe;
    if (!it.description) it.description = ka || en || de || '';
    if (ka || en || de) it.descByLang = await tri3(ka, en, de || '');
    // Sheet EN/DE speaker columns win; otherwise Georgian names are transliterated.
    const spkAuto = it.speakers.map((s) => isGe(s) ? translit(s) : s);
    const spkEnOut = it.spkEn.length ? it.spkEn : spkAuto;
    const spkDeOut = it.spkDe.length ? it.spkDe : (it.spkEn.length ? it.spkEn : spkAuto);
    if (it.spkEn.length || it.spkDe.length || it.speakers.some(isGe)) it.speakersByLang = { ge: it.speakers.length ? it.speakers : spkEnOut, en: spkEnOut, de: spkDeOut };
    delete it.spkEn; delete it.spkDe;
    delete it.raw;
  }));
  out.hidden = hiddenKeys.size;
  return out;
}
