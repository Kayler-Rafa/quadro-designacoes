const pm = require('./pm-parser');

const COOLDOWN         = 4;
const LEITURA_COOLDOWN = 8;

function cleanName(raw) {
  if (raw == null) return null;
  return String(raw)
    .replace(/[⁠​‌‍﻿]/g, '')
    .replace(/^[\s\-–—]+/, '')
    .trim();
}

async function getPeople() {
  return pm.getPeopleFromSheets();
}

async function reloadPeople() {
  return pm.getPeopleFromSheets(true);
}

function getMeetingDates(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();
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

function computeCleaningPairs(groups) {
  const shuffled = shuffle(groups);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push(`${shuffled[i]} e ${shuffled[i + 1]}`);
  }
  if (shuffled.length % 2 !== 0) {
    pairs.push(shuffled[shuffled.length - 1]);
  }
  return pairs;
}

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
      return shuffle(available).slice(0, count).map(s => s.name);
    }
  }

  return shuffle(scored).slice(0, count).map(s => s.name);
}

function generateDay(date, history, people, audioIndex, limpeza) {
  const assignedToday = new Set();

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

  const inds = pickPeople(people.I, 2, history, 'indicador', assignedToday);
  const [indicador_externo, indicador_interno] = inds;
  if (indicador_externo) assignedToday.add(indicador_externo);
  if (indicador_interno) assignedToday.add(indicador_interno);

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

  const upcoming = (futureAssignments || [])
    .filter(a => a.date > date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, COOLDOWN);

  return pool.map(p => {
    const lastIdx        = getLastAssignmentIdx(p, role, history);
    const nextIdx        = getNextAssignmentIdx(p, role, upcoming);
    const onCooldown     = lastIdx !== -1 && lastIdx < COOLDOWN;
    const scheduledAhead = nextIdx !== -1;
    const blocked        = assignedElsewhere.has(p);
    return { name: p, lastIdx, onCooldown, nextIdx, scheduledAhead, blocked };
  }).sort((a, b) => {
    if (a.blocked     !== b.blocked)        return a.blocked     ? 1 : -1;
    if (a.onCooldown  !== b.onCooldown)     return a.onCooldown  ? 1 : -1;
    if (a.scheduledAhead !== b.scheduledAhead) return a.scheduledAhead ? 1 : -1;
    if (a.lastIdx === -1 && b.lastIdx === -1) return 0;
    if (a.lastIdx === -1) return -1;
    if (b.lastIdx === -1) return 1;
    return b.lastIdx - a.lastIdx;
  });
}

/* ── Leitura ──────────────────────────────────────────────────────────────── */

// Retorna quantas reuniões de leitura ocorreram após a última vez do person
// antes de targetDate. Retorna -1 se nunca foi designado.
function getLeituraPosition(person, allLeitura, targetDate) {
  const past = allLeitura.filter(l => l.date < targetDate);

  let lastDate = null;
  for (const entry of past) {
    if (entry.leitura === person && (!lastDate || entry.date > lastDate)) {
      lastDate = entry.date;
    }
  }

  if (!lastDate) return -1;
  return past.filter(l => l.date > lastDate).length;
}

// Retorna o índice (0-based) em futureLeitura onde o person aparece, ou -1
function getLeituraNextIdx(person, futureLeitura) {
  for (let i = 0; i < futureLeitura.length; i++) {
    if (futureLeitura[i].leitura === person) return i;
  }
  return -1;
}

function generateLeituraMonth(rfsDates, leituraHistory, allAssignments, rfsData, lPool) {
  if (!lPool || lPool.length === 0) return [];
  const results = [];
  const working = [...leituraHistory];

  for (const date of rfsDates) {
    const rfsMeeting = rfsData.find(r => r.date === date);
    const mech       = allAssignments.find(a => a.date === date);

    const excluded = new Set();
    if (rfsMeeting?.presidente) excluded.add(rfsMeeting.presidente);
    if (mech) {
      for (const f of ['indicador_externo', 'indicador_interno', 'volante1', 'volante2', 'audio']) {
        if (mech[f]) excluded.add(mech[f]);
      }
    }

    const candidates = lPool
      .filter(p => !excluded.has(p))
      .map(p => ({ name: p, pos: getLeituraPosition(p, working, date) }));

    const free = candidates.filter(c => c.pos === -1 || c.pos >= LEITURA_COOLDOWN);

    let picked;
    if (free.length > 0) {
      picked = shuffle(free)[0].name;
    } else {
      const sorted = [...candidates].sort((a, b) => {
        if (a.pos === -1) return -1;
        if (b.pos === -1) return 1;
        return b.pos - a.pos;
      });
      picked = sorted[0]?.name || null;
    }

    const entry = { date, leitura: picked };
    results.push(entry);
    if (picked) working.push(entry);
  }

  return results;
}

function getAvailableLeitura(lPool, date, allLeitura, rfsData, allAssignments) {
  const rfsMeeting = rfsData.find(r => r.date === date);
  const mech       = allAssignments.find(a => a.date === date);

  const blockedSet = new Set();
  if (rfsMeeting?.presidente) blockedSet.add(rfsMeeting.presidente);
  if (mech) {
    for (const f of ['indicador_externo', 'indicador_interno', 'volante1', 'volante2', 'audio']) {
      if (mech[f]) blockedSet.add(mech[f]);
    }
  }

  // Exclui a data atual do histórico para não influenciar o cálculo
  const history = allLeitura.filter(l => l.date !== date);

  const futureLeitura = history
    .filter(l => l.date > date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, LEITURA_COOLDOWN);

  return lPool.map(p => {
    const lastPos      = getLeituraPosition(p, history, date);
    const nextIdx      = getLeituraNextIdx(p, futureLeitura);
    const onCooldown   = lastPos !== -1 && lastPos < LEITURA_COOLDOWN;
    const scheduledAhead = nextIdx !== -1;
    const blocked      = blockedSet.has(p);
    return { name: p, lastPos, onCooldown, nextIdx, scheduledAhead, blocked };
  }).sort((a, b) => {
    if (a.blocked      !== b.blocked)        return a.blocked      ? 1 : -1;
    if (a.onCooldown   !== b.onCooldown)     return a.onCooldown   ? 1 : -1;
    if (a.scheduledAhead !== b.scheduledAhead) return a.scheduledAhead ? 1 : -1;
    if (a.lastPos === -1 && b.lastPos === -1) return 0;
    if (a.lastPos === -1) return -1;
    if (b.lastPos === -1) return 1;
    return b.lastPos - a.lastPos;
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
  generateLeituraMonth,
  getAvailableLeitura,
};
