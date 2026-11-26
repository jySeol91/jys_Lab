// 저장 형식 검증과 이전 형식 변환.
//
// 현재 형식 (app: 'security-assessment', schema: 1)
//   { criteria: [기준판], assets: [자산], assessments: [진단], settings }
// 이전 형식: 보안 이슈 대응 점검표(사고 대응) 백업 { schema: 1|2, guides, cases }
//   → 기준판(guides)만 가져올 수 있습니다. 사고 대응 기록(cases)은 이 도구가 다루지 않습니다.
(function (app) {
  'use strict';

  const { RULES, dates } = app;
  const APP = 'security-assessment', CURRENT_SCHEMA = 1;

  const isString = v => typeof v === 'string';
  const strings = (o, keys) => o && typeof o === 'object' && keys.every(k => isString(o[k]));
  const uniqueIds = list => new Set(list.map(o => o.id)).size === list.length;
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);

  const freshSettings = () => ({ dueDays: { ...RULES.DEFAULT_DUE_DAYS } });
  const fresh = () => ({ app: APP, schema: CURRENT_SCHEMA, criteria: [structuredClone(app.INITIAL_CRITERIA)], assets: [], assessments: [], settings: freshSettings() });

  function validCriteria(c) {
    const levels = RULES.SCORING_TYPES[c?.scoring]?.levels;
    return strings(c, ['id', 'family', 'version', 'date', 'source', 'scoring']) && Number.isInteger(c.year) && levels
      && Array.isArray(c.items) && c.items.length && uniqueIds(c.items)
      && c.items.every(i => strings(i, ['id', 'area', 'target', 'category', 'name', 'level', 'content', 'criteria', 'remediation', 'impact', 'ref', 'note'])
        && i.id && i.name && RULES.AREAS.includes(i.area) && levels.includes(i.level));
  }

  function validAssessment(a, criteriaIds, assetIds) {
    const verdicts = RULES.VERDICTS.map(v => v.code);
    return strings(a, ['id', 'title', 'criteriaId', 'start', 'end', 'performer', 'organization', 'network'])
      && criteriaIds.has(a.criteriaId) && dates.isDate(a.start) && dates.isDate(a.end)
      && RULES.NETWORK.some(n => n.code === a.network)
      && Array.isArray(a.assetIds) && a.assetIds.every(id => assetIds.has(id))
      && isObject(a.results) && Object.values(a.results).every(row => isObject(row) && Object.values(row).every(r => strings(r, ['verdict', 'finding', 'evidence']) && verdicts.includes(r.verdict)))
      && isObject(a.actions) && Object.values(a.actions).every(x => strings(x, ['status', 'plan', 'owner', 'due', 'doneAt', 'evidence', 'reason', 'compensating', 'approvedAt', 'approvalRef']) && RULES.ACTION_STATUS.includes(x.status))
      && (a.carry === null || isObject(a.carry));
  }

  function isValid(x) {
    if (x?.app !== APP || x.schema !== CURRENT_SCHEMA) return false;
    if (!Array.isArray(x.criteria) || !x.criteria.length || !x.criteria.every(validCriteria) || !uniqueIds(x.criteria)) return false;
    if (!Array.isArray(x.assets) || !x.assets.every(s => strings(s, ['id', 'name', 'type', 'note']) && typeof s.homepage === 'boolean') || !uniqueIds(x.assets)) return false;
    const criteriaIds = new Set(x.criteria.map(c => c.id)), assetIds = new Set(x.assets.map(s => s.id));
    if (!Array.isArray(x.assessments) || !x.assessments.every(a => validAssessment(a, criteriaIds, assetIds)) || !uniqueIds(x.assessments)) return false;
    const days = x.settings?.dueDays;
    return isObject(days) && RULES.PRIORITY_ORDER.every(p => Number.isInteger(days[p]) && days[p] >= 0 && days[p] <= 3650);
  }

  const isLegacy = x => x && (x.schema === 1 || x.schema === 2) && Array.isArray(x.guides) && Array.isArray(x.cases) && !x.app;

  // 이전 점검표의 기준판 → 현재 기준판. 위험도가 1~5가 아닌 항목이 있는 판은 건너뜁니다.
  function legacyCriteria(x) {
    const converted = [], skipped = [];
    for (const g of x.guides || []) {
      const items = (g.items || []).map(i => Array.isArray(i) ? { id: String(i[0] ?? ''), category: String(i[1] ?? ''), name: String(i[2] ?? ''), level: String(i[3] ?? '').trim(), ref: String(i[4] ?? '') } : null);
      const c = {
        id: String(g.id ?? ''), family: String(g.family ?? ''), year: Number(g.year), version: String(g.version ?? ''), date: String(g.date ?? ''), source: String(g.source ?? ''),
        scoring: 'risk5', registeredAt: '',
        items: items.filter(Boolean).map(i => ({ id: i.id, area: '기술적', target: '', category: i.category, name: i.name, level: i.level, content: '', criteria: '', remediation: '', impact: '', ref: i.ref, note: '' }))
      };
      if (validCriteria(c)) converted.push(c); else skipped.push(`${c.family} · ${c.year} · ${c.version}`);
    }
    return { converted, skipped, cases: (x.cases || []).length };
  }

  app.schema = { APP, CURRENT_SCHEMA, fresh, freshSettings, isValid, isLegacy, legacyCriteria, validCriteria };
})(window.SecurityChecklist = window.SecurityChecklist || {});
