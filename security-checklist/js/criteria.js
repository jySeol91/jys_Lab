// 기준판: 표준 엑셀 양식의 구조, 검증, 비교.
(function (app) {
  'use strict';

  const { RULES } = app;
  const norm = text => String(text ?? '').replace(/\s+/g, '').replace(/[·ㆍ・]/g, '');

  const SHEETS = { meta: '기준정보', items: '점검항목', guide: '작성 안내' };

  const COLUMNS = [
    { key: 'id', label: '항목ID', required: true, width: 14, help: '기준판 안에서 겹치지 않는 코드' },
    { key: 'area', label: '영역', required: true, width: 9, help: '관리적, 물리적, 기술적 중 하나' },
    { key: 'target', label: '대상 유형', width: 12, help: '기술적 항목을 적용할 자산 유형. 비우면 모든 자산에 적용' },
    { key: 'category', label: '분류', width: 14, help: '문서의 분류' },
    { key: 'name', label: '항목명', required: true, width: 36, help: '점검 항목 이름' },
    { key: 'level', label: '등급', required: true, width: 7, help: '배점 방식에 따라 상·중·하 또는 5~1' },
    { key: 'content', label: '점검 내용', width: 40, help: '무엇을 점검하는지' },
    { key: 'criteria', label: '판단 기준', width: 50, help: '양호·취약을 가르는 기준이나 점검 방법' },
    { key: 'remediation', label: '대응 방안', width: 50, help: '취약할 때의 조치 방법. 보고서에 그대로 들어감' },
    { key: 'impact', label: '조치 시 영향', width: 20, help: '조치할 때 서비스에 미치는 영향' },
    { key: 'ref', label: '원문 위치', width: 10, help: '원문 쪽수나 절' },
    { key: 'note', label: '비고', width: 20, help: '자유 기록' }
  ];
  // 점검을 다시 해야 하는 변경(이 필드가 바뀌면 '변경', 나머지만 바뀌면 '문구 변경')
  const KEY_FIELDS = ['area', 'target', 'category', 'name', 'level', 'content', 'criteria'];
  const TEXT_FIELDS = ['remediation', 'impact', 'ref', 'note'];

  const META = [
    { key: 'family', label: '기준 계열', required: true, help: '예: 전자금융기반시설, 주요정보통신기반시설, 기관 내부 기준' },
    { key: 'year', label: '연도', required: true, help: '4자리 연도' },
    { key: 'version', label: '버전·고시 번호', required: true, help: '예: 제2025-1호, v1.0' },
    { key: 'date', label: '시행일 또는 게시일', help: '예: 2025-07-01' },
    { key: 'source', label: '출처', help: '원문 주소(URL)나 문서 이름' },
    { key: 'scoring', label: '배점 방식', required: true, help: `${RULES.SCORING_TYPES.grade3.label} 또는 ${RULES.SCORING_TYPES.risk5.label}` }
  ];

  const scoringLabel = code => RULES.SCORING_TYPES[code]?.label || '';
  const scoringCode = label => Object.keys(RULES.SCORING_TYPES).find(code => norm(RULES.SCORING_TYPES[code].label) === norm(label) || code === String(label).trim()) || '';
  const label = c => `${c.family} · ${c.year} · ${c.version}`;
  const emptyItem = () => Object.fromEntries(COLUMNS.map(c => [c.key, '']));

  // ── 양식 만들기 ─────────────────────────────────────────
  function templateSheets({ meta = {}, items = [] } = {}) {
    return [
      { name: SHEETS.meta, widths: [20, 60, 60], rows: [['항목', '값', '설명'], ...META.map(f => [f.label, f.key === 'scoring' ? scoringLabel(meta.scoring) : (meta[f.key] ?? ''), (f.required ? '(필수) ' : '') + f.help])],
        validations: [{ column: 1, fromRow: 7, toRow: 7, values: Object.values(RULES.SCORING_TYPES).map(t => t.label) }] },
      { name: SHEETS.items, widths: COLUMNS.map(c => c.width), rows: [COLUMNS.map(c => c.label), ...items.map(item => COLUMNS.map(c => item[c.key] ?? ''))],
        // 배점 방식을 엑셀에서 바꿔도 입력할 수 있도록 등급 목록은 두 방식을 모두 보여 줍니다(등록할 때 방식에 맞는지 검사).
        validations: [{ column: 1, values: RULES.AREAS }, { column: 5, values: Object.values(RULES.SCORING_TYPES).flatMap(t => t.levels) }] },
      { name: SHEETS.guide, widths: [16, 90], rows: [
        ['열', '작성 방법'],
        ...COLUMNS.map(c => [c.label, (c.required ? '(필수) ' : '') + c.help]),
        ['', ''],
        ['배점', `${RULES.SCORING_TYPES.grade3.label}: 상 10, 중 8, 하 6점 / ${RULES.SCORING_TYPES.risk5.label}: 5→10, 4→8, 3→6, 2→4, 1→2점`],
        ['등록', '양식을 채운 뒤 도구의 기준판 화면에서 [엑셀 양식으로 등록]을 누릅니다. 등록 전 직전 판과의 비교를 보여 줍니다.'],
        ['근거', '배점과 점수 산식은 docs/evaluation-criteria.md 참고']
      ] }
    ];
  }
  const templateWorkbook = data => app.xlsx.writeWorkbook(templateSheets(data));

  // ── 양식 읽기 ───────────────────────────────────────────
  const AREA_ALIASES = { 관리: '관리적', 관리적: '관리적', 물리: '물리적', 물리적: '물리적', 기술: '기술적', 기술적: '기술적' };

  function normalizeLevel(value, scoring) {
    const text = String(value ?? '').trim();
    if (scoring === 'risk5') { const n = Number(text); return Number.isInteger(n) ? String(n) : text; }
    return text;
  }

  // workbook({ sheets }) → { meta, items, errors, warnings }
  function parseTemplate(workbook) {
    const errors = [], warnings = [];
    const find = name => workbook.sheets.find(s => norm(s.name) === norm(name));
    const metaSheet = find(SHEETS.meta);
    const itemSheet = find(SHEETS.items) || workbook.sheets.find(s => (s.rows[0] || []).some(c => norm(c) === '항목ID'));
    if (!itemSheet) return { meta: {}, items: [], errors: [`'${SHEETS.items}' 시트를 찾지 못했습니다. 도구에서 내려받은 양식을 쓰세요.`], warnings };

    const meta = {};
    if (!metaSheet) errors.push(`'${SHEETS.meta}' 시트를 찾지 못했습니다.`);
    else for (const row of metaSheet.rows.slice(1)) {
      const field = META.find(f => norm(f.label) === norm(row[0]));
      if (field) meta[field.key] = String(row[1] ?? '').trim();
    }
    if (meta.date && /^\d+(\.\d+)?$/.test(meta.date)) meta.date = app.xlsx.serialToDate(meta.date) || meta.date;
    if (meta.year && /^\d+(\.0+)?$/.test(meta.year)) meta.year = String(parseInt(meta.year, 10));
    meta.scoring = scoringCode(meta.scoring);
    for (const f of META) if (f.required && !meta[f.key]) errors.push(`기준정보의 '${f.label}'을(를) 입력하세요.${f.key === 'scoring' ? ` (${f.help})` : ''}`);
    if (meta.year && !/^(20\d{2}|2100)$/.test(meta.year)) errors.push(`기준정보의 연도 '${meta.year}'는 2000~2100 사이의 4자리 숫자여야 합니다.`);

    const header = (itemSheet.rows[0] || []).map(cell => COLUMNS.find(c => norm(c.label) === norm(cell))?.key);
    for (const c of COLUMNS) if (c.required && !header.includes(c.key)) errors.push(`'${SHEETS.items}' 시트에 '${c.label}' 열이 없습니다.`);
    const levels = RULES.SCORING_TYPES[meta.scoring]?.levels || [];
    const items = [], seen = new Map();
    itemSheet.rows.slice(1).forEach((row, index) => {
      const rowNumber = index + 2;
      if (!row.some(cell => String(cell ?? '').trim())) return;
      const item = emptyItem();
      header.forEach((key, i) => { if (key) item[key] = String(row[i] ?? '').replace(/\r\n/g, '\n').trim(); });
      item.area = AREA_ALIASES[norm(item.area)] || item.area;
      item.level = normalizeLevel(item.level, meta.scoring);
      const where = `${rowNumber}행`;
      if (!item.id) errors.push(`${where}: 항목ID가 비어 있습니다.`);
      else if (seen.has(item.id)) errors.push(`${where}: 항목ID '${item.id}'가 ${seen.get(item.id)}행과 겹칩니다.`);
      else seen.set(item.id, rowNumber);
      if (!RULES.AREAS.includes(item.area)) errors.push(`${where}: 영역 '${item.area}'는 ${RULES.AREAS.join(', ')} 중 하나여야 합니다.`);
      if (!item.name) errors.push(`${where}: 항목명이 비어 있습니다.`);
      if (levels.length && !levels.includes(item.level)) errors.push(`${where}: 등급 '${item.level}'는 ${scoringLabel(meta.scoring)} 방식에서 ${levels.join(', ')} 중 하나여야 합니다.`);
      if (item.target && item.area !== '기술적') warnings.push(`${where}: 대상 유형은 기술적 항목에만 쓰입니다. '${item.id}'의 대상 유형은 무시됩니다.`);
      items.push(item);
    });
    if (!items.length) errors.push(`'${SHEETS.items}' 시트에 항목이 없습니다.`);
    if (errors.length > 30) errors.splice(30, errors.length - 30, `… 오류가 더 있습니다. 위 오류부터 고친 뒤 다시 등록하세요.`);
    return { meta, items, errors, warnings };
  }

  function duplicateError(list, meta) {
    return list.some(c => c.family === meta.family && String(c.year) === String(meta.year) && c.version === meta.version)
      ? '같은 계열·연도·버전의 기준판이 이미 있습니다. 버전을 바꾸거나 기존 판을 그대로 쓰세요.' : '';
  }

  function buildCriteria(meta, items, id, registeredAt) {
    return {
      id, family: meta.family, year: Number(meta.year), version: meta.version, date: meta.date || '', source: meta.source || '',
      scoring: meta.scoring, registeredAt,
      items: items.map(item => ({ ...emptyItem(), ...item, target: item.area === '기술적' ? item.target : '' }))
    };
  }

  // ── 비교 ────────────────────────────────────────────────
  // 같은 계열에서 이 판보다 먼저 등록된 판 중 가장 최근 것
  const previousOf = (list, c) => list.slice(0, list.indexOf(c)).reverse().find(p => p.family === c.family);
  const latestOf = (list, family) => list.slice().reverse().find(p => p.family === family);

  function diffCriteria(previous, next) {
    const old = new Map(previous.items.map(i => [i.id, i]));
    const ids = new Set(next.items.map(i => i.id));
    const changed = [], wording = [], added = [];
    for (const item of next.items) {
      const before = old.get(item.id);
      if (!before) { added.push(item); continue; }
      // 점검 내용·판단 기준이 비어 있다가 채워진 것은 보강(문구 변경)으로 봅니다.
      const keyChanges = KEY_FIELDS.filter(f => (before[f] || '') !== (item[f] || '') && !(['content', 'criteria'].includes(f) && !before[f]));
      if (keyChanges.length) changed.push({ item, before, fields: keyChanges });
      else if ([...KEY_FIELDS, ...TEXT_FIELDS].some(f => (before[f] || '') !== (item[f] || ''))) wording.push({ item, before });
    }
    // 배점 방식이 다르면 모든 공통 항목의 배점이 달라지므로 '변경'으로 봅니다.
    if (previous.scoring !== next.scoring) {
      for (const item of next.items) if (old.has(item.id) && !changed.some(c => c.item.id === item.id)) changed.push({ item, before: old.get(item.id), fields: ['scoring'] });
    }
    const removed = previous.items.filter(i => !ids.has(i.id));
    return { added, changed, wording, removed };
  }

  const fieldLabel = key => key === 'scoring' ? '배점 방식' : COLUMNS.find(c => c.key === key)?.label || key;

  app.criteria = {
    SHEETS, COLUMNS, META, KEY_FIELDS, label, scoringLabel, scoringCode, fieldLabel,
    templateSheets, templateWorkbook, parseTemplate, duplicateError, buildCriteria, previousOf, latestOf, diffCriteria
  };
})(window.SecurityChecklist = window.SecurityChecklist || {});
