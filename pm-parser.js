/**
 * pm-parser.js
 * Busca as listas de pessoas da planilha PM no Google Sheets.
 * Mesma estrutura do PM.xlsx: abas V, I, G, A, L com nomes na coluna A.
 */

const https = require('https');
const http  = require('http');

const SHEET_ID = '1wVziKm10M8BB0DS-OHzzXXRtHRmdT0gZN2f5tYCDyII';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

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

function cleanName(raw) {
  if (!raw) return null;
  return String(raw)
    .replace(/[⁠​‌‍﻿]/g, '')
    .replace(/^[\s\-–—]+/, '')
    .trim();
}

async function fetchSheetNames(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const csv = await fetchURL(url);
  const names = [];
  for (const line of csv.split('\n')) {
    if (!line.trim()) continue;
    // Extrai primeira célula da linha CSV (pode estar entre aspas)
    const match = line.match(/^"((?:[^"]|"")*)"/) || line.match(/^([^,\r\n]*)/);
    const cell = match ? match[1].replace(/""/g, '"') : '';
    const name = cleanName(cell);
    if (name) names.push(name);
  }
  return names;
}

let _cache = null;
let _lastFetch = 0;

async function getPeopleFromSheets(forceRefresh = false) {
  const now = Date.now();
  if (_cache && !forceRefresh && (now - _lastFetch) < CACHE_TTL) return _cache;

  const [V, I, G, A, L] = await Promise.all([
    fetchSheetNames('V'),
    fetchSheetNames('I'),
    fetchSheetNames('G'),
    fetchSheetNames('A'),
    fetchSheetNames('L'),
  ]);

  _cache = { V, I, G, A, L };
  _lastFetch = now;
  return _cache;
}

module.exports = { getPeopleFromSheets };
