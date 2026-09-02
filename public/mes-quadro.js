/**
 * mes-quadro.js — decide a que mês do quadro cada reunião pertence.
 *
 * A reunião conta no mês em que a SEMANA dela começou, não no mês da própria
 * data: uma quinta 01/10 cuja semana começou em 27/09 entra no quadro de
 * setembro. Reuniões anteriores ao corte continuam contando pelo mês da data,
 * para não remontar os quadros já publicados.
 *
 * Usado pelo servidor (require) e pelas páginas (<script src>).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : globalThis, function () {

  const WEEK_START_DOW  = 0;            // 0 = domingo
  const WEEK_MONTH_FROM = '2026-10-01'; // a regra da semana vale daqui em diante

  function monthKeyOf(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  // Domingo que abre a semana da data (objeto Date, hora local).
  function weekStart(iso) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - ((dt.getDay() - WEEK_START_DOW + 7) % 7));
    return dt;
  }

  // "YYYY-MM" do quadro em que a data aparece.
  function boardMonthKey(iso) {
    if (iso < WEEK_MONTH_FROM) return iso.slice(0, 7);
    const ws = weekStart(iso);
    return monthKeyOf(ws.getFullYear(), ws.getMonth() + 1);
  }

  // Mês do quadro em que estamos hoje (nas primeiras reuniões de um mês novo
  // ainda pode ser o quadro do mês anterior).
  function currentBoardMonth() {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [year, month] = boardMonthKey(iso).split('-').map(Number);
    return { year, month };
  }

  function isInBoardMonth(iso, year, month) {
    return boardMonthKey(iso) === monthKeyOf(year, month);
  }

  return { WEEK_START_DOW, WEEK_MONTH_FROM, monthKeyOf, weekStart, boardMonthKey, currentBoardMonth, isInBoardMonth };
});
