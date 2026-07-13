const _now2 = new Date();
let currentYear  = _now2.getFullYear();
let currentMonth = _now2.getMonth() + 1;

let assignments    = [];
let substituicoes   = []; // [{date, role, nome}]
let people          = {};
let pickerCtx       = null; // { date, role }

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const ROLES = ['indicador_externo', 'indicador_interno', 'volante1', 'volante2', 'audio'];

const ROLE_LABELS = {
  indicador_externo: 'Indicador Externo',
  indicador_interno: 'Indicador Interno',
  volante1: 'Microfone Volante 1',
  volante2: 'Microfone Volante 2',
  audio: 'Áudio/Vídeo',
};

const ROLE_LIST = {
  indicador_externo: 'I',
  indicador_interno: 'I',
  volante1: 'V',
  volante2: 'V',
  audio: 'A',
};

const MOBILE_LABELS = {
  indicador_externo: 'Ind. Externo',
  indicador_interno: 'Ind. Interno',
  volante1: 'Mic. Volante 1',
  volante2: 'Mic. Volante 2',
  audio: 'Áudio/Vídeo',
};

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${day}/${months[parseInt(month) - 1]}`;
}

function h(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getSub(date, role) {
  const found = substituicoes.find(s => s.date === date && s.role === role);
  return found ? found.nome : null;
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const [aRes, sRes, pRes] = await Promise.all([
    fetch(`/api/assignments/${currentYear}/${currentMonth}`),
    fetch(`/api/substituicoes/${currentYear}/${currentMonth}`),
    fetch('/api/people'),
  ]);
  assignments   = await aRes.json();
  substituicoes = await sRes.json();
  people        = await pRes.json();
  render();
}

async function saveSub(date, role, nome) {
  await fetch(`/api/substituicoes/${date}/${role}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  });
  await fetchAll();
}

// ── Picker ───────────────────────────────────────────────────────────────────

function openPicker(date, role) {
  pickerCtx = { date, role };
  const listKey = ROLE_LIST[role];
  const options = (people[listKey] || []).slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const current = getSub(date, role);

  document.getElementById('modalTitle').textContent = `${ROLE_LABELS[role]} — ${formatDate(date)}`;

  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  const noneDiv = document.createElement('div');
  noneDiv.className = 'picker-divider';
  noneDiv.textContent = 'Sem Substituição';
  body.appendChild(noneDiv);

  const noneItem = document.createElement('div');
  noneItem.className = 'picker-item' + (!current ? ' selected' : '');
  const noneSpan = document.createElement('span');
  noneSpan.textContent = '— (cumpriu a designação original)';
  noneSpan.style.cssText = 'color:#999;font-style:italic';
  noneItem.appendChild(noneSpan);
  noneItem.addEventListener('click', () => selectSub(null));
  body.appendChild(noneItem);

  const peopleDiv = document.createElement('div');
  peopleDiv.className = 'picker-divider';
  peopleDiv.textContent = 'Pessoas';
  body.appendChild(peopleDiv);

  options.forEach(name => {
    const item = document.createElement('div');
    item.className = 'picker-item' + (name === current ? ' selected' : '');
    const span = document.createElement('span');
    span.textContent = name;
    item.appendChild(span);
    item.addEventListener('click', () => selectSub(name));
    body.appendChild(item);
  });

  document.getElementById('modalOverlay').classList.add('active');
}

