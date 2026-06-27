let currentYear = 2026;
let currentMonth = 6;
let assignments = [];
let pickerContext = null;

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const ROLE_LABELS = {
  indicador_externo: 'Indicador Externo',
  indicador_interno: 'Indicador Interno',
  volante1: 'Microfone Volante 1',
  volante2: 'Microfone Volante 2',
  audio: 'Áudio/Vídeo',
};

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${day}/${months[parseInt(month) - 1]}`;
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAssignments() {
  const res = await fetch(`/api/assignments/${currentYear}/${currentMonth}`);
  assignments = await res.json();
  render();
}

async function generateMonth(force = false) {
  if (force && assignments.length > 0) {
    const ok = confirm(
      `Isso vai apagar e regenerar todas as designações de ${MONTH_NAMES[currentMonth-1]} ${currentYear}.\n\n` +
      `O dia 01/jun será mantido com os dados originais.\n\nContinuar?`
    );
    if (!ok) return;
  }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.textContent = 'Gerando…';

  try {
    const res = await fetch(
      `/api/assignments/generate/${currentYear}/${currentMonth}`,
      { method: 'POST' }
    );
    assignments = await res.json();
    render();
  } finally {
    btn.disabled = false;
    updateGenerateBtn();
  }
}

async function updateAssignment(id, field, value) {
  await fetch(`/api/assignments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
  await fetchAssignments();
}

async function openPicker(date, role, assignmentId) {
  pickerContext = { date, role, assignmentId };

  const res = await fetch(`/api/available/${date}/${role}`);
  const people = await res.json();

  const current = assignments.find(a => a.id === assignmentId);
  const currentValue = current ? current[role] : null;

  document.getElementById('modalTitle').textContent =
    `${ROLE_LABELS[role] || role} — ${formatDate(date)}`;

  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  // Opção "Sem Designado"
  const semDiv = document.createElement('div');
  semDiv.className = 'picker-divider';
  semDiv.textContent = 'Sem Designado';
  body.appendChild(semDiv);

  const semItem = document.createElement('div');
  semItem.className = 'picker-item' + (!currentValue ? ' selected' : '');
  const semSpan = document.createElement('span');
  semSpan.textContent = '— (nenhum)';
  semSpan.style.cssText = 'color:#999;font-style:italic';
  semItem.appendChild(semSpan);
  semItem.addEventListener('click', () => selectPerson(null));
  body.appendChild(semItem);

  let shownAheadDiv = false;
  let shownCoolDiv  = false;
  let shownBlockDiv = false;

  people.forEach(p => {
    // ── Separadores de seção ──────────────────────────────
    if (p.blocked && !shownBlockDiv) {
      shownBlockDiv = true;
      const div = document.createElement('div');
      div.className = 'picker-divider';
      div.textContent = 'Indisponível hoje';
      body.appendChild(div);
    } else if (p.onCooldown && !p.blocked && !shownCoolDiv) {
      shownCoolDiv = true;
      const div = document.createElement('div');
      div.className = 'picker-divider';
      div.textContent = 'Em intervalo (usou recentemente)';
      body.appendChild(div);
    } else if (p.scheduledAhead && !p.onCooldown && !p.blocked && !shownAheadDiv) {
      shownAheadDiv = true;
      const div = document.createElement('div');
      div.className = 'picker-divider';
      div.textContent = 'Já designado nas próximas reuniões';
      body.appendChild(div);
    }

    // ── Item ─────────────────────────────────────────────
    const item = document.createElement('div');
    item.className = 'picker-item' +
      (p.name === currentValue    ? ' selected'    : '') +
      (p.blocked                  ? ' blocked'     : '') +
      (p.onCooldown && !p.blocked ? ' on-cooldown' : '') +
      (p.scheduledAhead && !p.onCooldown && !p.blocked ? ' scheduled-ahead' : '');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;

    const badge = document.createElement('span');
    badge.className = 'picker-badge';

    if (p.blocked) {
      badge.textContent = 'outro serviço';
      badge.classList.add('badge-block');
    } else if (p.onCooldown) {
      // Mostra tanto passado quanto futuro se ambos existirem
      let txt = `↩ ${p.lastIdx + 1} atrás`;
      if (p.scheduledAhead) txt += `  ·  ↪ ${p.nextIdx + 1} à frente`;
      badge.textContent = txt;
      badge.classList.add('badge-cool');
    } else if (p.scheduledAhead) {
      badge.textContent = `↪ ${p.nextIdx + 1} reunião(ões) à frente`;
      badge.classList.add('badge-ahead');
    } else if (p.lastIdx === -1) {
      badge.textContent = 'nunca designado';
      badge.classList.add('badge-ok');
    } else {
      badge.textContent = `↩ ${p.lastIdx + 1} reunião(ões) atrás`;
      badge.classList.add('badge-ok');
    }

    item.appendChild(nameSpan);
    item.appendChild(badge);

    if (!p.blocked) {
      item.addEventListener('click', () => selectPerson(p.name));
    }

    body.appendChild(item);
  });

  document.getElementById('modalOverlay').classList.add('active');
}

