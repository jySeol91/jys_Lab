// 진단: 생성, 판정 기록, 기준판 개정 이월, 조치(이행계획) 관리, 실시 주기.
(function (app) {
  'use strict';

  const { RULES, dates, scoring } = app;
  const { ORG } = scoring;

  const actionKey = (itemId, scope) => itemId + '|' + scope;
  const emptyAction = () => ({ status: '조치 예정', plan: '', owner: '', due: '', doneAt: '', evidence: '', reason: '', compensating: '', approvedAt: '', approvalRef: '' });

  function newAssessmentError(data, criteria, assetIds) {
    if (!String(data.title || '').trim()) return '진단명을 입력하세요.';
    if (!criteria) return '적용 기준판을 고르세요.';
    if (!dates.isDate(data.start) || !dates.isDate(data.end)) return '진단 기간(시작일·종료일)을 입력하세요.';
    if (data.end < data.start) return '종료일은 시작일보다 빠를 수 없습니다.';
    if (criteria.items.some(i => i.area === '기술적') && !assetIds.length) return '기술적 항목을 점검할 대상 자산을 하나 이상 고르세요.';
    return '';
  }

  // 기준판은 등록 시점의 ID로 고정되어, 새 판을 등록해도 이 진단은 처음 고른 판을 계속 참조합니다.
  function buildAssessment(data, criteria, assetIds, id, createdAt) {
    return {
      id, title: data.title.trim(), criteriaId: criteria.id, start: data.start, end: data.end,
      performer: data.performer || '자체', organization: (data.organization || '').trim(), network: data.network || 'exempt',
      assetIds: [...assetIds], results: {}, actions: {}, carry: null, createdAt
    };
  }

  function setResult(assessment, itemId, scope, patch) {
    const row = (assessment.results[itemId] ||= {});
    const next = { verdict: '', finding: '', evidence: '', ...row[scope], ...patch };
    delete next.carried; // 손으로 고친 결과는 더 이상 '이전 결과'가 아님
    if (!next.verdict && !next.finding && !next.evidence) delete row[scope]; else row[scope] = next;
    if (!Object.keys(row).length) delete assessment.results[itemId];
    // 취약·부분 조치가 아니게 되면 조치 기록은 남겨 두되 목록에서 빠집니다(다시 취약이 되면 이어서 씀).
  }

  // ── 개정 이월 ──────────────────────────────────────────
  // 바뀌지 않은 항목의 판정·조치를 이어받고, 추가·변경 항목은 미점검으로 둡니다.
  function carryOver(source, fromCriteria, toCriteria, meta, id, createdAt) {
    const diff = app.criteria.diffCriteria(fromCriteria, toCriteria);
    const blocked = new Set([...diff.added, ...diff.changed.map(c => c.item)].map(i => i.id));
    const keep = new Set(toCriteria.items.map(i => i.id).filter(itemId => !blocked.has(itemId)));
    const results = {}, actions = {};
    for (const [itemId, row] of Object.entries(source.results)) {
      if (!keep.has(itemId)) continue;
      results[itemId] = Object.fromEntries(Object.entries(row).filter(([scope]) => scope === ORG || source.assetIds.includes(scope)).map(([scope, r]) => [scope, { ...r, carried: true }]));
    }
    for (const [key, action] of Object.entries(source.actions)) if (keep.has(key.split('|')[0])) actions[key] = { ...action };
    const previousFails = [];
    for (const [itemId, row] of Object.entries(source.results)) for (const [scope, r] of Object.entries(row)) if (['fail', 'partial'].includes(r.verdict)) previousFails.push(actionKey(itemId, scope));
    return {
      ...buildAssessment({ ...source, ...meta }, toCriteria, source.assetIds, id, createdAt),
      results, actions,
      carry: { from: source.id, fromCriteria: fromCriteria.id, added: diff.added.map(i => i.id), changed: diff.changed.map(c => c.item.id), removed: diff.removed.map(i => i.id), previousFails }
    };
  }

  // ── 조치 관리 ──────────────────────────────────────────
  const priorityOf = (criteria, item) => RULES.PRIORITY[criteria.scoring]?.[item.level] || '장기';
  const defaultDue = (assessment, priority, settings) => dates.addDays(assessment.end, Number(settings?.dueDays?.[priority] ?? RULES.DEFAULT_DUE_DAYS[priority]));

  // 취약·부분 조치 판정 목록 (이행계획 대상)
  function findingsOf(criteria, assessment, assetsById, settings) {
    const list = [];
    for (const { item, scope } of scoring.cellsOf(criteria, assessment, assetsById)) {
      const r = scoring.resultOf(assessment, item.id, scope);
      if (!r || !['fail', 'partial'].includes(r.verdict)) continue;
      const key = actionKey(item.id, scope), priority = priorityOf(criteria, item);
      const saved = assessment.actions[key];
      list.push({
        key, item, scope, result: r, priority,
        scopeName: scope === ORG ? '기관 공통' : assetsById.get(scope)?.name || '(삭제된 자산)',
        action: { ...emptyAction(), due: defaultDue(assessment, priority, settings), ...saved }, saved: Boolean(saved)
      });
    }
    const order = RULES.PRIORITY_ORDER;
    return list.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority) || a.item.id.localeCompare(b.item.id, 'ko', { numeric: true }));
  }

  function actionError(action, assessment, today = dates.todayKst()) {
    if (action.status === '조치 완료') {
      if (!action.plan.trim() || !action.doneAt || !action.evidence.trim()) return '조치 완료에는 조치 내용, 완료일, 증적 참조가 필요합니다.';
      if (!dates.isDate(action.doneAt) || action.doneAt < assessment.start || action.doneAt > today) return '완료일은 진단 시작일부터 오늘 사이여야 합니다.';
    }
    if (action.status === '조치불가') {
      if (!action.reason || !action.compensating.trim() || !action.approvedAt || !action.approvalRef.trim()) return '조치불가에는 사유, 보완대책, 최고경영자 승인일, 승인 문서 번호가 필요합니다.';
      if (!dates.isDate(action.approvedAt) || action.approvedAt > today) return '승인일은 오늘 이전이어야 합니다.';
    }
    if (action.due && !dates.isDate(action.due)) return '조치 기한 형식이 올바르지 않습니다.';
    return '';
  }

  function actionState(action, today = dates.todayKst()) {
    if (action.status === '조치 완료') return '조치 완료';
    if (action.status === '조치불가') return '조치불가';
    if (!action.owner.trim() || !action.due) return '계획 미수립';
    return action.due < today ? '기한 초과' : '조치 예정';
  }

  function remediationSummary(findings, today = dates.todayKst()) {
    const states = findings.map(f => actionState(f.action, today));
    const count = name => states.filter(s => s === name).length;
    const total = findings.length, done = count('조치 완료');
    return { total, done, unfixable: count('조치불가'), overdue: count('기한 초과'), unplanned: count('계획 미수립'), planned: count('조치 예정'), rate: total ? done / total * 100 : null };
  }

  // ── 실시 주기 ──────────────────────────────────────────
  // 마지막 진단 종료일부터 12개월(홈페이지 6개월)을 다음 기한으로 봅니다(보수적 계산).
  function cycleOf(asset, assessments, today = dates.todayKst()) {
    const done = assessments.filter(a => a.assetIds.includes(asset.id) && a.end <= today).map(a => a.end).sort();
    const last = done.at(-1) || '';
    const months = asset.homepage ? RULES.CYCLE.homepageMonths : RULES.CYCLE.months;
    if (!last) return { last, due: '', months, state: '진단 이력 없음' };
    const due = dates.addMonths(last, months);
    const left = dates.daysBetween(today, due);
    return { last, due, months, left, state: left < 0 ? '기한 초과' : left <= RULES.CYCLE.warnDays ? '30일 이내 도래' : '정상' };
  }

  app.assessment = {
    actionKey, emptyAction, newAssessmentError, buildAssessment, setResult, carryOver,
    priorityOf, defaultDue, findingsOf, actionError, actionState, remediationSummary, cycleOf
  };
})(window.SecurityChecklist = window.SecurityChecklist || {});
