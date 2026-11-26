// 점수 계산: 과학기술정보통신부 고시 제2025-62호 [붙임4] 산식. 근거와 적용안은 docs/evaluation-criteria.md.
(function (app) {
  'use strict';

  const { RULES } = app;
  const ORG = '_org'; // 관리적·물리적 영역은 기관 공통으로 한 번 판정합니다.
  const verdictOf = code => RULES.VERDICTS.find(v => v.code === (code || ''));

  const points = (scoring, level) => RULES.SCORING_TYPES[scoring]?.points[level] ?? null;
  const factor = code => verdictOf(code)?.factor ?? null;
  const networkOf = code => RULES.NETWORK.find(n => n.code === code) || RULES.NETWORK[0];

  // 영역 점수: entries = [{ points, verdict }] → { A, B, score, counted }
  function areaScore(entries) {
    let A = 0, B = 0, counted = 0;
    for (const e of entries) {
      const f = factor(e.verdict);
      if (f === null || e.points === null) continue;
      A += e.points; B += e.points * f; counted++;
    }
    return { A, B, counted, score: A > 0 ? (A - B) / A * 100 : null };
  }

  // 기술적 항목이 이 자산에 적용되는지(대상 유형이 비었거나 자산 유형과 같으면 적용)
  const appliesTo = (item, asset) => item.area === '기술적' && (!item.target || item.target === (asset?.type || '').trim());

  // 판정할 칸 목록: [{ item, scope }] — scope 는 '_org' 또는 자산 ID
  function cellsOf(criteria, assessment, assetsById) {
    const cells = [];
    for (const item of criteria.items) {
      if (item.area !== '기술적') cells.push({ item, scope: ORG });
      else for (const id of assessment.assetIds) if (appliesTo(item, assetsById.get(id))) cells.push({ item, scope: id });
    }
    return cells;
  }

  const resultOf = (assessment, itemId, scope) => assessment.results[itemId]?.[scope] || null;

  // 진단 하나의 점수와 진행 현황
  function compute(criteria, assessment, assetsById) {
    const cells = cellsOf(criteria, assessment, assetsById);
    const counts = Object.fromEntries(RULES.VERDICTS.map(v => [v.code || 'unchecked', 0]));
    let missingNotes = 0;
    for (const { item, scope } of cells) {
      const r = resultOf(assessment, item.id, scope);
      const code = r?.verdict || '';
      counts[code || 'unchecked']++;
      if (['fail', 'partial', 'na'].includes(code) && !(r.finding || '').trim()) missingNotes++;
    }
    const entry = (item, scope) => ({ points: points(criteria.scoring, item.level), verdict: resultOf(assessment, item.id, scope)?.verdict || '' });
    const evaluated = (item, scope) => factor(resultOf(assessment, item.id, scope)?.verdict) !== null;

    const areas = {};
    for (const area of ['관리적', '물리적']) {
      const items = criteria.items.filter(i => i.area === area);
      const s = areaScore(items.map(i => entry(i, ORG)));
      areas[area] = { ...s, count: s.counted, total: items.length };
    }
    const techItems = criteria.items.filter(i => i.area === '기술적');
    const assets = assessment.assetIds.map(id => {
      const asset = assetsById.get(id);
      const applicable = techItems.filter(i => appliesTo(i, asset));
      return { assetId: id, name: asset?.name || '(삭제된 자산)', applicable: applicable.length, ...areaScore(applicable.map(i => entry(i, id))) };
    });
    const scored = assets.filter(a => a.score !== null);
    const techCount = techItems.filter(i => assessment.assetIds.some(id => appliesTo(i, assetsById.get(id)) && evaluated(i, id))).length;
    areas['기술적'] = {
      score: scored.length ? scored.reduce((sum, a) => sum + a.score, 0) / scored.length : null,
      // 전체 항목 수는 이 진단의 자산 중 하나 이상에 적용되는 기술적 항목 수
      count: techCount, total: techItems.filter(i => assessment.assetIds.some(id => appliesTo(i, assetsById.get(id)))).length, assets
    };

    const parts = RULES.AREAS.map(a => areas[a]).filter(a => a.score !== null && a.count > 0);
    const weight = parts.reduce((sum, a) => sum + a.count, 0);
    const combined = weight ? parts.reduce((sum, a) => sum + a.score * a.count, 0) / weight : null;
    const network = networkOf(assessment.network);
    const total = combined === null ? null : combined * network.ratio;
    return {
      areas, combined, network, total, counts, missingNotes,
      progress: { cells: cells.length, done: cells.length - counts.unchecked }
    };
  }

  const formatScore = value => value === null || value === undefined ? '산출 불가' : (Math.round(value * 10) / 10).toFixed(1);

  app.scoring = { ORG, points, factor, verdictOf, networkOf, areaScore, appliesTo, cellsOf, resultOf, compute, formatScore };
})(window.SecurityChecklist = window.SecurityChecklist || {});
