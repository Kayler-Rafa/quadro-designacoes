/* ══════════════════════════════════════════════════════════
   QUADRO-LIB.JS — funções compartilhadas entre quadro.html e index.html
══════════════════════════════════════════════════════════ */

const MESES     = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_ABR = ['jan','fev','mar','abr','mai','jun',
                   'jul','ago','set','out','nov','dez'];

const h = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function dayAbr(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(y,m-1,d).getDay()];
}
function fmtShort(iso) {
  const [,m,d] = iso.split('-');
  return `${parseInt(d)}/${MESES_ABR[parseInt(m)-1]}`;
}
function fmtLong(iso) {
  const [y,m,d] = iso.split('-');
  return `${parseInt(d)} de ${MESES[parseInt(m)-1]} de ${y}`;
}
function monthLabel(y, m) { return `${MESES[m-1]} de ${y}`; }

/* ── Fetch ── */
async function fetchAll(year, month) {
  const prefix = `${year}-${String(month).padStart(2,'0')}`;
  const [desig, allRfs, allRvm, grupos] = await Promise.all([
    fetch(`/api/assignments/${year}/${month}`).then(r => r.json()),
    fetch('/api/rfs').then(r => r.json()),
    fetch('/api/rvm').then(r => r.json()),
    fetch('/api/grupos').then(r => r.json()),
  ]);
  return {
    desig,
    rfs:  allRfs.filter(r => r.date.startsWith(prefix)),
    rvm:  allRvm.filter(s => s.date.startsWith(prefix)),
    grupos,
  };
}

/* ── Página 1: Capa ── */
function buildCapa(year, month) {
  const now = new Date();
  const dataAtualizacao = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
  return `
  <div class="a4-page capa-page">
    <div class="capa-left">
      <div class="capa-topo">
        <div class="capa-titulo">Quadro de<br>Anúncios</div>
        <hr class="capa-divider">
        <div class="capa-cong">
          Congregação Candeias<br>
          <span style="font-weight:400;font-size:13px;text-transform:none">Jaboatão dos Guararapes – PE</span>
        </div>
      </div>
      <div class="capa-rodape">
        <ul class="capa-lista">
          <li>Reunião de Meio de Semana</li>
          <li>Reunião de Fim de Semana</li>
          <li>Designações Mecânicas</li>
          <li>Programação de Limpeza</li>
          <li>Grupos de Saída de Campo</li>
          <li>Mapa do Território</li>
        </ul>
        <div class="capa-mes">${monthLabel(year, month)}</div>
      </div>
    </div>
    <div class="capa-right">
      <span class="capa-data">Atualização: ${dataAtualizacao}</span>
    </div>
  </div>`;
}

