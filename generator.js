const XLSX = require('xlsx');
const path = require('path');

const COOLDOWN = 4;

function cleanName(raw) {
  if (raw == null) return null;
  return String(raw)
    .replace(/[⁠​‌‍﻿]/g, '')
    .replace(/^[\s\-–—]+/, '')
    .trim();
}

let _people = null;

function getPeople() {
  if (_people) return _people;
  const filePath = path.join(__dirname, 'PM.xlsx');
  const wb = XLSX.readFile(filePath);

  function getList(sheetName) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1 })
      .map(row => cleanName(row[0]))
      .filter(name => name && name.length > 0);
  }

  _people = {
    V: getList('V'),
    I: getList('I'),
    G: getList('G'),
    A: getList('A'),
  };

  return _people;
}

function reloadPeople() {
  _people = null;
  return getPeople();
}

function getMeetingDates(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const dow = d.getDay(); // 0=Sun, 1=Mon, 6=Sat
    if (dow === 1 || dow === 6) {
      dates.push(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      );
    }
  }
  return dates;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns array of N pairs like ["Esmeralda e Crisólito", "Ametista e Jacinto", "Topázio e Pérola"]
function computeCleaningPairs(groups) {
  const shuffled = shuffle(groups);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push(`${shuffled[i]} e ${shuffled[i + 1]}`);
  }
  // If odd number of groups, last one stands alone
  if (shuffled.length % 2 !== 0) {
    pairs.push(shuffled[shuffled.length - 1]);
  }
  return pairs;
}

// Given dateIndex within the month (0-based), return the pair string
function getLimpezaForDate(pairs, dateIndex) {
  const pairIndex = Math.floor(dateIndex / 2) % pairs.length;
  return pairs[pairIndex];
}

function getLastAssignmentIdx(person, role, history) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (role === 'indicador' && (m.indicador_externo === person || m.indicador_interno === person)) {
      return history.length - 1 - i;
    }
    if (role === 'volante' && (m.volante1 === person || m.volante2 === person)) {
      return history.length - 1 - i;
    }
    if (role === 'audio' && m.audio === person) {
      return history.length - 1 - i;
    }
  }
  return -1;
}

function pickPeople(pool, count, history, role, excludeSet) {
  const scored = pool
    .filter(p => !excludeSet.has(p))
    .map(p => ({ name: p, lastIdx: getLastAssignmentIdx(p, role, history) }));

  for (let cd = COOLDOWN; cd >= 1; cd--) {
    const available = scored.filter(s => s.lastIdx === -1 || s.lastIdx >= cd);
    if (available.length >= count) {
      // Randomize among available — removes repeated patterns
      const randomized = shuffle(available);
      return randomized.slice(0, count).map(s => s.name);
    }
  }

  // Fallback: any not excluded, shuffled
  return shuffle(scored).slice(0, count).map(s => s.name);
}

// limpeza: pre-computed string e.g. "Esmeralda e Crisólito"
function generateDay(date, history, people, audioIndex, limpeza) {
  const assignedToday = new Set();

  // 1. Audio – sequential rotation, skip on conflict
  let audio = null;
  let usedAudioIndex = audioIndex;
  for (let i = 0; i < people.A.length; i++) {
    const candidate = people.A[(audioIndex + i) % people.A.length];
    if (!assignedToday.has(candidate)) {
      audio = candidate;
      usedAudioIndex = (audioIndex + i) % people.A.length;
      break;
    }
  }
  if (audio) assignedToday.add(audio);

  // 2. Indicadores (2 from I list, random among available)
  const inds = pickPeople(people.I, 2, history, 'indicador', assignedToday);
  const [indicador_externo, indicador_interno] = inds;
  if (indicador_externo) assignedToday.add(indicador_externo);
  if (indicador_interno) assignedToday.add(indicador_interno);

  // 3. Volantes (2 from V list, random among available)
  const vols = pickPeople(people.V, 2, history, 'volante', assignedToday);
  const [volante1, volante2] = vols;

  return {
    date,
    indicador_externo: indicador_externo || null,
    indicador_interno: indicador_interno || null,
    volante1: volante1 || null,
    volante2: volante2 || null,
    audio,
    limpeza,
    audio_index: usedAudioIndex,
  };
}

// Verifica se a pessoa está designada nas próximas reuniões (futuro)
// Retorna o índice da próxima ocorrência (0 = próxima reunião, 1 = daqui a 2, etc.)
// ou -1 se não aparecer
function getNextAssignmentIdx(person, role, future) {
  for (let i = 0; i < future.length; i++) {
    const m = future[i];
    if (role === 'indicador' && (m.indicador_externo === person || m.indicador_interno === person)) return i;
    if (role === 'volante'   && (m.volante1 === person || m.volante2 === person))                   return i;
    if (role === 'audio'     && m.audio === person)                                                  return i;
  }
  return -1;
}

function getAvailablePeople(pool, role, date, history, currentAssignment, futureAssignments) {
  const otherRoles = ['indicador_externo', 'indicador_interno', 'volante1', 'volante2', 'audio'];
  const assignedElsewhere = new Set();
  if (currentAssignment) {
    for (const r of otherRoles) {
      if (currentAssignment[r]) assignedElsewhere.add(currentAssignment[r]);
    }
  }

  // Próximas COOLDOWN reuniões após a data atual (ordenadas)
  const upcoming = (futureAssignments || [])
    .filter(a => a.date > date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, COOLDOWN);

  return pool.map(p => {
    const lastIdx  = getLastAssignmentIdx(p, role, history);
    const nextIdx  = getNextAssignmentIdx(p, role, upcoming);
    const onCooldown     = lastIdx !== -1 && lastIdx < COOLDOWN;
    const scheduledAhead = nextIdx !== -1;               // designado nas próx. COOLDOWN reuniões
    const blocked        = assignedElsewhere.has(p);
    return { name: p, lastIdx, onCooldown, nextIdx, scheduledAhead, blocked };
  }).sort((a, b) => {
    // Ordem: livre → designado à frente → em cooldown → bloqueado
    if (a.blocked  !== b.blocked)        return a.blocked  ? 1 : -1;
    if (a.onCooldown !== b.onCooldown)   return a.onCooldown ? 1 : -1;
    if (a.scheduledAhead !== b.scheduledAhead) return a.scheduledAhead ? 1 : -1;
    if (a.lastIdx === -1 && b.lastIdx === -1) return 0;
    if (a.lastIdx === -1) return -1;
    if (b.lastIdx === -1) return 1;
    return b.lastIdx - a.lastIdx;
  });
}

module.exports = {
  getPeople,
  reloadPeople,
  getMeetingDates,
  generateDay,
  computeCleaningPairs,
  getLimpezaForDate,
  getAvailablePeople,
  cleanName,
};
