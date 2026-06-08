const express = require('express');
const path = require('path');
const db = require('./db');
const gen = require('./generator');
const rvm    = require('./rvm-parser');
const rfs    = require('./rfs-parser');
const grupos = require('./grupos-parser');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/mapa', express.static(path.join(__dirname, 'mapa')));

// Rota limpa para a página de designações
app.get('/designacoes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'designacoes.html'));
});

// Mechanical preset for June 1, 2026 (audio_index=2 → Rafael Diniz used, next=Kauã=3)
const JUNE1_PRESET = {
  date: '2026-06-01',
  indicador_externo: 'Kauã',
  indicador_interno: 'Felipe Alcântara',
  volante1: 'Silviano',
  volante2: 'Allisson',
  audio: 'Rafael Diniz',
  audio_index: 2,
};

async function initPreset() {
  try {
    if (!await db.getAssignment('2026-06-01')) {
      await db.upsertAssignment({ ...JUNE1_PRESET, limpeza: null });
    }
  } catch (e) {
    console.error('[initPreset] Falhou (banco não conectado?):', e.message);
  }
}
initPreset();

// GET assignments for a month
app.get('/api/assignments/:year/:month', async (req, res) => {
  try {
    const assignments = await db.getMonthAssignments(
      parseInt(req.params.year),
      parseInt(req.params.month)
    );
    res.json(assignments);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST generate (or regenerate) assignments for a month
app.post('/api/assignments/generate/:year/:month', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    const people = await gen.getPeople();
    const dates = gen.getMeetingDates(year, month);
    const pairs = gen.computeCleaningPairs(people.G);

    await db.deleteMonthAssignments(year, month);

    if (year === 2026 && month === 6) {
      const june1PairIdx = Math.floor(0 / 2) % pairs.length;
      await db.upsertAssignment({ ...JUNE1_PRESET, limpeza: pairs[june1PairIdx] });
    }

    let history = await db.getAllAssignments();

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      if (await db.getAssignment(date)) continue;

      const last = history[history.length - 1];
      const audioIndex = last != null ? (last.audio_index + 1) % people.A.length : 0;
      const limpeza = gen.getLimpezaForDate(pairs, i);

      const assignment = gen.generateDay(date, history, people, audioIndex, limpeza);
      await db.upsertAssignment(assignment);
      history = await db.getAllAssignments();
    }

    res.json(await db.getMonthAssignments(year, month));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update a specific assignment field
app.put('/api/assignments/:id', async (req, res) => {
  try {
    await db.updateAssignment(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET available people for a role on a date
app.get('/api/available/:date/:role', async (req, res) => {
  try {
    const { date, role } = req.params;
    const people = await gen.getPeople();

    const poolMap = {
      indicador_externo: { pool: people.I, role: 'indicador' },
      indicador_interno: { pool: people.I, role: 'indicador' },
      volante1: { pool: people.V, role: 'volante' },
      volante2: { pool: people.V, role: 'volante' },
      audio: { pool: people.A, role: 'audio' },
    };

    const mapping = poolMap[role];
    if (!mapping) return res.status(400).json({ error: 'Unknown role' });

    const all = await db.getAllAssignments();
    const history           = all.filter(a => a.date < date);
    const futureAssignments = all.filter(a => a.date > date);
    const currentAssignment = await db.getAssignment(date);

    res.json(gen.getAvailablePeople(mapping.pool, mapping.role, date, history, currentAssignment, futureAssignments));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET health / diagnostics
app.get('/api/health', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const info = {
    isVercel: !!process.env.VERCEL,
    hasUpstashUrl: !!process.env.KV_REST_API_URL,
    hasUpstashToken: !!process.env.KV_REST_API_TOKEN,
    xlsxExists: fs.existsSync(path.join(__dirname, 'PM.xlsx')),
    publicExists: fs.existsSync(path.join(__dirname, 'public')),
  };
  try {
    const all = await db.getAllAssignments();
    info.dbOk = true;
    info.assignmentCount = all.length;
  } catch (e) {
    info.dbError = e.message;
  }
  try {
    const people = await gen.getPeople();
    info.peopleOk = true;
    info.volantes = people.V.length;
  } catch (e) {
    info.peopleError = e.message;
  }
  res.json(info);
});

// GET reuniões de fim de semana (Google Sheets)
app.get('/api/rfs', async (req, res) => {
  try {
    res.json(await rfs.getRFS());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET programação RVM (lê pasta /semanas)
app.get('/api/rvm', (req, res) => {
  try {
    res.json(rvm.getAllSemanas());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET grupos de campo
app.get('/api/grupos', async (req, res) => {
  try {
    res.json(await grupos.getGrupos());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Leitura ────────────────────────────────────────────────────────────────

// GET leitura for a month
app.get('/api/leitura/:year/:month', async (req, res) => {
  try {
    res.json(await db.getLeituraMonth(parseInt(req.params.year), parseInt(req.params.month)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST generate leitura for a month
app.post('/api/leitura/generate/:year/:month', async (req, res) => {
  try {
    const year   = parseInt(req.params.year);
    const month  = parseInt(req.params.month);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;

    const [people, rfsData, allLeitura, allAssignments] = await Promise.all([
      gen.getPeople(),
      rfs.getRFS(),
      db.getAllLeitura(),
      db.getAllAssignments(),
    ]);

    const rfsDates = rfsData.filter(r => r.date.startsWith(prefix)).map(r => r.date);

    await db.deleteLeituraMonth(year, month);

    const leituraHistory = allLeitura.filter(l => !l.date.startsWith(prefix));
    const generated = gen.generateLeituraMonth(rfsDates, leituraHistory, allAssignments, rfsData, people.L || []);

    for (const entry of generated) {
      await db.upsertLeitura(entry);
    }

    res.json(await db.getLeituraMonth(year, month));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update a leitura assignment
app.put('/api/leitura/:id', async (req, res) => {
  try {
    await db.updateLeitura(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET available people for leitura on a date
app.get('/api/available-leitura/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const [people, rfsData, allLeitura, allAssignments] = await Promise.all([
      gen.getPeople(),
      rfs.getRFS(),
      db.getAllLeitura(),
      db.getAllAssignments(),
    ]);
    res.json(gen.getAvailableLeitura(people.L || [], date, allLeitura, rfsData, allAssignments));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET meeting dates for a month
app.get('/api/dates/:year/:month', (req, res) => {
  res.json(gen.getMeetingDates(parseInt(req.params.year), parseInt(req.params.month)));
});

// GET people lists
app.get('/api/people', async (req, res) => {
  try {
    res.json(await gen.getPeople());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export for Vercel serverless; also listen when run directly
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Quadro rodando em http://localhost:${PORT}`));
}
module.exports = app;
