// 기준판 화면: 조회·비교, 엑셀 양식 내려받기·등록, 문서(docx·hwpx) → 엑셀 양식 변환.
(function (app) {
  'use strict';

  const { RULES, ui } = app;
  const C = app.criteria;
  const { $, esc, opts, say, store, ctx } = ui;
  const view = { query: '', area: 'all', pending: null, converted: null };

  const countByArea = items => RULES.AREAS.map(a => [a, items.filter(i => i.area === a).length]).filter(([, n]) => n).map(([a, n]) => `${a} ${n}`).join(' · ');
  const sourceHtml = source => /^https?:\/\//i.test(source) ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">원문 열기</a>` : esc(source || '-');

  function diffHtml(diff, previous, open = false) {
    const list = (items, fmt) => items.length ? `<ul>${items.slice(0, 200).map(fmt).join('')}${items.length > 200 ? `<li>… 외 ${items.length - 200}개</li>` : ''}</ul>` : '';
    return `<details class="diff" ${open ? 'open' : ''}><summary>직전 등록판(${esc(C.label(previous))}) 대비: 추가 ${diff.added.length} · 변경 ${diff.changed.length} · 삭제 ${diff.removed.length} · 문구 변경 ${diff.wording.length}</summary>
      <p><strong>추가 ${diff.added.length}건</strong> ${esc(diff.added.map(i => i.id).join(', '))}</p>
      <p><strong>변경 ${diff.changed.length}건</strong> (다시 점검 필요)</p>${list(diff.changed, c => `<li>${esc(c.item.id)}: ${esc(c.fields.map(C.fieldLabel).join(', '))}</li>`)}
      <p><strong>삭제 ${diff.removed.length}건</strong> ${esc(diff.removed.map(i => i.id).join(', '))}</p>
      <p><strong>문구 변경 ${diff.wording.length}건</strong> (대응 방안·원문 위치 등. 다시 점검하지 않아도 됨) ${esc(diff.wording.map(w => w.item.id).join(', '))}</p>
    </details>`;
  }

  function itemsTableHtml(c) {
    const q = view.query.trim().toLowerCase();
    const items = c.items.filter(i => (view.area === 'all' || i.area === view.area) && (!q || [i.id, i.category, i.name, i.target].join(' ').toLowerCase().includes(q)));
    return items.map(i => {
      const detail = [['점검 내용', i.content], ['판단 기준', i.criteria], ['대응 방안', i.remediation], ['조치 시 영향', i.impact], ['비고', i.note]].filter(([, v]) => v);
      return `<tr><td>${esc(i.id)}</td><td>${esc(i.area)}</td><td>${esc(i.target)}</td><td>${esc(i.category)}</td><td>${esc(i.name)}${detail.length ? `<details class="criteria"><summary>내용</summary>${detail.map(([k, v]) => `<p><strong>${k}</strong><br>${ui.multiline(v)}</p>`).join('')}</details>` : ''}</td><td>${esc(i.level)}</td><td>${esc(i.ref)}</td></tr>`;
    }).join('') || '<tr><td colspan="7">검색 결과가 없습니다.</td></tr>';
  }

  function previewHtml(p) {
    const latest = C.latestOf(store.state.criteria, p.meta.family);
    const duplicate = p.errors.length ? '' : C.duplicateError(store.state.criteria, p.meta);
    const errors = duplicate ? [...p.errors, duplicate] : p.errors;
    const fake = { ...p.meta, year: Number(p.meta.year), items: p.items };
    return `<div class="preview" id="registerPreview">
      <h3>등록 전 확인: ${esc(p.fileName)}</h3>
      <p>${esc(p.meta.family || '(계열 없음)')} · ${esc(p.meta.year || '-')} · ${esc(p.meta.version || '-')} · ${esc(C.scoringLabel(p.meta.scoring) || '배점 방식 없음')} · 항목 ${p.items.length}개 (${esc(countByArea(p.items))})</p>
      ${errors.length ? `<div class="errors"><strong>고칠 내용 ${errors.length}건</strong><ul>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${p.warnings.length ? `<div class="warnings"><strong>참고</strong><ul>${p.warnings.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${!errors.length && latest ? diffHtml(C.diffCriteria(latest, fake), latest, true) : ''}
      ${!errors.length && !latest ? '<p class="muted">같은 계열의 기준판이 없어 새 계열로 등록됩니다.</p>' : ''}
      <button type="button" class="primary" id="confirmRegister" ${errors.length ? 'disabled' : ''}>이 내용으로 등록</button> <button type="button" id="cancelRegister">취소</button>
    </div>`;
  }

  function convertedHtml(r) {
    const groups = {};
    for (const i of r.items) { const k = i.area + (i.target ? ' / ' + i.target : ''); groups[k] = (groups[k] || 0) + 1; }
    return `<div class="preview" id="convertResult">
      <h3>변환 결과: ${esc(r.fileName)}</h3>
      <p>추정한 기준정보: ${esc(r.meta.family)} · ${esc(r.meta.year || '연도 미확인')} · ${esc(r.meta.version || '버전 미확인')} · ${esc(C.scoringLabel(r.meta.scoring))} · 항목 ${r.items.length}개</p>
      <p class="muted">${Object.entries(groups).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</p>
      ${r.warnings.length ? `<div class="warnings"><strong>확인할 내용</strong><ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <div class="scroll"><table><thead><tr><th>항목ID</th><th>영역</th><th>대상 유형</th><th>항목명</th><th>등급</th><th>판단 기준</th></tr></thead><tbody>${r.items.slice(0, 15).map(i => `<tr><td>${esc(i.id)}</td><td>${esc(i.area)}</td><td>${esc(i.target)}</td><td>${esc(i.name)}</td><td>${esc(i.level)}</td><td>${esc((i.criteria || '').slice(0, 80))}</td></tr>`).join('')}</tbody></table></div>
      ${r.items.length > 15 ? `<p class="muted">처음 15개만 보입니다. 전체는 엑셀에서 확인하세요.</p>` : ''}
      <button type="button" class="primary" id="downloadConverted" ${r.items.length ? '' : 'disabled'}>엑셀 양식으로 내려받기</button>
      <p class="muted">내려받은 파일에서 기준정보(연도·버전·출처)와 위 확인할 내용을 고친 뒤, 위의 [엑셀 양식으로 등록]으로 등록하세요.</p>
    </div>`;
  }

  function render() {
    const list = store.state.criteria;
    if (!list.some(c => c.id === ctx.criteriaId)) ctx.criteriaId = list.at(-1).id;
    const c = ui.criteriaOf(ctx.criteriaId);
    const previous = C.previousOf(list, c);
    const used = store.state.assessments.filter(a => a.criteriaId === c.id).length;
    $('tab-criteria').innerHTML = `<section class="card">
        <h2>기준판</h2>
        <label>조회할 기준판<select id="criteriaSelect">${opts(list.slice().reverse().map(x => [x.id, C.label(x)]), c.id)}</select></label>
        <p>${esc(C.scoringLabel(c.scoring))} · 항목 ${c.items.length}개 (${esc(countByArea(c.items))}) · 시행·게시 ${esc(c.date || '-')} · 출처 ${sourceHtml(c.source)} · 이 판을 쓰는 진단 ${used}건</p>
        ${previous ? diffHtml(C.diffCriteria(previous, c), previous) : '<p class="muted">같은 계열의 이전 등록판이 없습니다.</p>'}
        <div class="actions"><button type="button" id="exportCriteria">이 기준판을 엑셀 양식으로 내려받기</button>${!used && list.length > 1 ? '<button type="button" class="danger" id="deleteCriteria">기준판 삭제</button>' : ''}</div>
        <div class="toolbar">
          <label>영역<select id="criteriaArea">${opts([['all', '전체'], ...RULES.AREAS.map(a => [a, a])], view.area)}</select></label>
          <label class="grow">항목 검색<input id="criteriaQuery" type="search" value="${esc(view.query)}" placeholder="항목ID, 분류, 항목명, 대상 유형"></label>
        </div>
        <div class="scroll tall"><table><thead><tr><th>항목ID</th><th>영역</th><th>대상 유형</th><th>분류</th><th>항목명</th><th>등급</th><th>원문 위치</th></tr></thead><tbody id="criteriaItems">${itemsTableHtml(c)}</tbody></table></div>
      </section>
      <section class="card">
        <h2>새 기준판 등록</h2>
        <ol class="steps"><li>빈 양식이나 기존 판을 엑셀로 내려받습니다.</li><li>엑셀에서 기준정보와 점검항목을 채웁니다. 작성 방법은 양식의 [작성 안내] 시트에 있습니다.</li><li>아래에서 파일을 고르면 직전 판과의 비교를 보여 준 뒤 등록합니다.</li></ol>
        <div class="actions"><button type="button" id="blankTemplate">빈 엑셀 양식 내려받기</button></div>
        <label>엑셀 양식으로 등록<input type="file" id="templateFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        ${view.pending ? previewHtml(view.pending) : ''}
      </section>
      <section class="card">
        <h2>문서를 엑셀 양식으로 변환</h2>
        <p>점검 기준 문서(Word docx, 한글 hwpx)의 표를 읽어 엑셀 양식 초안을 만듭니다. 문서 모양에 따라 빠지거나 잘못 읽힌 내용이 있을 수 있으므로, 엑셀에서 검토한 뒤 등록합니다. 한글 hwp는 hwpx로, PDF는 Word로 저장해서 넣으세요.</p>
        <label>문서 고르기<input type="file" id="documentFile" accept=".docx,.hwpx"></label>
        ${view.converted ? convertedHtml(view.converted) : ''}
      </section>`;
    bind(c, used);
  }

  function bind(c, used) {
    $('criteriaSelect').onchange = e => { ctx.criteriaId = e.target.value; render(); };
    $('criteriaArea').onchange = e => { view.area = e.target.value; $('criteriaItems').innerHTML = itemsTableHtml(c); };
    $('criteriaQuery').oninput = e => { view.query = e.target.value; $('criteriaItems').innerHTML = itemsTableHtml(c); };
    $('exportCriteria').onclick = () => { ui.download(C.templateWorkbook({ meta: c, items: c.items }), ui.safeFileName(`기준판_${C.label(c)}`) + '.xlsx'); say('기준판을 엑셀 양식으로 내려받았습니다.'); };
    $('blankTemplate').onclick = () => { ui.download(C.templateWorkbook({ meta: { scoring: 'risk5' }, items: [] }), '기준판_양식.xlsx'); say('빈 엑셀 양식을 내려받았습니다.'); };
    const del = $('deleteCriteria');
    if (del) del.onclick = () => {
      if (used || !confirm(`'${C.label(c)}' 기준판을 삭제할까요?`)) return;
      if (store.commit(next => { next.criteria = next.criteria.filter(x => x.id !== c.id); }, '기준판을 삭제했습니다.')) { ctx.criteriaId = store.state.criteria.at(-1).id; render(); }
    };

    $('templateFile').onchange = async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      try {
        const parsed = C.parseTemplate(await app.xlsx.readWorkbook(await file.arrayBuffer()));
        view.pending = { ...parsed, fileName: file.name };
        render();
        say(parsed.errors.length ? '양식에 고칠 내용이 있습니다. 아래 목록을 확인하세요.' : '등록 전 확인 내용을 보여 드립니다.');
      } catch (err) { view.pending = null; render(); say('엑셀 양식을 읽지 못했습니다: ' + err.message); }
    };
    const confirmBtn = $('confirmRegister');
    if (confirmBtn) confirmBtn.onclick = () => {
      const p = view.pending;
      const error = C.duplicateError(store.state.criteria, p.meta);
      if (p.errors.length || error) { say(error || '양식의 오류를 먼저 고치세요.'); return; }
      const created = C.buildCriteria(p.meta, p.items, ui.uid(), new Date().toISOString());
      if (store.commit(next => next.criteria.push(created), '새 기준판을 등록했습니다.')) { view.pending = null; ctx.criteriaId = created.id; render(); }
    };
    const cancel = $('cancelRegister');
    if (cancel) cancel.onclick = () => { view.pending = null; render(); say('등록을 취소했습니다.'); };

    $('documentFile').onchange = async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      say('문서를 읽는 중입니다…');
      try {
        view.converted = { ...(await app.documents.convertDocument(file)), fileName: file.name };
        render();
        say(`문서에서 항목 ${view.converted.items.length}개를 읽었습니다. 엑셀로 내려받아 검토하세요.`);
      } catch (err) { view.converted = null; render(); say('문서를 변환하지 못했습니다: ' + err.message); }
    };
    const dl = $('downloadConverted');
    if (dl) dl.onclick = () => {
      const r = view.converted;
      ui.download(C.templateWorkbook({ meta: r.meta, items: r.items }), ui.safeFileName('변환_' + r.fileName.replace(/\.[^.]+$/, '')) + '.xlsx');
      say('변환 결과를 엑셀 양식으로 내려받았습니다. 검토한 뒤 [엑셀 양식으로 등록]으로 등록하세요.');
    };
  }

  ui.views.criteria = { render };
})(window.SecurityChecklist);
