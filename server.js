const express = require('express');
const path = require('path');
const db = require('./db');
const gen = require('./generator');
const mesQuadro = require('./public/mes-quadro');
const rvmOnline = require('./rvm-online-parser');
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

    // Histórico de outros meses, usado para os cálculos de intervalo/rotação.
    // Tudo abaixo roda em memória e só toca o banco uma vez, no final —
    // evita a corrida de várias leituras/gravações por data que corrompia
    // a rotação de áudio quando duas gerações rodavam em paralelo.
    const history = (await db.getAllAssignments())
      .filter(a => !mesQuadro.isInBoardMonth(a.date, year, month));
    const newAssignments = [];

    const isJune1Month = year === 2026 && month === 6;
    if (isJune1Month) {
      const june1PairIdx = Math.floor(0 / 2) % pairs.length;
      const preset = { ...JUNE1_PRESET, limpeza: pairs[june1PairIdx] };
      newAssignments.push(preset);
      history.push(preset);
    }

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      if (isJune1Month && date === '2026-06-01') continue; // já coberto pelo preset

      const last = history[history.length - 1];
      const audioIndex = last != null ? (last.audio_index + 1) % people.A.length : 0;
      const limpeza = gen.getLimpezaForDate(pairs, i);

      const assignment = gen.generateDay(date, history, people, audioIndex, limpeza);
      newAssignments.push(assignment);
      history.push(assignment);
    }

    const result = await db.regenerateMonthAssignments(year, month, newAssignments);
    res.json(result);
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

// GET substituições registradas para um mês
app.get('/api/substituicoes/:year/:month', async (req, res) => {
  try {
    const subs = await db.getSubstituicoesMonth(
      parseInt(req.params.year),
      parseInt(req.params.month)
    );
    res.json(subs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT registra (ou limpa, se nome for null) a substituição de uma designação
const SUBSTITUICAO_ROLES = ['indicador_externo', 'indicador_interno', 'volante1', 'volante2', 'audio'];
app.put('/api/substituicoes/:date/:role', async (req, res) => {
  try {
    if (!SUBSTITUICAO_ROLES.includes(req.params.role)) {
      return res.status(400).json({ error: 'role inválido' });
    }
    await db.upsertSubstituicao(req.params.date, req.params.role, req.body.nome || null);
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

// GET programação RVM (planilha online)
app.get('/api/rvm', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const semanas = await rvmOnline.getAllSemanasOnline(forceRefresh);
    res.json(semanas);
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

    const [people, rfsData, allLeitura, allAssignments] = await Promise.all([
      gen.getPeople(),
      rfs.getRFS(),
      db.getAllLeitura(),
      db.getAllAssignments(),
    ]);

    const rfsDates = rfsData
      .filter(r => mesQuadro.isInBoardMonth(r.date, year, month))
      .map(r => r.date);

    await db.deleteLeituraMonth(year, month);

    const leituraHistory = allLeitura
      .filter(l => !mesQuadro.isInBoardMonth(l.date, year, month));
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
