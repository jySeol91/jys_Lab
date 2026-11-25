// 업무 로직: DOM 과 저장소를 모르는 순수 함수만 둡니다.
(function (app) {
  'use strict';

  const KST_OFFSET_MS = 9 * 3600000;
  const HOUR_MS = 3600000;
  const STATUSES = ['대기', '진행', '완료', '해당 없음'];

  // ── KST 시각 ─────────────────────────────────────────────
  // datetime-local 입력과 같은 'YYYY-MM-DDTHH:mm' 형식의 KST 문자열을 씁니다.
  const isoKst = (now = Date.now()) => new Date(now + KST_OFFSET_MS).toISOString().slice(0, 16);
  const formatKst = ms => isoKst(ms).replace('T', ' ') + ' KST';
  const parseKst = local => Date.parse(local + '+09:00');

  // ── 대응 결과 ────────────────────────────────────────────
  const emptyResult = () => ({ status: '대기', note: '', evidence: '', doneAt: '' });
  const resultFor = (c, stepId) => c.results[stepId] || emptyResult();

  // 완료: 결과·증적·확인 일시 필요. 해당 없음: 사유 필요.
  function accepted(row) {
    return Boolean(row.note.trim() && (row.status === '해당 없음' || (row.status === '완료' && row.evidence.trim() && row.doneAt)));
  }

  const patchDueAt = c => parseKst(c.received) + c.hours * HOUR_MS;

  function caseSummary(c, steps, patchStepId, now = Date.now()) {
    const due = patchDueAt(c);
    const patch = resultFor(c, patchStepId);
    const complete = steps.filter(step => accepted(resultFor(c, step.id))).length;
    let text = now > due ? '기한 초과' : '확인 대기';
    if (accepted(patch)) {
      text = patch.status === '해당 없음' ? '해당 없음' : parseKst(patch.doneAt) <= due ? '기한 내 확인' : '기한 후 확인';
    }
    return { due, complete, text, late: text === '기한 초과' || text === '기한 후 확인' };
  }

  // 저장 전 검증. 문제가 없으면 빈 문자열, 있으면 안내 문구를 돌려줍니다.
  function resultsError(c, results, steps, now = Date.now()) {
    const incomplete = steps.find(step => ['완료', '해당 없음'].includes(results[step.id].status) && !accepted(results[step.id]));
    if (incomplete) return incomplete.title + ' 항목의 완료 또는 해당 없음 처리에 필요한 내용을 입력하세요.';
    const current = isoKst(now);
    const invalid = steps.find(step => results[step.id].status === '완료' && (results[step.id].doneAt < c.received || results[step.id].doneAt > current));
    if (invalid) return invalid.title + ' 확인 일시를 접수 시각부터 현재 시각 사이로 입력하세요.';
    return '';
  }

  // ── 사고 ─────────────────────────────────────────────────
  function newCaseError(data, now = Date.now()) {
    return !data.title.trim() || !data.service.trim() || data.received > isoKst(now)
      ? '사고명·서비스를 입력하고 접수 시각을 확인하세요.' : '';
  }

  // guide 에는 등록 시점에 고른 기준판의 id 가 들어가며 이후 바뀌지 않습니다.
  function buildCase(data, id, steps) {
    return {
      id,
      title: data.title,
      kind: data.kind,
      received: data.received,
      service: data.service,
      guide: data.guide,
      hours: Number(data.hours),
      links: [],
      indicators: '',
      results: Object.fromEntries(steps.map(step => [step.id, emptyResult()]))
    };
  }

  // ── 기준판 ───────────────────────────────────────────────
  const guideLabel = g => `${g.family} · ${g.year} · ${g.version}`;

  // 비교 대상: 같은 계열에서 이 판보다 먼저 등록된 판 중 가장 최근 것.
  function previousGuide(guides, g) {
    return guides.slice(0, guides.indexOf(g)).reverse().find(p => p.family === g.family);
  }

  // 항목: [항목 ID, 분류, 항목명, 위험도, 원문 위치]. 분류·항목명·위험도가 다르면 '변경'.
  function diffGuides(previous, g) {
    const old = new Map(previous.items.map(i => [i[0], i]));
    const current = new Set(g.items.map(i => i[0]));
    const same = (a, b) => JSON.stringify(a.slice(1, 4)) === JSON.stringify(b.slice(1, 4));
    return [
      ['추가', g.items.filter(i => !old.has(i[0]))],
      ['변경', g.items.filter(i => old.has(i[0]) && !same(old.get(i[0]), i))],
      ['삭제', previous.items.filter(i => !current.has(i[0]))]
    ];
  }

  const parseItems = text => text.trim().split(/\r?\n/).filter(x => x.trim()).map(line => line.split('|').map(p => p.trim()));
  const formatItems = items => items.map(i => i.join(' | ')).join('\n');

  function revisionError(guides, data, items) {
    if (!data.version.trim() || !/^https?:\/\//i.test(data.source) || !items.length
      || items.some(i => i.length !== 5 || i.slice(0, 3).some(x => !x))
      || new Set(items.map(i => i[0])).size !== items.length) {
      return '출처 주소와 버전을 확인하고, 중복 없이 항목의 다섯 칸을 입력하세요.';
    }
    if (guides.some(g => g.family === data.family && g.year === Number(data.year) && g.version === data.version.trim())) {
      return '같은 연도와 버전의 기준판이 이미 있습니다.';
    }
    return '';
  }

  function buildGuide(data, items, id) {
    return { family: data.family, year: Number(data.year), version: data.version.trim(), date: data.date, source: data.source, items, id };
  }

  app.logic = {
    STATUSES, isoKst, formatKst, parseKst,
    emptyResult, resultFor, accepted, patchDueAt, caseSummary, resultsError,
    newCaseError, buildCase,
    guideLabel, previousGuide, diffGuides, parseItems, formatItems, revisionError, buildGuide
  };
})(window.SecurityChecklist = window.SecurityChecklist || {});
