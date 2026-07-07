/**
 * rvm-online-parser.js
 * Busca a programação da RVM de uma planilha única no Google Sheets
 * (abas Inicial, Tesouros, Escola, Vida) e agrupa as linhas por data,
 * produzindo o mesmo formato que rvm-parser.js gera a partir dos .xlsx locais.
 */

const https = require('https');
const http  = require('http');

const SHEET_ID   = '1WiWFHSvIcgPBidtN_oVgTzX578BgxVP9';
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutos

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

// Parser de CSV com suporte a campos entre aspas (vírgulas/quebras de linha internas)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignora
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(cell => trim(cell) !== ''));
}

function trim(v) {
  return String(v == null ? '' : v).trim();
}

// Converte "DD-MM-AAAA" (ou DD/MM/AAAA) para "AAAA-MM-DD"
function toISO(dateStr) {
  const s = trim(dateStr);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return s;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function fetchSheetRows(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const csv = await fetchURL(url);
  return parseCSV(csv);
}

let _cache = null;
let _lastFetch = 0;

async function getAllSemanasOnline(forceRefresh = false) {
  const now = Date.now();
  if (_cache && !forceRefresh && (now - _lastFetch) < CACHE_TTL) return _cache;

  const [inicialRows, tesourosRows, escolaRows, vidaRows] = await Promise.all([
    fetchSheetRows('Inicial'),
    fetchSheetRows('Tesouros'),
    fetchSheetRows('Escola'),
    fetchSheetRows('Vida'),
  ]);

  const semanas = {}; // date (ISO) -> objeto da semana

  // ── Inicial: uma linha por semana ──────────────────────────────
  for (const row of inicialRows.slice(1)) {
    if (!trim(row[0])) continue;
    const date = toISO(row[0]);
    semanas[date] = {
      date,
      leitura:       trim(row[1]),
      presidente:    trim(row[2]),
      ajudante:      trim(row[3]),
      oracaoInicial: trim(row[4]),
      oracaoFinal:   trim(row[5]),
      canticos:      [trim(row[6]), trim(row[7]), trim(row[8])].filter(Boolean),
      tesouros:      [],
      escola:        [],
      vida:          [],
    };
  }

  // ── Tesouros: várias linhas por semana ─────────────────────────
  for (const row of tesourosRows.slice(1)) {
    if (!trim(row[0])) continue;
    const date = toISO(row[0]);
    if (!semanas[date]) continue;
    semanas[date].tesouros.push({
      titulo: trim(row[1]),
      salaA:  trim(row[2]),
      salaB:  trim(row[3]),
    });
  }

  // ── Escola: várias linhas por semana ───────────────────────────
  for (const row of escolaRows.slice(1)) {
    if (!trim(row[0])) continue;
    const date = toISO(row[0]);
    if (!semanas[date]) continue;
    semanas[date].escola.push({
      titulo: trim(row[1]),
      salaA:  trim(row[2]),
      salaB:  trim(row[3]),
    });
  }

  // ── Vida: várias linhas por semana ─────────────────────────────
  for (const row of vidaRows.slice(1)) {
    if (!trim(row[0])) continue;
    const date = toISO(row[0]);
    if (!semanas[date]) continue;

    const titulo = trim(row[1]);
    const pessoa = trim(row[2]);
    const isEBC   = /estudo.b[íi]blico/i.test(titulo);
    const isFinal = /coment[áa]rios finais/i.test(titulo);

    if (isEBC) {
      const partes = pessoa.split(/\s*\/\s*/);
      semanas[date].vida.push({ tipo: 'ebc', titulo, dirigente: partes[0] || '', leitor: partes[1] || '' });
    } else if (isFinal) {
      semanas[date].vida.push({ tipo: 'comentarios', titulo });
    } else {
      semanas[date].vida.push({ tipo: 'regular', titulo, pessoa });
    }
  }

  const result = Object.values(semanas).sort((a, b) => a.date.localeCompare(b.date));
  _cache = result;
  _lastFetch = now;
  return result;
}

module.exports = { getAllSemanasOnline };
