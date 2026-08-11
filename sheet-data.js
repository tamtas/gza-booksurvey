// Live data source: fetches book rows from the festival's Google Sheet on load.
// Columns: ID, Title (native), Language (GE/EN/DE), Author (native), Publisher,
// Description (native), image URL, Category EN, Category GE, Category DE.
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/13nvVci3LtQlGrKsFiTygtyUQJQM2nOkFm2ZrK3kgRGI/gviz/tq?tqx=out:csv&gid=0';

const ACCENTS = ['#5D71B3', '#6C5FAE', '#4A83B8', '#4A5FA0', '#8262B0', '#4E93A8'];

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normLang(v) {
  const s = (v || '').trim().toUpperCase();
  if (!s) return 'GE';
  if (s.startsWith('GE') || s.startsWith('KA')) return 'GE';
  if (s.startsWith('DE')) return 'DE';
  return 'EN';
}

// Sheet's Language column supports multi-select (checkbox) cells, joined as "GE, DE" etc.
function normLangs(v) {
  const parts = (v || '').split(/[,/]/).map((p) => normLang(p)).filter(Boolean);
  const uniq = [...new Set(parts)];
  return uniq.length ? uniq : ['GE'];
}

function slugify(s) {
  return (s || 'other').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'other';
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amt);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function findCol(header, ...needles) {
  for (const needle of needles) {
    const i = header.findIndex((h) => h.includes(needle));
    if (i >= 0) return i;
  }
  return -1;
}

function rowsToCategories(rows) {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iId = 0; // sheet's ID column has no header text; fixed position per stated column order
  const iTitle = findCol(header, 'title');
  const iLang = findCol(header, 'language');
  const iAuthor = findCol(header, 'author');
  const iPublisher = findCol(header, 'publisher');
  const iDesc = findCol(header, 'description');
  const iImage = findCol(header, 'image');
  const iCatEn = findCol(header, 'category en');
  const iCatGe = findCol(header, 'category ge');
  const iCatDe = findCol(header, 'category de');

  const catMap = new Map();
  let order = 0;
  const publishers = new Set();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = (row[iTitle] || '').trim();
    if (!title) continue;
    const catEn = (row[iCatEn] || '').trim();
    const catGe = (row[iCatGe] || '').trim();
    const catDe = (row[iCatDe] || '').trim();
    const catKey = slugify(catEn || catGe || catDe);
    if (!catMap.has(catKey)) {
      catMap.set(catKey, {
        id: catKey,
        nameEn: catEn || catGe || catDe || 'Other',
        nameGe: catGe || catEn || catDe || 'სხვა',
        nameDe: catDe || catEn || catGe || 'Andere',
        accent: ACCENTS[order % ACCENTS.length],
        books: [],
      });
      order++;
    }
    const cat = catMap.get(catKey);
    const langs = normLangs(row[iLang]);
    const lang = langs[0];
    const publisher = (row[iPublisher] || '').trim();
    if (publisher) publishers.add(publisher);
    const idx = cat.books.length;
    const accent = cat.accent;
    const light = idx % 2 === 1;
    cat.books.push({
      id: (row[iId] || `${catKey}-${idx}`).trim(),
      slotId: `cv-${slugify(row[iId] || `${catKey}-${idx}`)}`,
      title,
      lang,
      langs,
      author: (row[iAuthor] || '').trim(),
      publisher,
      description: (row[iDesc] || '').replace(/\s+/g, ' ').trim(),
      coverUrl: (row[iImage] || '').trim(),
      accent,
      bg: light ? lighten(accent, 0.55) : accent,
      textColor: light ? '#1F2430' : '#F5F6FA',
    });
  }

  return { categories: Array.from(catMap.values()), publisherCount: publishers.size };
}

export async function loadCatalogue() {
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error('Sheet fetch failed: ' + res.status);
  const text = await res.text();
  const rows = parseCSV(text).filter((r) => r.length > 1 && r.some((c) => c.trim()));
  if (rows.length < 2) throw new Error('Sheet returned no rows');
  const { categories, publisherCount } = rowsToCategories(rows);
  const totalBooks = categories.reduce((n, c) => n + c.books.length, 0);
  return { categories, totalBooks, publisherCount, source: 'sheet' };
}
