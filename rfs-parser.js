/**
 * rfs-parser.js
 * Busca e parseia a planilha de Discurso Público (Google Sheets → CSV).
 * Retorna array de reuniões de fim de semana estruturadas.
 */

const https = require('https');
const http  = require('http');

const SHEET_ID  = '1b0s7qxgCtlitwPtCluQDpOwpgOFakdZ9oDzW_-Hkjnw';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

/* ── HTTP fetch com suporte a redirect ─────────────────────────────────── */
function fetchURL(url, depth = 0) {
  if (depth > 6) return Promise.reject(new Error('Muitos redirecionamentos'));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        const abs = loc.startsWith('http') ? loc : new URL(loc, url).href;
        res.resume();
        return fetchURL(abs, depth + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

/* ── Parser CSV (suporta campos entre aspas) ───────────────────────────── */
function parseCSVRow(line) {
  const result = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else if (ch !== '\r') {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/* ── DD/MM/YYYY → "YYYY-MM-DD" ─────────────────────────────────────────── */
function toISO(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/* ── Classifica o tipo do evento ────────────────────────────────────────── */
function detectTipo(tema, obs) {
  const t = (tema || '').toLowerCase();
  const o = (obs  || '').toLowerCase();
  if (t.includes('congresso') || o.includes('congresso'))    return 'congresso';
  if (t.includes('assembl')   || o.includes('assembl'))      return 'assembleia';
  if (t.includes('especial')  || o.includes('especial'))     return 'especial';
  if (t.includes('betel')     || o.includes('betel'))        return 'especial';
  if (o.includes('sc')        || o.includes('visita do sc')) return 'especial';
  return 'normal';
}

/* ── Fetch + parse ──────────────────────────────────────────────────────── */
async function getRFS() {
  const csv  = await fetchURL(SHEET_URL);
  const lines = csv.split('\n').filter(l => l.trim());

  // Linha 0 = cabeçalho — pular
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseCSVRow(lines[i]);

    const dateStr = r[0] || '';
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) continue;

    const isoDate    = toISO(dateStr);
    if (!isoDate) continue;

    const tema       = r[1] || '';
    const congregacao= r[2] || '';
    const orador     = r[3] || '';
    const presidente = r[4] || '';
    const numero     = r[5] || '';
    const observacao = r[8] || '';

    result.push({
      date:       isoDate,
      dateOrig:   dateStr,
      tema,
      congregacao,
      orador,
      presidente,
      numero,
      observacao,
      tipo: detectTipo(tema, observacao),
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { getRFS };