/* ── Páginas RVM ── */
function renderRvmWeek(s) {
  const canticos = s.canticos || [];

  const mkItem = (it) => {
    if (!it) return '';
    if (it.tipo === 'comentarios') {
      return `<div class="rvm-item rvm-item-comentarios">
        <span class="rvm-item-titulo">${h(it.titulo)}</span>
      </div>`;
    }
    if (it.tipo === 'ebc') {
      return `<div class="rvm-item">
        <span class="rvm-item-titulo">${h(it.titulo)}</span>
        <span class="rvm-item-pessoa">${h(it.dirigente)} / ${h(it.leitor)}</span>
      </div>`;
    }
    const salaB = it.salaB ? `<br><span class="rvm-item-sala">Sala B: ${h(it.salaB)}</span>` : '';
    const pessoa = it.salaA || it.pessoa || '—';
    return `<div class="rvm-item">
      <span class="rvm-item-titulo">${h(it.titulo)}</span>
      <span class="rvm-item-pessoa">${h(pessoa)}${salaB}</span>
    </div>`;
  };

  const mkCantico = (texto, sub = '') => texto ? `
    <div class="rvm-cantico-row">
      ${h(texto)}
      ${sub ? `<div class="rvm-cantico-sub">${h(sub)}</div>` : ''}
    </div>` : '';

  const mkComent = (texto) =>
    `<div class="rvm-comentarios-row">${h(texto)}</div>`;

  return `
  <div class="rvm-week-card">
    <div class="rvm-week-header">
      <span class="rvm-week-date">${fmtLong(s.date)}</span>
      <span class="rvm-week-leit">Leitura: ${h(s.leitura||'')}</span>
    </div>
    <div class="rvm-week-meta">
      <div class="rvm-meta-cell">
        <span class="rvm-meta-label">Presidente</span>${h(s.presidente||'—')}
        <br><span class="rvm-meta-label" style="margin-top:4px">Ajudante</span>${h(s.ajudante||'—')}
      </div>
      <div class="rvm-meta-cell">
        <span class="rvm-meta-label">Oração Inicial</span>${h(s.oracaoInicial||'—')}
      </div>
    </div>

    <div class="rvm-abertura">
      <div class="rvm-block-header">Abertura</div>
      ${mkCantico(canticos[0])}
      ${mkComent('Comentários iniciais (1 min)')}
    </div>

    <div class="rvm-tesouros">
      <div class="rvm-block-header">Tesouros da Palavra de Deus</div>
      ${(s.tesouros||[]).map(mkItem).join('')}
    </div>

    <div class="rvm-escola">
      <div class="rvm-block-header">Faça Seu Melhor no Ministério</div>
      ${(s.escola||[]).map(mkItem).join('')}
    </div>

    <div class="rvm-vida">
      <div class="rvm-block-header">Nossa Vida Cristã</div>
      ${mkCantico(canticos[1])}
      ${(s.vida||[]).map(mkItem).join('')}
      ${mkCantico(canticos[2], s.oracaoFinal ? `Oração final: ${s.oracaoFinal}` : '')}
    </div>
  </div>`;
}

function buildPagesRVM(rvm, year, month) {
  if (!rvm.length) {
    return `<div class="a4-page">
      <div class="qa-page-title">Programação da Reunião de Meio de Semana</div>
      <div class="rvm-wrap" style="padding:20px;color:#aaa;font-style:italic">Programação não disponível para este mês.</div>
    </div>`;
  }
  const pages = [];
  for (let i = 0; i < rvm.length; i += 2) {
    const chunk = rvm.slice(i, i + 2);
    pages.push(`
      <div class="a4-page">
        <div class="qa-page-title">Programação da Reunião de Meio de Semana</div>
        <div class="a4-fill"><div class="rvm-wrap">${chunk.map(renderRvmWeek).join('')}</div></div>
      </div>`);
  }
  return pages.join('');
}

