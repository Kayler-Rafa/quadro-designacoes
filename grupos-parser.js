/**
 * grupos-parser.js
 * Busca e parseia a planilha de Grupos de Campo (Google Sheets → CSV).
 * Retorna array de grupos com dirigente, ajudante, local e lista de membros.
 */

const https = require('https');
const http  = require('http');

const SHEET_ID  = '1HWnvhlOdp8OEosaE4bIX8UTbBJNfE5nu';
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

/* ── Fetch + parse ──────────────────────────────────────────────────────── */
async function getGrupos() {
  const csv  = await fetchURL(SHEET_URL);
  const lines = csv.split('\n').filter(l => l.trim());
  const rows  = lines.map(parseCSVRow);

  // Linha 0: nomes dos grupos  (AMETISTA, ESMERALDA, …)
  // Linha 1: Dirigente: X
  // Linha 2: Ajudante: X
  // Linha 3: Local: X
  // Linha 4: Total X = N
  // Linha 5+: membros

  const nomes = rows[0];
  const numGrupos = nomes.length;

  const grupos = [];
  for (let i = 0; i < numGrupos; i++) {
    const nome = (nomes[i] || '').trim();
    if (!nome) continue;

    const dirigente = (rows[1]?.[i] || '').replace(/^Dirigente:\s*/i, '').trim();
    const ajudante  = (rows[2]?.[i] || '').replace(/^Ajudante:\s*/i,  '').trim();
    const local     = (rows[3]?.[i] || '').replace(/^Local:\s*/i,     '').trim();

    // Extrai número do total: "Total Ametista = 19" → 19
    const totalRaw  = (rows[4]?.[i] || '');
    const totalNum  = parseInt((totalRaw.match(/=\s*(\d+)/) || [])[1] || '0', 10);

    // Membros: linhas 5 em diante, coluna i, removendo vazios
    const membros = rows.slice(5)
      .map(r => (r[i] || '').trim())
      .filter(n => n.length > 0);

    grupos.push({ nome, dirigente, ajudante, local, total: totalNum, membros });
  }

  return grupos;
}

module.exports = { getGrupos };
