// Live programme: reads the "Program Builder" tab of the festival programme sheet.
// Only rows with Status = Confirmed and Show on Website = Yes are published (per the sheet's own rule).
const SHEET_ID = '1knPP2VwY5CvEdDXyehxpXybvVifsoVSYytzrhikYxOk';
const GID = '1632004297';
const URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID;
const GVIZ = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&headers=0&gid=' + GID;

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
  const C = {
    id: 0, date: col('date'), start: col('start') >= 0 ? col('start') : 2, end: col('end') >= 0 ? col('end') : 3,
    ka: col('title (ka)'), en: col('title (en)'), de: col('/ de', '(de)'),
    type: col('type'), room: col('stage', 'room'), speakers: col('speakers'),
    lang: col('language'), desc: col('description'), status: col('status'), show: col('website'),
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
        type: tri(g(r, C.type)), room: tri(g(r, C.room)),
        langs: [], speakers: [], description: g(r, C.desc), more: g(r, C.more), form: g(r, C.form)
      });
    }
    const it = groups.get(key);
    g(r, C.speakers).split(',').map((s) => s.trim()).filter(Boolean)
      .forEach((s) => { if (it.speakers.indexOf(s) < 0) it.speakers.push(s); });
    const l = tri(g(r, C.lang));
    if (l.en && !it.langs.some((x) => x.en === l.en)) it.langs.push(l);
    if (!it.description) it.description = g(r, C.desc);
    if (!it.more) it.more = g(r, C.more);
    if (!it.form) it.form = g(r, C.form);
  }

  const toMin = (t) => { const m = /(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 9999; };
  const out = Array.from(groups.values()).sort((a, b) => (a.date || '').localeCompare(b.date || '') || toMin(a.start) - toMin(b.start));
  out.hidden = hiddenKeys.size;
  return out;
}
