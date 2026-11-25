// 저장 형식(schema)의 버전, 마이그레이션, 검증.
//
// schema 1: case.rows    = [결과, …]          ← 단계 배열의 인덱스에 연결
// schema 2: case.results = { 단계ID: 결과, … } ← 고정 단계 ID에 연결
(function (app) {
  'use strict';

  const CURRENT_SCHEMA = 2;
  const { STATUSES, parseKst, emptyResult } = app.logic;

  // schema 1 시절의 단계 순서. 과거 백업을 해석하는 기준이므로
  // 현재 단계 목록(js/data/steps.js)을 바꾸더라도 이 목록은 고치지 않습니다.
  const SCHEMA_1_STEP_IDS = Object.freeze([
    'intake', 'patch-history', 'service-impact', 'evidence-preservation', 'initial-response',
    'change-preparation', 'test-verification', 'production-rollout', 'closure'
  ]);

  const invalid = () => { throw new Error('invalid checklist data'); };

  // MIGRATIONS[n] 은 schema n 데이터를 n+1 로 올립니다.
  const MIGRATIONS = {
    1(data) {
      if (!Array.isArray(data.cases)) invalid();
      const cases = data.cases.map(c => {
        if (!c || !Array.isArray(c.rows) || c.rows.length !== SCHEMA_1_STEP_IDS.length) invalid();
        const { rows, ...rest } = c;
        return { ...rest, results: Object.fromEntries(rows.map((row, i) => [SCHEMA_1_STEP_IDS[i], row])) };
      });
      return { ...data, schema: 2, cases };
    }
  };

  function isValid(x) {
    const strings = (o, keys) => o && keys.every(k => typeof o[k] === 'string');
    const localDate = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v) && Number.isFinite(parseKst(v));
    const unique = rows => new Set(rows.map(o => o.id)).size === rows.length;
    const result = r => strings(r, ['status', 'note', 'evidence', 'doneAt']) && STATUSES.includes(r.status) && (!r.doneAt || localDate(r.doneAt));

    if (x?.schema !== CURRENT_SCHEMA || !Array.isArray(x.guides) || !x.guides.length || !Array.isArray(x.cases)) return false;
    const guidesOk = x.guides.every(g => strings(g, ['id', 'family', 'version', 'date', 'source'])
      && Number.isInteger(g.year) && Array.isArray(g.items) && g.items.length
      && g.items.every(i => Array.isArray(i) && i.length === 5 && i.every(v => typeof v === 'string'))
      && new Set(g.items.map(i => i[0])).size === g.items.length);
    if (!guidesOk || !unique(x.guides)) return false;

    return x.cases.every(c => {
      if (!strings(c, ['id', 'title', 'kind', 'service', 'guide', 'indicators']) || !localDate(c.received)
        || !Number.isInteger(c.hours) || c.hours < 1 || c.hours > 8760
        || !c.results || typeof c.results !== 'object' || Array.isArray(c.results)) return false;
      const g = x.guides.find(g => g.id === c.guide);
      return g && Array.isArray(c.links) && c.links.every(id => g.items.some(i => i[0] === id))
        && Object.values(c.results).every(result);
    }) && unique(x.cases);
  }

  // 나중에 추가된 단계처럼 결과가 없는 단계는 '대기'로 채웁니다.
  // 현재 단계 목록에 없는 ID의 결과는 지우지 않고 그대로 보존합니다.
  function fillMissingResults(state, steps) {
    for (const c of state.cases) {
      for (const step of steps) if (!c.results[step.id]) c.results[step.id] = emptyResult();
    }
    return state;
  }

  // 어떤 버전의 데이터든 현재 schema 의 유효한 상태로 만들어 돌려줍니다. 실패하면 예외.
  function upgrade(data, steps = app.STEPS) {
    let next = data;
    while (next && Number.isInteger(next.schema) && next.schema < CURRENT_SCHEMA) {
      const migrate = MIGRATIONS[next.schema];
      if (!migrate) invalid();
      next = migrate(next);
    }
    if (!isValid(next)) invalid();
    return fillMissingResults(structuredClone(next), steps);
  }

  app.schema = { CURRENT_SCHEMA, SCHEMA_1_STEP_IDS, upgrade };
})(window.SecurityChecklist = window.SecurityChecklist || {});
