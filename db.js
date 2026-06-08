const fs = require('fs');
const path = require('path');

// In production (Vercel), use KV. Locally, use data.json.
const IS_VERCEL = !!process.env.VERCEL;
const DB_FILE = path.join(__dirname, 'data.json');
const DATA_KEY = 'quadro-data';

let _kv;
function getKV() {
  if (!_kv) {
    const { Redis } = require('@upstash/redis');
    _kv = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return _kv;
}

async function load() {
  let data;
  if (IS_VERCEL) {
    data = await getKV().get(DATA_KEY);
    data = data || {};
  } else {
    if (!fs.existsSync(DB_FILE)) data = {};
    else data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
  if (!data.assignments) data.assignments = [];
  if (!data.leitura)     data.leitura     = [];
  if (!data.settings)    data.settings    = {};
  return data;
}

async function persist(data) {
  if (IS_VERCEL) {
    await getKV().set(DATA_KEY, data);
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  }
}

async function getMonthAssignments(year, month) {
  const data = await load();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return data.assignments
    .filter(a => a.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getAssignment(date) {
  const data = await load();
  return data.assignments.find(a => a.date === date) || null;
}

async function upsertAssignment(assignment) {
  const data = await load();
  const idx = data.assignments.findIndex(a => a.date === assignment.date);
  if (idx >= 0) {
    data.assignments[idx] = { ...data.assignments[idx], ...assignment };
  } else {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    data.assignments.push({ id, ...assignment });
  }
  data.assignments.sort((a, b) => a.date.localeCompare(b.date));
  await persist(data);
}

async function updateAssignment(id, updates) {
  const data = await load();
  const idx = data.assignments.findIndex(a => a.id === id);
  if (idx >= 0) {
    data.assignments[idx] = { ...data.assignments[idx], ...updates };
    await persist(data);
  }
}

async function deleteMonthAssignments(year, month, keepDates = []) {
  const data = await load();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  data.assignments = data.assignments.filter(
    a => !a.date.startsWith(prefix) || keepDates.includes(a.date)
  );
  await persist(data);
}

async function getAllAssignments() {
  const data = await load();
  return [...data.assignments].sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Leitura ─────────────────────────────────────────────────────────────── */

async function getLeituraMonth(year, month) {
  const data = await load();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return data.leitura
    .filter(l => l.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getAllLeitura() {
  const data = await load();
  return [...data.leitura].sort((a, b) => a.date.localeCompare(b.date));
}

async function upsertLeitura(entry) {
  const data = await load();
  const idx = data.leitura.findIndex(l => l.date === entry.date);
  if (idx >= 0) {
    data.leitura[idx] = { ...data.leitura[idx], ...entry };
  } else {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    data.leitura.push({ id, ...entry });
  }
  data.leitura.sort((a, b) => a.date.localeCompare(b.date));
  await persist(data);
}

async function updateLeitura(id, updates) {
  const data = await load();
  const idx = data.leitura.findIndex(l => l.id === id);
  if (idx >= 0) {
    data.leitura[idx] = { ...data.leitura[idx], ...updates };
    await persist(data);
  }
}

async function deleteLeituraMonth(year, month) {
  const data = await load();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  data.leitura = data.leitura.filter(l => !l.date.startsWith(prefix));
  await persist(data);
}

module.exports = {
  getMonthAssignments,
  getAssignment,
  upsertAssignment,
  updateAssignment,
  deleteMonthAssignments,
  getAllAssignments,
  getLeituraMonth,
  getAllLeitura,
  upsertLeitura,
  updateLeitura,
  deleteLeituraMonth,
};
