/**
 * rvm-parser.js
 * Lê todos os arquivos .xlsx da pasta /semanas e retorna a programação estruturada.
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const SEMANAS_DIR = path.join(__dirname, 'semanas');

// Converte serial do Excel para "YYYY-MM-DD"
function excelDateToISO(serial) {
  const d = XLSX.SSF.parse_date_code(serial);
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

function trim(v) {
  return String(v == null ? '' : v).trim();
}

function parseSemana(filePath) {
  const wb = XLSX.readFile(filePath);

  // ── Inicial ──────────────────────────────────────────────────
  const inicialRows = XLSX.utils.sheet_to_json(wb.Sheets['Inicial'], { header: 1, defval: '' });
  const info = {};
  inicialRows.forEach(row => {
    const key = trim(row[0]);
    if (key) info[key] = row[1];
  });

  const dateSerial = info['Data'];
  const date = typeof dateSerial === 'number' ? excelDateToISO(dateSerial) : trim(dateSerial);

  // ── Cânticos ─────────────────────────────────────────────────
  const cantRows = XLSX.utils.sheet_to_json(wb.Sheets['Cant'], { header: 1, defval: '' });
  const canticos = cantRows
    .map(r => trim(r[0]))
    .filter(Boolean);

  // ── Tesouros ─────────────────────────────────────────────────
  const tesRows = XLSX.utils.sheet_to_json(wb.Sheets['Tesouros'], { header: 1, defval: '' });
  const tesouros = tesRows
    .filter(r => trim(r[0]))
    .map(r => ({
      titulo: trim(r[0]),
      salaA:  trim(r[1]),
      salaB:  trim(r[2]),
    }));

  // ── Escola (Faça seu Melhor) ──────────────────────────────────
  // Filtra linha de cabeçalho ("Sala A") que tem col[0] vazio
  const escRows = XLSX.utils.sheet_to_json(wb.Sheets['Escola'], { header: 1, defval: '' });
  const escola = escRows
    .filter(r => trim(r[0]))
    .map(r => ({
      titulo: trim(r[0]),
      salaA:  trim(r[1]),
      salaB:  trim(r[2]),
    }));

  // ── Vida Cristã ───────────────────────────────────────────────
  const vidaRows = XLSX.utils.sheet_to_json(wb.Sheets['Vida'], { header: 1, defval: '' });
  const vida = vidaRows
    .filter(r => trim(r[0]))
    .map(r => {
      const titulo = trim(r[0]);
      const pessoa = trim(r[1]);
      const isEBC   = /estudo.bíblico/i.test(titulo) || /estudo.biblico/i.test(titulo);
      const isFinal = /comentários finais/i.test(titulo);

      if (isEBC) {
        // "Dirigente / Leitor" → split por " / "
        const partes = pessoa.split(/\s*\/\s*/);
        return { tipo: 'ebc', titulo, dirigente: partes[0] || '', leitor: partes[1] || '' };
      }
      if (isFinal) {
        return { tipo: 'comentarios', titulo };
      }
      return { tipo: 'regular', titulo, pessoa };
    });

  return {
    date,
    leitura:       trim(info['Texto da semana']),
    presidente:    trim(info['Presidente']),
    ajudante:      trim(info['Ajudante']),
    oracaoInicial: trim(info['Oração Inicial']),
    oracaoFinal:   trim(info['Oração Final']),
    canticos,   // [abertura, meio, final]
    tesouros,
    escola,
    vida,
  };
}

function getAllSemanas() {
  if (!fs.existsSync(SEMANAS_DIR)) return [];

  const files = fs.readdirSync(SEMANAS_DIR)
    .filter(f => /\.(xlsx|xls)$/i.test(f));

  const result = [];
  for (const f of files) {
    try {
      result.push(parseSemana(path.join(SEMANAS_DIR, f)));
    } catch (e) {
      console.error('[RVM] Erro ao ler', f, ':', e.message);
    }
  }

  return result.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { getAllSemanas };
