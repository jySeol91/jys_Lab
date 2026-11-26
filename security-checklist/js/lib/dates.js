// 날짜 도우미. 화면과 저장은 모두 KST 기준 'YYYY-MM-DD' 문자열을 씁니다.
(function (app) {
  'use strict';

  const KST_OFFSET_MS = 9 * 3600000, DAY_MS = 86400000;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  const todayKst = (now = Date.now()) => new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
  const isDate = value => typeof value === 'string' && DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z'));
  const toUtc = date => Date.parse(date + 'T00:00:00Z');
  const fromUtc = ms => new Date(ms).toISOString().slice(0, 10);

  const addDays = (date, days) => fromUtc(toUtc(date) + days * DAY_MS);
  const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

  // 월 단위 더하기. 말일을 넘으면 그 달의 말일로 맞춥니다(1월 31일 + 1개월 = 2월 28/29일).
  function addMonths(date, months) {
    const [y, m, d] = date.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return fromUtc(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
  }

  app.dates = { todayKst, isDate, addDays, addMonths, daysBetween };
})(window.SecurityChecklist = window.SecurityChecklist || {});
