const express = require('express');
const path = require('path');
const db = require('./db');
const gen = require('./generator');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  if (!await db.getAssignment('2026-06-01')) {
    await db.upsertAssignment({ ...JUNE1_PRESET, limpeza: null });
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

    const people = gen.getPeople();
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
    const people = gen.getPeople();

    const poolMap = {
      indicador_externo: { pool: people.I, role: 'indicador' },
      indicador_interno: { pool: people.I, role: 'indicador' },
      volante1: { pool: people.V, role: 'volante' },
      volante2: { pool: people.V, role: 'volante' },
      audio: { pool: people.A, role: 'audio' },
    };

    const mapping = poolMap[role];
    if (!mapping) return res.status(400).json({ error: 'Unknown role' });

    const history = (await db.getAllAssignments()).filter(a => a.date < date);
    const currentAssignment = await db.getAssignment(date);

    res.json(gen.getAvailablePeople(mapping.pool, mapping.role, date, history, currentAssignment));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET meeting dates for a month
app.get('/api/dates/:year/:month', (req, res) => {
  res.json(gen.getMeetingDates(parseInt(req.params.year), parseInt(req.params.month)));
});

// GET people lists
app.get('/api/people', (req, res) => {
  res.json(gen.getPeople());
});

// Export for Vercel serverless; also listen when run directly
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Quadro rodando em http://localhost:${PORT}`));
}
module.exports = app;
