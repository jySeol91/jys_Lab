// 진단 평가 화면: 진단 만들기, 개정판으로 이어서 진단, 항목별 판정과 점수.
(function (app) {
  'use strict';

  const { RULES, ui, scoring, dates } = app;
  const A = app.assessment, C = app.criteria;
  const { $, esc, opts, say, store, ctx, badge } = ui;
  const ORG = scoring.ORG;
  const view = { scope: '', filter: 'all', query: '' };

  const criteriaOptions = (list, chosen) => opts(list.slice().reverse().map(c => [c.id, C.label(c)]), chosen);
  const networkOptions = chosen => opts(RULES.NETWORK.map(n => [n.code, `${n.label} (${Math.round(n.ratio * 100)}%)`]), chosen);
  const verdictOptions = chosen => opts(RULES.VERDICTS.map(v => [v.code, ui.verdictLabel(v.code)]), chosen);

  function assetChecks(selected = []) {
    const assets = store.state.assets;
    if (!assets.length) return '<p class="muted">등록된 자산이 없습니다. [자산·주기] 화면에서 먼저 자산을 추가하세요.</p>';
    return '<div class="checks">' + assets.map(a => `<label class="check"><input type="checkbox" name="assetIds" value="${esc(a.id)}" ${selected.includes(a.id) ? 'checked' : ''}> ${esc(a.name)} <small>${esc(a.type || '유형 없음')}${a.homepage ? ' · 홈페이지' : ''}</small></label>`).join('') + '</div>';
  }

  function newFormHtml() {
    const today = dates.todayKst();
    return `<form id="newAssessment">
      <div class="grid">
        <label>진단명<input name="title" required maxlength="120" placeholder="예: 2026년 상반기 인터넷뱅킹 웹 진단"></label>
        <label>적용 기준판<select name="criteriaId">${criteriaOptions(store.state.criteria, store.state.criteria.at(-1).id)}</select></label>
        <label>시작일<input type="date" name="start" required value="${today}"></label>
        <label>종료일<input type="date" name="end" required value="${today}"></label>
        <label>수행 주체<select name="performer">${opts([['자체', '자체'], ['위탁', '위탁(평가전문기관)']], '자체')}</select></label>
        <label>수행 조직<input name="organization" maxlength="120" placeholder="예: 자체전담반, 평가전문기관명"></label>
        <label>망분리 구분<select name="network">${networkOptions('exempt')}</select></label>
      </div>
      <fieldset><legend>대상 자산 (기술적 항목을 점검할 자산)</legend>${assetChecks()}</fieldset>
      <button class="primary">진단 만들기</button>
    </form>`;
  }

  function carryFormHtml(current) {
    const others = store.state.criteria.filter(c => c.id !== current.criteriaId);
    const from = ui.criteriaOf(current.criteriaId);
    if (!others.length) return '<p class="muted">옮겨 갈 다른 기준판이 없습니다. [기준판] 화면에서 새 판을 등록하세요.</p>';
    const preferred = C.latestOf(others, from.family) || others.at(-1);
    const today = dates.todayKst();
    return `<form id="carryForm">
      <p class="muted">이 진단의 결과를 새 기준판으로 옮깁니다. 바뀌지 않은 항목의 판정과 조치 기록은 이어받고, 추가·변경 항목은 미점검으로 둡니다. 이 진단은 그대로 남습니다.</p>
      <div class="grid">
        <label>새 기준판<select name="criteriaId">${criteriaOptions(others, preferred.id)}</select></label>
        <label>진단명<input name="title" required maxlength="120" value="${esc(current.title + ' (개정판 적용)')}"></label>
        <label>시작일<input type="date" name="start" required value="${today}"></label>
        <label>종료일<input type="date" name="end" required value="${today}"></label>
      </div>
      <p id="carryPreview" class="note"></p>
      <button class="primary">이어서 진단 만들기</button>
    </form>`;
  }

  function scoreBoardHtml(result, crit) {
    const fmt = scoring.formatScore, c = result.counts;
    const tiles = [`<div class="tile main"><span>종합점수</span><strong id="totalScore">${fmt(result.total)}</strong><small>합산 ${fmt(result.combined)} × 망분리 ${Math.round(result.network.ratio * 100)}%</small></div>`];
    for (const area of RULES.AREAS) {
      const a = result.areas[area];
      if (!a.total) continue;
      tiles.push(`<div class="tile"><span>${area} 영역</span><strong data-area="${area}">${fmt(a.score)}</strong><small>판정 항목 ${a.count} / ${a.total}개</small></div>`);
    }
    const pct = result.progress.cells ? Math.round(result.progress.done / result.progress.cells * 100) : 0;
    tiles.push(`<div class="tile"><span>진단률</span><strong id="progress">${pct}%</strong><small>${result.progress.done} / ${result.progress.cells}칸</small></div>`);
    tiles.push(`<div class="tile"><span>취약·부분 조치</span><strong id="findingCount">${c.fail + c.partial}</strong><small>양호 ${c.pass} · 해당 없음 ${c.na}</small></div>`);
    if (result.missingNotes) tiles.push(`<div class="tile warn"><span>기록 누락</span><strong>${result.missingNotes}</strong><small>발견 내용·사유가 빈 칸</small></div>`);
    const assets = result.areas['기술적'].assets;
    const assetTable = assets.length ? `<details class="asset-scores"><summary>자산별 기술적 점수</summary><div class="scroll"><table><thead><tr><th>자산</th><th>적용 항목</th><th>배점 합(A)</th><th>결과값 합(B)</th><th>점수</th></tr></thead><tbody>${assets.map(a => `<tr><td>${esc(a.name)}</td><td>${a.applicable}</td><td>${a.A}</td><td>${a.B}</td><td>${fmt(a.score)}</td></tr>`).join('')}</tbody></table></div><p class="muted">기술적 점수는 자산별 점수의 평균입니다. 산식: (A − B) ÷ A × 100</p></details>` : '';
    const unchecked = result.progress.cells - result.progress.done;
    return `<div class="tiles">${tiles.join('')}</div>${unchecked ? `<p class="muted">미점검 ${unchecked}칸은 점수에서 빠져 있습니다. 모두 판정해야 확정 점수입니다.</p>` : ''}${assetTable}`;
  }

  function scopesOf(current, crit) {
    const assets = ui.assetsById();
    const scopes = [];
    const orgItems = crit.items.filter(i => i.area !== '기술적').length;
    if (orgItems) scopes.push([ORG, `기관 공통 · 관리적·물리적 (${orgItems}개)`]);
    for (const id of current.assetIds) {
      const asset = assets.get(id);
      const n = crit.items.filter(i => scoring.appliesTo(i, asset)).length;
      scopes.push([id, `${asset?.name || '(삭제된 자산)'} · ${asset?.type || '유형 없음'} (기술적 ${n}개)`]);
    }
    return scopes;
  }

  function detailHtml(current) {
    const crit = ui.criteriaOf(current.criteriaId);
    const result = scoring.compute(crit, current, ui.assetsById());
    const scopes = scopesOf(current, crit);
    if (!scopes.some(([id]) => id === view.scope)) view.scope = scopes[0]?.[0] || '';
    const carry = current.carry;
    const carried = Object.values(current.results).reduce((n, row) => n + Object.values(row).filter(r => r.carried).length, 0);
    const network = scoring.networkOf(current.network);
    return `<section class="card" id="assessDetail">
      <div class="head-row"><h2>${esc(current.title)}</h2>
        <div class="actions"><button type="button" id="editAssets">대상 자산 변경</button><button type="button" id="deleteAssessment" class="danger">진단 삭제</button></div></div>
      <p class="muted">적용 기준판 ${esc(C.label(crit))} · 배점 ${esc(C.scoringLabel(crit.scoring))} · 기간 ${esc(current.start)} ~ ${esc(current.end)} · 수행 ${esc(current.performer)}${current.organization ? ` (${esc(current.organization)})` : ''} · 망분리 ${esc(network.label)}</p>
      ${carry ? `<p class="note">이전 진단에서 이어받음: 이어받은 판정 ${carried}칸 · 개정 추가 ${carry.added.length}개 · 개정 변경 ${carry.changed.length}개 · 개정 삭제 ${carry.removed.length}개. 추가·변경 항목은 미점검입니다. 이어받은 판정은 [이전 결과]로 표시되며 다시 확인하면 표시가 사라집니다.</p>` : ''}
      <form id="assetEditor" hidden><fieldset><legend>대상 자산</legend>${assetChecks(current.assetIds)}</fieldset><button class="primary">대상 자산 적용</button> <button type="button" id="cancelAssets">취소</button></form>
      <div id="scoreBoard">${scoreBoardHtml(result, crit)}</div>
      ${scopes.length ? `<div class="toolbar">
        <label>점검 범위<select id="scopeSelect">${opts(scopes, view.scope)}</select></label>
        <label>보기<select id="filterSelect">${opts([['all', '전체'], ['unchecked', '미점검'], ['findings', '취약·부분 조치'], ['missing', '기록 누락'], ['carried', '이전 결과(재확인 필요)'], ['revised', '개정 추가·변경'], ['prevfail', '직전 진단 취약']], view.filter)}</select></label>
        <label class="grow">검색<input id="itemQuery" type="search" value="${esc(view.query)}" placeholder="항목ID, 분류, 항목명"></label>
      </div>
      <div class="scroll"><table class="items"><thead><tr><th>항목</th><th>등급·배점</th><th>판정</th><th>발견 내용·사유</th><th>증적 참조</th></tr></thead><tbody id="itemRows"></tbody></table></div>`
      : '<p class="muted">점검할 범위가 없습니다. [대상 자산 변경]으로 자산을 추가하세요.</p>'}
    </section>`;
  }

  const guideHtml = () => `<section class="card"><h2>시작하기</h2><ol>
    <li>[기준판] 화면에서 적용할 기준판을 확인합니다. 새 기준은 엑셀 양식으로 등록합니다.</li>
    <li>[자산·주기] 화면에서 점검 대상 자산(웹 서비스, 서버 등)을 등록합니다.</li>
    <li>위의 [새 진단 만들기]로 진단을 만들고 항목별로 판정합니다.</li></ol></section>`;

  function itemsForScope(crit, scope) {
    if (scope === ORG) return crit.items.filter(i => i.area !== '기술적');
    const asset = ui.assetsById().get(scope);
    return crit.items.filter(i => scoring.appliesTo(i, asset));
  }

  function flagsOf(current, item, scope) {
    const r = scoring.resultOf(current, item.id, scope) || { verdict: '', finding: '', evidence: '' };
    const carry = current.carry;
    return {
      r,
      carried: Boolean(r.carried),
      added: Boolean(carry?.added.includes(item.id)),
      changed: Boolean(carry?.changed.includes(item.id)),
      prevFail: Boolean(carry?.previousFails?.includes(A.actionKey(item.id, scope))),
      missing: ['fail', 'partial', 'na'].includes(r.verdict) && !r.finding.trim()
    };
  }

  function badgesHtml(f) {
    return [f.carried && badge('이전 결과', 'info'), f.added && badge('개정 추가', 'warn'), f.changed && badge('개정 변경', 'warn'),
      f.prevFail && badge('직전 취약', 'bad'), f.missing && badge('기록 누락', 'warn')].filter(Boolean).join(' ');
  }

  function matchesFilter(item, f) {
    switch (view.filter) {
      case 'unchecked': return !f.r.verdict;
      case 'findings': return ['fail', 'partial'].includes(f.r.verdict);
      case 'missing': return f.missing;
      case 'carried': return f.carried;
      case 'revised': return f.added || f.changed;
      case 'prevfail': return f.prevFail;
      default: return true;
    }
  }

  function detailBlock(item) {
    const parts = [['점검 내용', item.content], ['판단 기준', item.criteria], ['대응 방안', item.remediation], ['조치 시 영향', item.impact]].filter(([, v]) => v);
    return parts.length ? `<details class="criteria"><summary>점검 기준 보기</summary>${parts.map(([k, v]) => `<p><strong>${k}</strong><br>${ui.multiline(v)}</p>`).join('')}</details>` : '';
  }

  function renderRows(current, crit) {
    const body = $('itemRows');
    if (!body) return;
    const q = view.query.trim().toLowerCase();
    const rows = itemsForScope(crit, view.scope).map(item => ({ item, f: flagsOf(current, item, view.scope) }))
      .filter(({ item, f }) => matchesFilter(item, f) && (!q || [item.id, item.category, item.name].join(' ').toLowerCase().includes(q)))
      .map(({ item, f }) => `<tr data-item="${esc(item.id)}" class="${f.r.verdict ? 'v-' + f.r.verdict : ''}">
        <td><strong>${esc(item.id)}</strong> ${esc(item.name)}<br><small>${esc(item.area)}${item.category ? ' · ' + esc(item.category) : ''}${item.target ? ' · 대상 ' + esc(item.target) : ''}${item.ref ? ' · ' + esc(item.ref) : ''}</small>
          <span class="badges">${badgesHtml(f)}</span>${detailBlock(item)}</td>
        <td>${esc(ui.levelLabel(crit, item.level))}</td>
        <td><select aria-label="${esc(item.id)} 판정" data-field="verdict">${verdictOptions(f.r.verdict)}</select></td>
        <td><textarea aria-label="${esc(item.id)} 발견 내용" data-field="finding" rows="2" maxlength="4000">${esc(f.r.finding)}</textarea></td>
        <td><input aria-label="${esc(item.id)} 증적" data-field="evidence" maxlength="500" value="${esc(f.r.evidence)}"></td>
      </tr>`);
    body.innerHTML = rows.join('') || '<tr><td colspan="5">표시할 항목이 없습니다.</td></tr>';
  }

  function refreshScore() {
    const current = ui.currentAssessment();
    const crit = ui.criteriaOf(current.criteriaId);
    $('scoreBoard').innerHTML = scoreBoardHtml(scoring.compute(crit, current, ui.assetsById()), crit);
  }

  function onCellChange(e) {
    const field = e.target.dataset.field, tr = e.target.closest('tr[data-item]');
    if (!field || !tr) return;
    const itemId = tr.dataset.item, scope = view.scope, id = ctx.assessmentId;
    const value = field === 'verdict' ? e.target.value : e.target.value.trim();
    const ok = store.commit(next => A.setResult(next.assessments.find(a => a.id === id), itemId, scope, { [field]: value }), `${itemId} 저장됨`);
    if (!ok) return;
    const current = ui.currentAssessment();
    const f = flagsOf(current, { id: itemId }, scope);
    tr.className = f.r.verdict ? 'v-' + f.r.verdict : '';
    tr.querySelector('.badges').innerHTML = badgesHtml(f);
    refreshScore();
  }

  function bind(current) {
    $('assessSelect').onchange = e => { ctx.assessmentId = e.target.value; view.scope = ''; render(); };

    $('newAssessment').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target), data = Object.fromEntries(f), assetIds = f.getAll('assetIds');
      const crit = ui.criteriaOf(data.criteriaId);
      const error = A.newAssessmentError(data, crit, assetIds);
      if (error) { say(error); return; }
      const a = A.buildAssessment(data, crit, assetIds, ui.uid(), new Date().toISOString());
      if (store.commit(next => next.assessments.unshift(a), '진단을 만들었습니다.')) { ctx.assessmentId = a.id; view.scope = ''; view.filter = 'all'; render(); }
    };

    if (!current) return;
    const crit = ui.criteriaOf(current.criteriaId);

    const carryForm = $('carryForm');
    if (carryForm) {
      const preview = () => {
        const to = ui.criteriaOf(carryForm.elements.criteriaId.value);
        const d = C.diffCriteria(crit, to);
        $('carryPreview').textContent = `이어받는 항목 ${to.items.length - d.added.length - d.changed.length}개 · 다시 점검할 항목 ${d.added.length + d.changed.length}개(추가 ${d.added.length}, 변경 ${d.changed.length}) · 빠지는 항목 ${d.removed.length}개`;
      };
      carryForm.elements.criteriaId.onchange = preview; preview();
      carryForm.onsubmit = e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        const to = ui.criteriaOf(data.criteriaId);
        const error = A.newAssessmentError(data, to, current.assetIds);
        if (error) { say(error); return; }
        const a = A.carryOver(current, crit, to, { title: data.title, start: data.start, end: data.end }, ui.uid(), new Date().toISOString());
        if (store.commit(next => next.assessments.unshift(a), '새 기준판으로 이어서 진단을 만들었습니다.')) { ctx.assessmentId = a.id; view.scope = ''; view.filter = 'all'; render(); }
      };
    }

    $('deleteAssessment').onclick = () => {
      if (!confirm(`'${current.title}' 진단과 판정·조치 기록을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
      if (store.commit(next => { next.assessments = next.assessments.filter(a => a.id !== current.id); }, '진단을 삭제했습니다.')) { ctx.assessmentId = store.state.assessments[0]?.id || ''; render(); }
    };

    const editor = $('assetEditor');
    $('editAssets').onclick = () => { editor.hidden = !editor.hidden; };
    $('cancelAssets').onclick = () => { editor.hidden = true; };
    editor.onsubmit = e => {
      e.preventDefault();
      const ids = new FormData(e.target).getAll('assetIds');
      if (crit.items.some(i => i.area === '기술적') && !ids.length) { say('기술적 항목을 점검할 대상 자산을 하나 이상 고르세요.'); return; }
      const removed = current.assetIds.filter(id => !ids.includes(id));
      const lost = Object.values(current.results).reduce((n, row) => n + removed.filter(id => row[id]).length, 0);
      if (lost && !confirm(`빠지는 자산의 판정 ${lost}칸과 조치 기록이 삭제됩니다. 계속할까요?`)) return;
      const ok = store.commit(next => {
        const a = next.assessments.find(x => x.id === current.id);
        a.assetIds = ids;
        for (const row of Object.values(a.results)) for (const id of removed) delete row[id];
        for (const [itemId, row] of Object.entries(a.results)) if (!Object.keys(row).length) delete a.results[itemId];
        for (const key of Object.keys(a.actions)) if (removed.includes(key.split('|')[1])) delete a.actions[key];
      }, '대상 자산을 바꿨습니다.');
      if (ok) render();
    };

    const body = $('itemRows');
    if (!body) return;
    body.addEventListener('change', onCellChange);
    // 글자를 입력하다 창을 닫아도 남도록, 입력이 멈추면 잠시 뒤 저장합니다(칸을 벗어날 때도 저장).
    let typing;
    body.addEventListener('input', e => {
      if (!['finding', 'evidence'].includes(e.target.dataset.field)) return;
      clearTimeout(typing);
      typing = setTimeout(() => { if (e.target.isConnected) onCellChange(e); }, 700);
    });
    $('scopeSelect').onchange = e => { view.scope = e.target.value; renderRows(ui.currentAssessment(), crit); };
    $('filterSelect').onchange = e => { view.filter = e.target.value; renderRows(ui.currentAssessment(), crit); };
    $('itemQuery').oninput = e => { view.query = e.target.value; renderRows(ui.currentAssessment(), crit); };
    renderRows(current, crit);
  }

  function render() {
    const current = ui.currentAssessment();
    if (current) ctx.assessmentId = current.id;
    $('tab-assess').innerHTML = `<section class="card">
        <label>진단 선택<select id="assessSelect">${ui.assessmentOptions(ctx.assessmentId)}</select></label>
        <details id="newAssessPanel" ${store.state.assessments.length ? '' : 'open'}><summary>새 진단 만들기</summary>${newFormHtml()}</details>
        ${current ? `<details id="carryPanel"><summary>새 기준판으로 이어서 진단</summary>${carryFormHtml(current)}</details>` : ''}
      </section>${current ? detailHtml(current) : guideHtml()}`;
    bind(current);
  }

  ui.views.assess = { render };
})(window.SecurityChecklist);
