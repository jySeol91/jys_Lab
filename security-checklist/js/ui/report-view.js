// 보고서 화면: 인쇄(PDF 저장)용 결과 보고서와 엑셀 내보내기.
(function (app) {
  'use strict';

  const { RULES, ui, scoring, dates } = app;
  const A = app.assessment, C = app.criteria;
  const { $, esc, store, ctx } = ui;
  const fmt = scoring.formatScore;

  // 보고서와 엑셀이 함께 쓰는 데이터
  function reportData(current) {
    const crit = ui.criteriaOf(current.criteriaId);
    const assets = ui.assetsById();
    const result = scoring.compute(crit, current, assets);
    const findings = A.findingsOf(crit, current, assets, store.state.settings);
    const cells = scoring.cellsOf(crit, current, assets).map(({ item, scope }) => ({
      item, scope, scopeName: scope === scoring.ORG ? '기관 공통' : assets.get(scope)?.name || '(삭제된 자산)',
      result: scoring.resultOf(current, item.id, scope) || { verdict: '', finding: '', evidence: '' }
    }));
    const byLevel = RULES.SCORING_TYPES[crit.scoring].levels.map(level => ({
      level, fail: cells.filter(c => c.item.level === level && c.result.verdict === 'fail').length,
      partial: cells.filter(c => c.item.level === level && c.result.verdict === 'partial').length
    }));
    return { crit, assets, result, findings, cells, byLevel, summary: A.remediationSummary(findings), today: dates.todayKst() };
  }

  function reportHtml(current, d) {
    const { crit, result, findings, summary } = d;
    const network = result.network;
    const assetRows = current.assetIds.map(id => d.assets.get(id)).filter(Boolean);
    const areaRows = RULES.AREAS.filter(a => result.areas[a].total).map(area => {
      const a = result.areas[area];
      return `<tr><td>${area}</td><td>${a.count} / ${a.total}</td><td>${area === '기술적' ? '자산별 계산' : a.A}</td><td>${area === '기술적' ? '자산별 계산' : a.B}</td><td>${fmt(a.score)}</td></tr>`;
    }).join('');
    const unchecked = result.progress.cells - result.progress.done;
    const unfixable = findings.filter(f => f.action.status === '조치불가');
    return `<h1>취약점 분석·평가 결과 보고서</h1>
      <p class="muted">${esc(current.title)} · 작성일 ${d.today}</p>
      <h2>1. 개요</h2>
      <table class="kv"><tbody>
        <tr><th>진단명</th><td>${esc(current.title)}</td></tr>
        <tr><th>적용 기준판</th><td>${esc(C.label(crit))}${crit.date ? ` (시행·게시 ${esc(crit.date)})` : ''}</td></tr>
        <tr><th>배점 방식</th><td>${esc(C.scoringLabel(crit.scoring))}</td></tr>
        <tr><th>진단 기간</th><td>${esc(current.start)} ~ ${esc(current.end)}</td></tr>
        <tr><th>수행 주체</th><td>${esc(current.performer)}${current.organization ? ` · ${esc(current.organization)}` : ''}</td></tr>
        <tr><th>망분리 구분</th><td>${esc(network.label)} (${Math.round(network.ratio * 100)}%)</td></tr>
        <tr><th>대상 자산</th><td>${assetRows.map(a => `${esc(a.name)} (${esc(a.type || '유형 없음')}${a.homepage ? ', 홈페이지' : ''})`).join(', ') || '-'}</td></tr>
      </tbody></table>
      <h2>2. 점수</h2>
      <p class="score-line">종합점수 <strong id="reportTotal">${fmt(result.total)}</strong>점 = 합산 ${fmt(result.combined)}점 × 망분리 비율 ${Math.round(network.ratio * 100)}%</p>
      ${unchecked ? `<p class="warn-text">미점검 ${unchecked}칸이 있어 확정 점수가 아닙니다.</p>` : ''}
      <table><thead><tr><th>영역</th><th>판정 항목 / 전체</th><th>배점 합(A)</th><th>결과값 합(B)</th><th>점수</th></tr></thead><tbody>${areaRows}</tbody></table>
      ${result.areas['기술적'].assets.length ? `<h3>자산별 기술적 점수</h3><table><thead><tr><th>자산</th><th>적용 항목</th><th>A</th><th>B</th><th>점수</th></tr></thead><tbody>${result.areas['기술적'].assets.map(a => `<tr><td>${esc(a.name)}</td><td>${a.applicable}</td><td>${a.A}</td><td>${a.B}</td><td>${fmt(a.score)}</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="muted">산식: 영역 점수 = (A − B) ÷ A × 100, 기술적 점수 = 자산별 점수 평균, 합산 = 영역 점수의 항목 수 가중 평균, 종합점수 = 합산 × 망분리 비율. 근거: ${esc(RULES.SCORE_SOURCE)}(준용). 해당 없음·미점검은 계산에서 제외.</p>
      <h2>3. 판정 요약</h2>
      <table><thead><tr><th>양호(×)</th><th>취약(○)</th><th>부분 조치(P)</th><th>해당 없음</th><th>미점검</th><th>기록 누락</th></tr></thead><tbody><tr><td>${result.counts.pass}</td><td>${result.counts.fail}</td><td>${result.counts.partial}</td><td>${result.counts.na}</td><td>${result.counts.unchecked}</td><td>${result.missingNotes}</td></tr></tbody></table>
      <table><thead><tr><th>등급</th>${d.byLevel.map(l => `<th>${esc(l.level)}</th>`).join('')}</tr></thead><tbody>
        <tr><th>취약</th>${d.byLevel.map(l => `<td>${l.fail}</td>`).join('')}</tr><tr><th>부분 조치</th>${d.byLevel.map(l => `<td>${l.partial}</td>`).join('')}</tr></tbody></table>
      <h2>4. 취약 항목과 이행계획</h2>
      <p>조치율 ${summary.rate === null ? '-' : fmt(summary.rate) + '%'} (조치 완료 ${summary.done} / 전체 ${summary.total}건) · 조치 예정 ${summary.planned} · 기한 초과 ${summary.overdue} · 계획 미수립 ${summary.unplanned} · 조치불가 ${summary.unfixable}</p>
      ${findings.length ? `<table class="findings"><thead><tr><th>개선 구분</th><th>항목</th><th>대상</th><th>판정</th><th>발견 내용</th><th>대응 방안</th><th>이행계획</th></tr></thead><tbody>${findings.map(f => `<tr>
        <td>${esc(f.priority)}</td><td><strong>${esc(f.item.id)}</strong> ${esc(f.item.name)}<br><small>등급 ${esc(f.item.level)}</small></td><td>${esc(f.scopeName)}</td>
        <td>${esc(ui.verdictLabel(f.result.verdict))}</td><td>${ui.multiline(f.result.finding)}</td><td>${ui.multiline(f.item.remediation || '-')}</td>
        <td>${esc(A.actionState(f.action))}<br>${f.action.owner ? '담당 ' + esc(f.action.owner) + '<br>' : ''}기한 ${esc(f.action.due || '-')}${f.action.plan ? '<br>' + ui.multiline(f.action.plan) : ''}${f.action.doneAt ? `<br>완료 ${esc(f.action.doneAt)}` : ''}</td></tr>`).join('')}</tbody></table>` : '<p>취약·부분 조치 항목이 없습니다.</p>'}
      <h2>5. 조치불가 항목 승인 내역</h2>
      ${unfixable.length ? `<table><thead><tr><th>항목</th><th>대상</th><th>사유</th><th>보완대책</th><th>최고경영자 승인</th></tr></thead><tbody>${unfixable.map(f => `<tr><td>${esc(f.item.id)} ${esc(f.item.name)}</td><td>${esc(f.scopeName)}</td><td>${esc(f.action.reason)}</td><td>${ui.multiline(f.action.compensating)}</td><td>${esc(f.action.approvedAt)} · ${esc(f.action.approvalRef)}</td></tr>`).join('')}</tbody></table>` : '<p>조치불가 항목이 없습니다.</p>'}
      <p class="muted">이 보고서는 공식 제출 서식이 아닙니다. 전자금융감독규정 제37조의3제2항의 결과보고서를 작성할 때 내용을 옮겨 씁니다.</p>`;
  }

  function workbookSheets(current, d) {
    const { crit, result, findings } = d;
    const summaryRows = [['항목', '값'], ['진단명', current.title], ['적용 기준판', C.label(crit)], ['배점 방식', C.scoringLabel(crit.scoring)], ['진단 기간', `${current.start} ~ ${current.end}`],
      ['수행 주체', `${current.performer}${current.organization ? ' · ' + current.organization : ''}`], ['망분리 구분', `${result.network.label} (${Math.round(result.network.ratio * 100)}%)`],
      ['종합점수', fmt(result.total)], ['합산 점수', fmt(result.combined)],
      ...RULES.AREAS.filter(a => result.areas[a].total).map(a => [`${a} 점수`, fmt(result.areas[a].score)]),
      ...result.areas['기술적'].assets.map(a => [`자산 점수: ${a.name}`, fmt(a.score)]),
      ['진단률', `${result.progress.done} / ${result.progress.cells}칸`], ['조치율', d.summary.rate === null ? '-' : fmt(d.summary.rate) + '%'],
      ['점수 근거', RULES.SCORE_SOURCE + ' (준용)'], ['작성일', d.today]];
    return [
      { name: '요약', widths: [22, 70], rows: summaryRows },
      { name: '점검결과', widths: [9, 14, 36, 7, 7, 16, 12, 40, 20, 10], rows: [['영역', '항목ID', '항목명', '등급', '배점', '대상', '판정', '발견 내용·사유', '증적 참조', '이전 결과'],
        ...d.cells.map(c => [c.item.area, c.item.id, c.item.name, c.item.level, scoring.points(crit.scoring, c.item.level), c.scopeName, ui.verdictLabel(c.result.verdict) || '미점검', c.result.finding, c.result.evidence, c.result.carried ? '예' : ''])] },
      { name: '이행계획', widths: [9, 14, 30, 16, 12, 30, 40, 12, 12, 30, 12, 20, 16, 30, 12, 16], rows: [['개선 구분', '항목ID', '항목명', '대상', '판정', '발견 내용', '대응 방안', '상태', '담당자', '조치 내용·계획', '조치 기한', '증적 참조', '완료일', '조치불가 사유·보완대책', '승인일', '승인 문서'],
        ...findings.map(f => [f.priority, f.item.id, f.item.name, f.scopeName, ui.verdictLabel(f.result.verdict), f.result.finding, f.item.remediation, A.actionState(f.action), f.action.owner, f.action.plan, f.action.due, f.action.evidence, f.action.doneAt,
          [f.action.reason, f.action.compensating].filter(Boolean).join(' / '), f.action.approvedAt, f.action.approvalRef])] }
    ];
  }

  function render() {
    const root = $('tab-report');
    const current = ui.currentAssessment();
    if (!current) { root.innerHTML = '<section class="card"><p>진단이 없습니다. [진단 평가] 화면에서 진단을 만드세요.</p></section>'; return; }
    ctx.assessmentId = current.id;
    const d = reportData(current);
    root.innerHTML = `<section class="card no-print">
        <label>진단 선택<select id="reportAssessSelect">${ui.assessmentOptions(ctx.assessmentId)}</select></label>
        <div class="actions"><button type="button" class="primary" id="printReport">인쇄·PDF 저장</button><button type="button" id="exportReport">엑셀로 내려받기</button></div>
      </section>
      <article class="card report" id="report">${reportHtml(current, d)}</article>`;
    $('reportAssessSelect').onchange = e => { ctx.assessmentId = e.target.value; render(); };
    $('printReport').onclick = () => window.print();
    $('exportReport').onclick = () => {
      ui.download(app.xlsx.writeWorkbook(workbookSheets(current, d)), ui.safeFileName(`진단결과_${current.title}_${d.today}`) + '.xlsx');
      ui.say('진단 결과를 엑셀 파일로 내려받았습니다.');
    };
  }

  ui.views.report = { render, reportData, workbookSheets };
})(window.SecurityChecklist);