/* ── Página RFS + Designações + Limpeza ── */
function buildPageRFS(rfs) {
  const rows = rfs.length
    ? rfs.map(r => {
        const congr = r.congregacao ? `<br><span style="font-size:10px;color:#888">(${h(r.congregacao)})</span>` : '';
        return `<tr>
          <td class="td-date">${fmtShort(r.date)}</td>
          <td class="left">${h(r.tema||'—')}</td>
          <td>${h(r.orador||'—')}${congr}</td>
          <td>${h(r.presidente||'—')}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#aaa;padding:10px;font-style:italic">Nenhuma reunião registrada.</td></tr>`;

  return `
    <div class="qa-section-label">Reuniões de Fim de Semana</div>
    <div class="qa-table-wrap" style="padding-bottom:0">
      <table class="qa-table">
        <thead><tr>
          <th class="left" style="width:56px">Data</th>
          <th class="left">Tema</th>
          <th style="width:150px">Orador (Congregação)</th>
          <th style="width:120px">Presidente</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildPageDesig(desig) {
  const rowsDesig = desig.length
    ? desig.map(a => `<tr>
        <td class="td-date">${fmtShort(a.date)}</td>
        <td>${h(a.indicador_externo||'—')}</td>
        <td>${h(a.indicador_interno||'—')}</td>
        <td>${h(a.volante1||'—')}</td>
        <td>${h(a.volante2||'—')}</td>
        <td>${h(a.audio||'—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:10px;font-style:italic">Designações não geradas para este mês.</td></tr>`;

  const rowsLimp = desig.length
    ? desig.map(a => `<tr>
        <td class="td-date">${fmtShort(a.date)}</td>
        <td>${h(a.limpeza||'—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="text-align:center;color:#aaa;padding:10px;font-style:italic">—</td></tr>`;

  return `
    <div class="qa-section-label">Designações Mecânicas</div>
    <div class="qa-table-wrap" style="padding-bottom:0">
      <table class="qa-table qa-table--sep">
        <thead><tr>
          <th class="left" style="width:56px">Data</th>
          <th>Ind. Externo</th>
          <th>Ind. Interno</th>
          <th>Volante 1</th>
          <th>Volante 2</th>
          <th>Áudio/Vídeo</th>
        </tr></thead>
        <tbody>${rowsDesig}</tbody>
      </table>
    </div>
    <div class="qa-section-label" style="margin-top:10px">Programação de Limpeza</div>
    <div class="qa-table-wrap">
      <table class="qa-table">
        <thead><tr>
          <th class="left" style="width:56px">Reunião</th>
          <th class="left">Grupos Responsáveis</th>
        </tr></thead>
        <tbody>${rowsLimp}</tbody>
      </table>
    </div>`;
}

function buildPageRFSDesigLimp(rfs, desig, year, month) {
  return `
  <div class="a4-page">
    <div class="qa-page-title">Designações — ${monthLabel(year, month)}</div>
    <div class="a4-fill">
      ${buildPageRFS(rfs)}
      ${buildPageDesig(desig)}
    </div>
  </div>`;
}

/* ── Página Grupos ── */
function buildPageGrupos(grupos) {
  if (!grupos?.length) {
    return `<div class="a4-page">
      <div class="qa-page-title">Grupos de Saída de Campo</div>
      <div style="padding:20px;color:#aaa;font-style:italic">Dados não disponíveis.</div>
    </div>`;
  }
  const total = grupos.reduce((s,g) => s+(g.total||0), 0);
  const maxM  = Math.max(...grupos.map(g => g.membros.length));
  const headNome = grupos.map((g,i) => `<th class="gh" data-col="${i}">${h(g.nome)}</th>`).join('');
  const headInfo = grupos.map((g,i) =>
    `<td class="gi" data-col="${i}">Dirigente: ${h(g.dirigente)}<br>Ajudante: ${h(g.ajudante)}<br>Local: ${h(g.local)}</td>`).join('');
  const headTot  = grupos.map(g =>
    `<td class="gt">Total ${h(g.nome.charAt(0)+g.nome.slice(1).toLowerCase())} = ${g.total}</td>`).join('');
  let membros = '';
  for (let i = 0; i < maxM; i++) {
    const cells = grupos.map(g => {
      const n = g.membros[i]||'';
      return n ? `<td>${h(n)}</td>` : `<td style="color:#ddd">—</td>`;
    }).join('');
    membros += `<tr class="gm">${cells}</tr>`;
  }
  return `
  <div class="a4-page">
    <div class="qa-page-title">Grupos de Saída de Campo</div>
    <div class="grupos-wrap">
      <div class="grupos-total">Total Geral de Publicadores = ${total}</div>
      <table class="grupos-table">
        <thead>
          <tr>${headNome}</tr>
          <tr>${headInfo}</tr>
          <tr>${headTot}</tr>
        </thead>
        <tbody>${membros}</tbody>
      </table>
    </div>
  </div>`;
}

/* ── Página Mapa ── */
function buildPageMapa() {
  return `
  <div class="a4-page">
    <div class="qa-page-title">Mapa do Território</div>
    <div class="mapa-wrap">
      <img src="/mapa/mapa 5000.png" alt="Mapa do Território de Candeias" />
    </div>
  </div>`;
}

/* ── Render completo ── */
function buildQuadro(year, month, desig, rfs, rvm, grupos) {
  return buildCapa(year, month)
    + buildPagesRVM(rvm, year, month)
    + buildPageRFSDesigLimp(rfs, desig, year, month)
    + buildPageGrupos(grupos)
    + buildPageMapa();
}