async function selectSub(nome) {
  if (!pickerCtx) return;
  const { date, role } = pickerCtx;
  closeModal();
  await saveSub(date, role, nome);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  pickerCtx = null;
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  document.getElementById('monthLabel').textContent =
    `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

  const leftBody  = document.getElementById('leftBody');
  const rightBody = document.getElementById('rightBody');
  leftBody.innerHTML  = '';
  rightBody.innerHTML = '';

  if (assignments.length === 0) {
    leftBody.innerHTML  = `<tr><td colspan="6"><div class="empty-state">Nenhuma designação gerada para este mês.</div></td></tr>`;
    rightBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">—</div></td></tr>`;
    renderMobileCombined();
    return;
  }

  assignments.forEach(a => {
    // ── Linha esquerda: designação original, somente leitura, colorida ──
    const trL = document.createElement('tr');
    const tdDateL = document.createElement('td');
    tdDateL.className = 'cell-data';
    tdDateL.textContent = formatDate(a.date);
    trL.appendChild(tdDateL);

    for (const role of ROLES) {
      const td = document.createElement('td');
      td.setAttribute('data-label', MOBILE_LABELS[role]);
      const original = a[role];
      const sub = getSub(a.date, role);

      const span = document.createElement('span');
      span.className = 'sub-status';
      span.textContent = original || '—';

      if (original) {
        if (!sub || sub === original) span.classList.add('status-green');
        else span.classList.add('status-red');
      } else {
        span.classList.add('status-neutral');
      }

      td.appendChild(span);
      trL.appendChild(td);
    }
    leftBody.appendChild(trL);

    // ── Linha direita: registro de comparecimento, editável ──
    const trR = document.createElement('tr');
    const tdDateR = document.createElement('td');
    tdDateR.className = 'cell-data';
    tdDateR.textContent = formatDate(a.date);
    trR.appendChild(tdDateR);

    for (const role of ROLES) {
      const td = document.createElement('td');
      td.setAttribute('data-label', MOBILE_LABELS[role]);
      const sub = getSub(a.date, role);

      const chip = document.createElement('span');
      chip.className = 'name-chip' + (sub ? '' : ' empty');
      chip.textContent = sub || '—';
      chip.title = 'Clique para registrar substituição';
      chip.addEventListener('click', () => openPicker(a.date, role));

      td.appendChild(chip);
      trR.appendChild(td);
    }
    rightBody.appendChild(trR);
  });

  syncRowHeights();
  renderMobileCombined();
}

// ── Visão combinada para mobile: designação + registro juntos por data ─────

function renderMobileCombined() {
  const el = document.getElementById('mobileCombined');
  if (!el) return;
  el.innerHTML = '';

  if (assignments.length === 0) {
    el.innerHTML = `<div class="empty-state">Nenhuma designação gerada para este mês.</div>`;
    return;
  }

  assignments.forEach(a => {
    const card = document.createElement('div');
    card.className = 'mc-card';

    const header = document.createElement('div');
    header.className = 'mc-card-header';
    header.textContent = formatDate(a.date);
    card.appendChild(header);

    for (const role of ROLES) {
      const row = document.createElement('div');
      row.className = 'mc-role-row';

      const label = document.createElement('div');
      label.className = 'mc-role-label';
      label.textContent = MOBILE_LABELS[role];
      row.appendChild(label);

      const values = document.createElement('div');
      values.className = 'mc-role-values';

      const original = a[role];
      const sub = getSub(a.date, role);

      const statusSpan = document.createElement('span');
      statusSpan.className = 'sub-status';
      statusSpan.textContent = original || '—';
      if (original) {
        if (!sub || sub === original) statusSpan.classList.add('status-green');
        else statusSpan.classList.add('status-red');
      } else {
        statusSpan.classList.add('status-neutral');
      }
      values.appendChild(statusSpan);

      const chip = document.createElement('span');
      chip.className = 'name-chip' + (sub ? '' : ' empty');
      chip.textContent = sub || '—';
      chip.title = 'Clique para registrar substituição';
      chip.addEventListener('click', () => openPicker(a.date, role));
      values.appendChild(chip);

      row.appendChild(values);
      card.appendChild(row);
    }

    el.appendChild(card);
  });
}

// ── Alinha a altura de cada linha entre as duas tabelas (desktop) ──────────

function syncRowHeights() {
  const leftRows  = document.querySelectorAll('#leftBody tr');
  const rightRows = document.querySelectorAll('#rightBody tr');

  leftRows.forEach(r => r.style.height = '');
  rightRows.forEach(r => r.style.height = '');

  if (window.innerWidth <= 640) return; // mobile: layout em cards, não alinhar

  const n = Math.min(leftRows.length, rightRows.length);
  for (let i = 0; i < n; i++) {
    const h = Math.max(leftRows[i].offsetHeight, rightRows[i].offsetHeight);
    leftRows[i].style.height = h + 'px';
    rightRows[i].style.height = h + 'px';
  }
}

let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(syncRowHeights, 150);
});

// ── Init ─────────────────────────────────────────────────────────────────────

document.getElementById('prevMonth').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  fetchAll();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  fetchAll();
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

fetchAll();