async function selectPerson(name) {
  if (!pickerContext) return;
  const { date, role, assignmentId } = pickerContext;
  await updateAssignment(assignmentId, role, name);
  closeModal();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  pickerContext = null;
}

// ── Render ───────────────────────────────────────────────────────────────────

function updateGenerateBtn() {
  const btn = document.getElementById('generateBtn');
  if (assignments.length > 0) {
    btn.textContent = 'Regenerar Mês';
    btn.classList.add('regen');
    btn.onclick = () => generateMonth(true);
  } else {
    btn.textContent = 'Gerar Mês';
    btn.classList.remove('regen');
    btn.onclick = () => generateMonth(false);
  }
}

function nameChip(value, date, role, id) {
  const span = document.createElement('span');
  span.className = 'name-chip' + (value ? '' : ' empty');
  span.textContent = value || '—';
  span.title = 'Clique para alterar';
  span.addEventListener('click', () => openPicker(date, role, id));
  return span;
}

function render() {
  document.getElementById('monthLabel').textContent =
    `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

  updateGenerateBtn();

  const mechBody = document.getElementById('mechanicalBody');
  const cleanBody = document.getElementById('cleanBody');
  mechBody.innerHTML = '';
  cleanBody.innerHTML = '';

  if (assignments.length === 0) {
    mechBody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          Nenhuma designação gerada para este mês.
          <div class="hint">Clique em <strong>Gerar Mês</strong> para criar automaticamente.</div>
        </div>
      </td></tr>`;
    cleanBody.innerHTML = `<tr><td colspan="2"><div class="empty-state">—</div></td></tr>`;
    return;
  }

  assignments.forEach(a => {
    // Mechanical row
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.className = 'cell-data';
    tdDate.textContent = formatDate(a.date);
    tr.appendChild(tdDate);

    const MOBILE_LABELS = {
      indicador_externo: 'Ind. Externo',
      indicador_interno: 'Ind. Interno',
      volante1: 'Mic. Volante 1',
      volante2: 'Mic. Volante 2',
      audio: 'Áudio/Vídeo',
    };

    for (const role of ['indicador_externo', 'indicador_interno', 'volante1', 'volante2', 'audio']) {
      const td = document.createElement('td');
      td.setAttribute('data-label', MOBILE_LABELS[role]);
      td.appendChild(nameChip(a[role], a.date, role, a.id));
      tr.appendChild(td);
    }

    mechBody.appendChild(tr);

    // Cleaning row
    const trC = document.createElement('tr');

    const tdDateC = document.createElement('td');
    tdDateC.className = 'cell-data';
    tdDateC.textContent = formatDate(a.date);

    const tdLimpeza = document.createElement('td');
    const pairSpan = document.createElement('span');
    pairSpan.className = 'limpeza-pair';
    pairSpan.textContent = a.limpeza || '—';
    tdLimpeza.appendChild(pairSpan);

    trC.appendChild(tdDateC);
    trC.appendChild(tdLimpeza);
    cleanBody.appendChild(trC);
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.getElementById('prevMonth').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  fetchAssignments();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  fetchAssignments();
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

fetchAssignments();
