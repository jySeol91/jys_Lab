// 조치 관리 화면: 취약·부분 조치 항목의 이행계획, 조치 완료, 조치불가(최고경영자 승인).
(function (app) {
  'use strict';

  const { RULES, ui, dates } = app;
  const A = app.assessment;
  const { $, esc, opts, say, store, ctx, badge } = ui;
  const view = { state: 'all', priority: 'all' };

  function summaryHtml(s) {
    const fmt = v => v === null ? '-' : (Math.round(v * 10) / 10).toFixed(1) + '%';
    return `<div class="tiles">
      <div class="tile main"><span>조치율</span><strong id="actionRate">${fmt(s.rate)}</strong><small>조치 완료 ${s.done} / 전체 ${s.total}건</small></div>
      <div class="tile"><span>조치 예정</span><strong>${s.planned}</strong><small>기한 안</small></div>
      <div class="tile ${s.overdue ? 'bad' : ''}"><span>기한 초과</span><strong id="overdueCount">${s.overdue}</strong><small>조치 예정 중 기한 지남</small></div>
      <div class="tile ${s.unplanned ? 'warn' : ''}"><span>계획 미수립</span><strong id="unplannedCount">${s.unplanned}</strong><small>담당자·기한 없음</small></div>
      <div class="tile"><span>조치불가</span><strong id="unfixableCount">${s.unfixable}</strong><small>최고경영자 승인</small></div>
    </div>`;
  }

  function cardHtml(f, crit) {
    const a = f.action, state = A.actionState(a), k = esc(f.key);
    const unfixable = a.status === '조치불가';
    return `<details class="finding" data-key="${k}">
      <summary>${badge(state, ui.STATE_CLASS[state])} <strong>${esc(f.item.id)}</strong> ${esc(f.item.name)} · ${esc(f.scopeName)} · ${esc(ui.verdictLabel(f.result.verdict))} · ${badge(f.priority + ' 개선', f.priority === '조기' ? 'bad' : '')} · 기한 ${esc(a.due || '-')}</summary>
      <div class="finding-body">
        <p class="muted">등급 ${esc(ui.levelLabel(crit, f.item.level))} · 발견 내용: ${esc(f.result.finding || '(기록 없음)')}${f.result.evidence ? ' · 증적 ' + esc(f.result.evidence) : ''}</p>
        ${f.item.remediation ? `<details class="criteria"><summary>기준판의 대응 방안</summary><p>${ui.multiline(f.item.remediation)}</p></details>` : ''}
        <form class="action-form" data-key="${k}">
          <div class="grid">
            <label>상태<select name="status">${opts(RULES.ACTION_STATUS.map(s => [s, s]), a.status)}</select></label>
            <label>담당자<input name="owner" maxlength="80" value="${esc(a.owner)}"></label>
            <label>조치 기한<input type="date" name="due" value="${esc(a.due)}"></label>
            <label>완료일<input type="date" name="doneAt" value="${esc(a.doneAt)}"></label>
            <label>증적 참조<input name="evidence" maxlength="500" value="${esc(a.evidence)}" placeholder="변경 승인 번호, 재점검 결과 문서 등"></label>
          </div>
          <label>조치 내용·계획<textarea name="plan" rows="2" maxlength="4000" placeholder="${esc((f.item.remediation || '조치 방법을 적습니다').split('\n')[0])}">${esc(a.plan)}</textarea></label>
          <fieldset class="unfixable" ${unfixable ? '' : 'hidden'}><legend>조치불가 (전자금융감독규정 제37조의2제5항제2호)</legend>
            <div class="grid">
              <label>사유<select name="reason">${opts([['', '선택'], ...RULES.UNFIXABLE_REASONS.map(r => [r, r])], a.reason)}</select></label>
              <label>최고경영자 승인일<input type="date" name="approvedAt" value="${esc(a.approvedAt)}"></label>
              <label>승인 문서 번호<input name="approvalRef" maxlength="200" value="${esc(a.approvalRef)}"></label>
            </div>
            <label>보완대책<textarea name="compensating" rows="2" maxlength="4000">${esc(a.compensating)}</textarea></label>
          </fieldset>
          <button class="primary">저장</button> <output class="form-msg" role="status"></output>
        </form>
      </div>
    </details>`;
  }

  function render() {
    const root = $('tab-actions');
    const current = ui.currentAssessment();
    if (!current) { root.innerHTML = '<section class="card"><p>진단이 없습니다. [진단 평가] 화면에서 진단을 만드세요.</p></section>'; return; }
    ctx.assessmentId = current.id;
    const crit = ui.criteriaOf(current.criteriaId);
    const findings = A.findingsOf(crit, current, ui.assetsById(), store.state.settings);
    const summary = A.remediationSummary(findings);
    const shown = findings.filter(f => (view.state === 'all' || A.actionState(f.action) === view.state) && (view.priority === 'all' || f.priority === view.priority));
    root.innerHTML = `<section class="card">
        <label>진단 선택<select id="actionAssessSelect">${ui.assessmentOptions(ctx.assessmentId)}</select></label>
        <p class="muted">취약·부분 조치로 판정한 칸마다 이행계획을 세웁니다. 기본 기한은 개선 구분(${RULES.PRIORITY_ORDER.map(p => `${p} ${store.state.settings.dueDays[p]}일`).join(', ')}, 진단 종료일 기준)으로 채워지며 바꿀 수 있습니다.</p>
        <div id="actionSummary">${summaryHtml(summary)}</div>
        <div class="toolbar">
          <label>상태<select id="actionStateFilter">${opts([['all', '전체'], ...['조치 예정', '기한 초과', '계획 미수립', '조치 완료', '조치불가'].map(s => [s, s])], view.state)}</select></label>
          <label>개선 구분<select id="actionPriorityFilter">${opts([['all', '전체'], ...RULES.PRIORITY_ORDER.map(p => [p, p])], view.priority)}</select></label>
        </div>
      </section>
      <section class="card" id="findingList">${findings.length ? (shown.map(f => cardHtml(f, crit)).join('') || '<p>조건에 맞는 항목이 없습니다.</p>') : '<p>취약·부분 조치로 판정한 항목이 없습니다.</p>'}</section>`;

    $('actionAssessSelect').onchange = e => { ctx.assessmentId = e.target.value; render(); };
    $('actionStateFilter').onchange = e => { view.state = e.target.value; render(); };
    $('actionPriorityFilter').onchange = e => { view.priority = e.target.value; render(); };

    const list = $('findingList');
    list.addEventListener('change', e => {
      if (e.target.name !== 'status') return;
      e.target.form.querySelector('.unfixable').hidden = e.target.value !== '조치불가';
    });
    list.addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target, key = form.dataset.key;
      const finding = findings.find(f => f.key === key);
      const data = Object.fromEntries(new FormData(form));
      const action = { ...A.emptyAction(), ...finding.action, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v).trim()])) };
      if (action.status !== '조치불가') Object.assign(action, { reason: '', compensating: '', approvedAt: '', approvalRef: '' });
      const error = A.actionError(action, current);
      if (error) { say(`${finding.item.id} (${finding.scopeName}): ${error}`); Object.assign(form.querySelector('.form-msg'), { textContent: error, className: 'form-msg bad' }); return; }
      const ok = store.commit(next => { next.assessments.find(a => a.id === current.id).actions[key] = action; }, `${finding.item.id} (${finding.scopeName}) 조치 기록을 저장했습니다.`);
      if (!ok) return;
      const open = [...list.querySelectorAll('details.finding[open]')].map(d => d.dataset.key);
      const message = $('message').textContent;
      render();
      for (const d of $('findingList').querySelectorAll('details.finding')) if (open.includes(d.dataset.key)) d.open = true;
      const saved = $('findingList').querySelector(`form[data-key="${CSS.escape(key)}"] .form-msg`);
      if (saved) Object.assign(saved, { textContent: '저장했습니다.', className: 'form-msg ok' });
      say(message);
    });
  }

  ui.views.actions = { render };
})(window.SecurityChecklist);
