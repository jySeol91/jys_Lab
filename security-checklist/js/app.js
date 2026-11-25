// 화면 렌더링과 이벤트 처리. 판단은 logic, 저장은 storage 에 맡깁니다.
(function (app) {
  'use strict';

  const { STEPS, PATCH_STEP_ID, logic, storage } = app;
  const $ = id => document.getElementById(id);
  const say = text => { $('message').textContent = text; };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const opts = (rows, chosen) => rows.map(([id, label]) => `<option value="${esc(id)}" ${id === chosen ? 'selected' : ''}>${esc(label)}</option>`).join('');

  // ── 상태 ─────────────────────────────────────────────────
  const loaded = storage.load();
  let state = loaded.state;
  let active = state.cases[0]?.id;        // 보고 있는 사고
  let selected = state.guides.at(-1).id;  // 조회 중인 기준판
  say(loaded.message);

  function persist(next, msg) {
    if (!storage.save(next)) { say('저장하지 못했습니다. 여유 공간이나 브라우저 저장 설정을 확인하세요.'); return false; }
    state = next; say(msg); return true;
  }
  function commit(update, msg) { const next = structuredClone(state); update(next); return persist(next, msg); }

  const activeCase = () => state.cases.find(c => c.id === active);
  const summaryOf = c => logic.caseSummary(c, STEPS, PATCH_STEP_ID);
  const deadlineText = sum => '패치 이력 ' + sum.text + ' · ' + logic.formatKst(sum.due);

  // ── 사고 대응 화면 ───────────────────────────────────────
  function stepRow(c, step) {
    const row = logic.resultFor(c, step.id), t = esc(step.title), id = esc(step.id);
    return `<tr><td><strong>${t}</strong><br><small>${esc(step.detail)}</small></td>`
      + `<td><select aria-label="${t} 상태" name="status:${id}">${opts(logic.STATUSES.map(x => [x, x]), row.status)}</select></td>`
      + `<td><input aria-label="${t} 결과" name="note:${id}" value="${esc(row.note)}"></td>`
      + `<td><input aria-label="${t} 증적" name="evidence:${id}" value="${esc(row.evidence)}" placeholder="${esc(step.hint)}"></td>`
      + `<td><input aria-label="${t} 일시" type="datetime-local" name="doneAt:${id}" value="${esc(row.doneAt)}"></td></tr>`;
  }

  function renderCase() {
    const c = activeCase();
    $('caseSelect').innerHTML = state.cases.length ? opts(state.cases.map(c => [c.id, c.title]), active) : '<option>등록된 사고가 없습니다</option>';
    if (!c) { $('caseDetail').innerHTML = ''; return; }
    const g = state.guides.find(g => g.id === c.guide), sum = summaryOf(c);
    $('caseDetail').innerHTML = `<div class="pills"><span class="pill">${esc(c.kind)} · ${esc(c.service)}</span><span class="pill">${sum.complete}/${STEPS.length} 항목 처리</span><span id="deadline" class="pill ${sum.late ? 'bad' : ''}">${deadlineText(sum)}</span></div><p class="muted">적용 기준판 ${esc(logic.guideLabel(g))}</p>
 <form id="caseForm"><div class="grid"><label>관련 기준 항목<select name="links" multiple size="5">${g.items.map(i => `<option value="${esc(i[0])}" ${c.links.includes(i[0]) ? 'selected' : ''}>${esc(i[0] + ' · ' + i[2])}</option>`).join('')}</select><small>여러 항목은 Ctrl 또는 ⌘ 키로 선택합니다.</small></label><label>침해지표 및 확인 결과<textarea name="indicators" placeholder="관측 시각(KST), 로그 출처, 지표 유형(IP·도메인·해시·이상 이벤트), 값, 확인 결과, 증적 참조">${esc(c.indicators)}</textarea></label></div>
 <p class="muted">완료 처리에는 결과, 증적 참조, 확인 일시가 필요합니다. 해당 없음에는 사유를 기록합니다.</p>
 <div class="scroll"><table><thead><tr><th>점검 항목</th><th>상태</th><th>결과 또는 해당 없음 사유</th><th>증적 참조</th><th>확인 일시 (KST)</th></tr></thead><tbody>${STEPS.map(step => stepRow(c, step)).join('')}</tbody></table></div><button class="primary">대응 기록 저장</button></form>`;
    $('caseForm').onsubmit = saveCase;
  }

  function saveCase(e) {
    e.preventDefault();
    const c = activeCase(), f = new FormData(e.target);
    const entered = Object.fromEntries(STEPS.map(step => [step.id, {
      status: f.get('status:' + step.id), note: f.get('note:' + step.id),
      evidence: f.get('evidence:' + step.id), doneAt: f.get('doneAt:' + step.id)
    }]));
    const error = logic.resultsError(c, entered, STEPS);
    if (error) { say(error); return; }
    const saved = commit(next => {
      const item = next.cases.find(item => item.id === active);
      // 화면에 없는 단계의 기존 결과는 그대로 둡니다.
      Object.assign(item, { results: { ...item.results, ...entered }, links: f.getAll('links'), indicators: f.get('indicators') });
    }, '대응 기록을 저장했습니다.');
    if (saved) renderCase();
  }

  function refreshDeadline() {
    const c = activeCase(), el = $('deadline');
    if (!c || !el) return;
    const sum = summaryOf(c);
    el.textContent = deadlineText(sum);
    el.classList.toggle('bad', sum.late);
  }

  // ── 연도별 기준 화면 ─────────────────────────────────────
  function guideDiffHtml(g) {
    const previous = logic.previousGuide(state.guides, g);
    if (!previous) return '';
    return `<details><summary>직전 등록판 대비 변경 (${esc(previous.version)})</summary>${logic.diffGuides(previous, g).map(([name, items]) => `<p><strong>${name} ${items.length}건</strong> ${esc(items.map(i => i[0]).join(', '))}</p>`).join('')}</details>`;
  }

  function renderGuides() {
    const options = state.guides.map(g => [g.id, logic.guideLabel(g)]).reverse();
    $('newGuide').innerHTML = opts(options, selected);
    $('guideSelect').innerHTML = opts(options, selected);
    const g = state.guides.find(g => g.id === selected);
    const link = /^https?:\/\//i.test(g.source) ? `<a href="${esc(g.source)}" target="_blank" rel="noopener noreferrer">원문 열기</a>` : esc(g.source);
    $('guideDetail').innerHTML = `<p>${esc(g.date)} · ${g.items.length}개 항목 · ${link}</p>${guideDiffHtml(g)}
 <label>항목 검색<input id="itemSearch" type="search" placeholder="항목 코드, 분류 또는 이름"></label><div class="scroll"><table><thead><tr><th>항목 ID</th><th>분류</th><th>항목명</th><th>위험도</th><th>원문 위치</th></tr></thead><tbody id="items"></tbody></table></div>
 <details><summary>주요정보통신기반시설 공식 출처</summary><p><a href="https://www.krcert.or.kr/kr/bbs/view.do?bbsId=B0000127&amp;menuNo=205021&amp;nttId=71928" target="_blank" rel="noopener noreferrer">KISA 기술적 취약점 분석·평가 방법 상세가이드</a></p><p><a href="https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000270336" target="_blank" rel="noopener noreferrer">국가법령정보센터 취약점 분석·평가 기준</a></p></details>`;
    const draw = () => {
      const query = $('itemSearch').value.trim().toLowerCase();
      $('items').innerHTML = g.items.filter(i => i.join(' ').toLowerCase().includes(query)).map(i => '<tr>' + i.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') || '<tr><td colspan="5">검색 결과가 없습니다.</td></tr>';
    };
    $('itemSearch').oninput = draw; draw();
  }

  // ── 이벤트 ───────────────────────────────────────────────
  function show(tab) {
    for (const b of document.querySelectorAll('[data-tab]')) {
      const current = b.dataset.tab === tab;
      b.setAttribute('aria-selected', current); $(b.dataset.tab).hidden = !current;
    }
  }
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => show(b.dataset.tab);

  $('newCase').elements.received.value = logic.isoKst();
  $('caseSelect').onchange = e => { active = e.target.value; renderCase(); };
  $('guideSelect').onchange = e => { selected = e.target.value; renderGuides(); };

  $('newCase').onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const error = logic.newCaseError(data);
    if (error) { say(error); return; }
    const c = logic.buildCase(data, crypto.randomUUID(), STEPS);
    if (commit(next => next.cases.unshift(c), '사고를 등록했습니다.')) { active = c.id; e.target.elements.title.value = ''; renderCase(); }
  };

  $('copyItems').onclick = () => {
    const g = state.guides.find(g => g.id === selected), form = $('newRevision');
    form.elements.family.value = g.family; form.elements.items.value = logic.formatItems(g.items);
  };

  $('newRevision').onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const items = logic.parseItems(data.items);
    const error = logic.revisionError(state.guides, data, items);
    if (error) { say(error); return; }
    const g = logic.buildGuide(data, items, crypto.randomUUID());
    if (commit(next => next.guides.push(g), '새 기준판을 등록했습니다.')) { selected = g.id; e.target.reset(); renderGuides(); }
  };

  $('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([storage.toBackupJson(state)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'security-checklist-' + logic.isoKst().slice(0, 10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('import').onclick = () => $('file').click();
  $('file').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    let next;
    try { next = storage.fromBackupJson(await file.text()); } catch { say('이 도구의 유효한 JSON 백업 파일을 선택하세요.'); return; }
    if (!confirm('복원하면 현재 브라우저의 기록이 백업 내용으로 교체됩니다. 계속할까요?')) return;
    if (persist(next, '백업을 복원했습니다.')) { active = next.cases[0]?.id; selected = next.guides.at(-1).id; renderGuides(); renderCase(); }
  };

  renderGuides(); renderCase();
  setInterval(refreshDeadline, 30000);
})(window.SecurityChecklist);
