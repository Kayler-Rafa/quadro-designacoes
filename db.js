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
  if (IS_VERCEL) {
    const data = await getKV().get(DATA_KEY);
    return data || { assignments: [], settings: {} };
  }
  if (!fs.existsSync(DB_FILE)) return { assignments: [], settings: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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

module.exports = {
  getMonthAssignments,
  getAssignment,
  upsertAssignment,
  updateAssignment,
  deleteMonthAssignments,
  getAllAssignments,
};
