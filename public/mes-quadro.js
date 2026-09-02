/**
 * mes-quadro.js — dias de reunião e a que mês do quadro cada uma pertence.
 *
 * A reunião de MEIO DE SEMANA conta no mês em que a semana dela começou (a
 * semana vai de segunda a domingo): a quinta 01/10, cuja semana começou em
 * 28/09, entra no quadro de setembro. A reunião de FIM DE SEMANA conta sempre
 * pelo mês da própria data — o domingo 04/10 fica no quadro de outubro.
 *
 * Usado pelo servidor (require) e pelas páginas (<script src>).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : globalThis, function () {

  const WEEK_START_DOW  = 1;            // 1 = segunda (a semana vai de segunda a domingo)
  const WEEK_MONTH_FROM = '2026-09-07'; // a regra da semana vale daqui em diante

  // Dias de reunião por período (0=domingo … 6=sábado). Cada regra vale a partir
  // da data `from` — sempre uma segunda-feira, para a mudança pegar a semana
  // inteira — até o `from` da regra seguinte. Datas antigas mantêm a regra
  // antiga, de modo que regerar um mês passado reproduz as datas que ele teve.
  const MEETING_DAY_RULES = [
    { from: '0000-00-00', meioSemana: 1, fimSemana: 6 }, // segunda e sábado
    { from: '2026-08-31', meioSemana: 1, fimSemana: 0 }, // fim de semana passa a domingo (1º: 06/09)
    { from: '2026-09-07', meioSemana: 4, fimSemana: 0 }, // meio de semana passa a quinta (1º: 10/09)
  ];

  function monthKeyOf(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function dateOf(iso) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function getMeetingDays(iso) {
    let rule = MEETING_DAY_RULES[0];
    for (const r of MEETING_DAY_RULES) {
      if (r.from <= iso) rule = r;
    }
    return rule;
  }

  function isMeioSemana(iso) { return dateOf(iso).getDay() === getMeetingDays(iso).meioSemana; }
  function isFimSemana(iso)  { return dateOf(iso).getDay() === getMeetingDays(iso).fimSemana; }
  function isMeetingDate(iso) { return isMeioSemana(iso) || isFimSemana(iso); }

  // Segunda-feira que abre a semana da data.
  function weekStart(iso) {
    const dt = dateOf(iso);
    dt.setDate(dt.getDate() - ((dt.getDay() - WEEK_START_DOW + 7) % 7));
    return dt;
  }

  // "YYYY-MM" do quadro em que a data aparece. Só o meio de semana anda para o
  // mês em que a semana começou; o resto conta pelo mês da própria data.
  function boardMonthKey(iso) {
    if (iso < WEEK_MONTH_FROM || !isMeioSemana(iso)) return iso.slice(0, 7);
    const ws = weekStart(iso);
    return monthKeyOf(ws.getFullYear(), ws.getMonth() + 1);
  }

  // Mês do quadro em que estamos hoje.
  function currentBoardMonth() {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [year, month] = boardMonthKey(iso).split('-').map(Number);
    return { year, month };
  }

  function isInBoardMonth(iso, year, month) {
    return boardMonthKey(iso) === monthKeyOf(year, month);
  }

  return {
    WEEK_START_DOW, WEEK_MONTH_FROM, MEETING_DAY_RULES,
    monthKeyOf, getMeetingDays, isMeioSemana, isFimSemana, isMeetingDate,
    weekStart, boardMonthKey, currentBoardMonth, isInBoardMonth,
  };
});
