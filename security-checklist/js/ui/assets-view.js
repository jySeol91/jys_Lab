// 자산·주기 화면: 점검 대상 자산 대장과 실시 주기(연 1회, 홈페이지 6개월).
(function (app) {
  'use strict';

  const { RULES, ui } = app;
  const A = app.assessment;
  const { $, esc, say, store, badge } = ui;
  const DEFAULT_TYPES = ['웹 서비스', '모바일 앱 서버', '유닉스', '윈도우즈', '데이터베이스', '네트워크 장비', '보안 장비', 'PC'];

  function typeOptions() {
    const fromCriteria = store.state.criteria.flatMap(c => c.items.map(i => i.target)).filter(Boolean);
    return [...new Set([...fromCriteria, ...DEFAULT_TYPES])].map(t => `<option value="${esc(t)}"></option>`).join('');
  }

  function rowHtml(asset) {
    const cycle = A.cycleOf(asset, store.state.assessments);
    const used = store.state.assessments.filter(a => a.assetIds.includes(asset.id)).length;
    return `<tr data-asset="${esc(asset.id)}">
      <td><input aria-label="자산명" data-field="name" maxlength="120" value="${esc(asset.name)}"></td>
      <td><input aria-label="${esc(asset.name)} 유형" data-field="type" list="assetTypes" maxlength="60" value="${esc(asset.type)}"></td>
      <td><input type="checkbox" aria-label="${esc(asset.name)} 홈페이지" data-field="homepage" ${asset.homepage ? 'checked' : ''}></td>
      <td><input aria-label="${esc(asset.name)} 비고" data-field="note" maxlength="200" value="${esc(asset.note)}"></td>
      <td>${esc(cycle.last || '-')}</td><td>${esc(cycle.due || '-')}</td>
      <td class="cycle-state">${badge(cycle.state, ui.STATE_CLASS[cycle.state])}</td>
      <td><button type="button" class="danger" data-delete="${esc(asset.id)}" ${used ? `disabled title="진단 ${used}건에서 쓰는 자산은 삭제할 수 없습니다"` : ''}>삭제</button></td>
    </tr>`;
  }

  function render() {
    const assets = store.state.assets;
    $('tab-assets').innerHTML = `<section class="card">
        <h2>자산 대장</h2>
        <p class="muted">기술적 항목은 자산마다 판정합니다. 기준판 항목에 대상 유형이 있으면 같은 유형의 자산에만 적용되므로, 유형은 기준판의 대상 유형과 같은 이름으로 적습니다.</p>
        <form id="newAsset" class="grid">
          <label>자산명<input name="name" required maxlength="120" placeholder="예: 인터넷뱅킹 웹"></label>
          <label>유형<input name="type" list="assetTypes" maxlength="60" placeholder="예: 웹 서비스"></label>
          <label>비고<input name="note" maxlength="200" placeholder="예: 운영 URL, 담당 부서"></label>
          <label class="check inline"><input type="checkbox" name="homepage"> 홈페이지 (6개월에 1회 이상)</label>
          <div><button class="primary">자산 추가</button></div>
        </form>
        <datalist id="assetTypes">${typeOptions()}</datalist>
      </section>
      <section class="card">
        <h2>실시 주기</h2>
        <p class="muted">전자금융감독규정 제37조의2제1항·제3항: 연 1회 이상, 홈페이지는 6개월에 1회 이상. 마지막 진단 종료일부터 ${RULES.CYCLE.months}개월(홈페이지 ${RULES.CYCLE.homepageMonths}개월)을 다음 기한으로 보수적으로 계산하고, ${RULES.CYCLE.warnDays}일 이내로 남으면 미리 알립니다.</p>
        <div class="scroll"><table><thead><tr><th>자산명</th><th>유형</th><th>홈페이지</th><th>비고</th><th>마지막 진단</th><th>다음 기한</th><th>상태</th><th></th></tr></thead>
        <tbody id="assetRows">${assets.map(rowHtml).join('') || '<tr><td colspan="8">등록된 자산이 없습니다.</td></tr>'}</tbody></table></div>
      </section>`;

    $('newAsset').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get('name')).trim();
      if (!name) { say('자산명을 입력하세요.'); return; }
      if (store.state.assets.some(a => a.name === name)) { say('같은 이름의 자산이 이미 있습니다.'); return; }
      const asset = { id: ui.uid(), name, type: String(f.get('type')).trim(), homepage: f.get('homepage') === 'on', note: String(f.get('note')).trim() };
      if (store.commit(next => next.assets.push(asset), `자산 '${name}'을(를) 추가했습니다.`)) render();
    };

    const rows = $('assetRows');
    rows.addEventListener('change', e => {
      const tr = e.target.closest('tr[data-asset]'), field = e.target.dataset.field;
      if (!tr || !field) return;
      const id = tr.dataset.asset;
      const value = field === 'homepage' ? e.target.checked : e.target.value.trim();
      if (field === 'name' && (!value || store.state.assets.some(a => a.id !== id && a.name === value))) { say('자산명은 비울 수 없고 다른 자산과 겹칠 수 없습니다.'); e.target.value = store.state.assets.find(a => a.id === id).name; return; }
      if (store.commit(next => { next.assets.find(a => a.id === id)[field] = value; }, '자산 정보를 저장했습니다.')) {
        const cycle = A.cycleOf(store.state.assets.find(a => a.id === id), store.state.assessments);
        tr.cells[5].textContent = cycle.due || '-';
        tr.querySelector('.cycle-state').innerHTML = badge(cycle.state, ui.STATE_CLASS[cycle.state]);
      }
    });
    rows.addEventListener('click', e => {
      const id = e.target.dataset?.delete;
      if (!id) return;
      const asset = store.state.assets.find(a => a.id === id);
      if (!confirm(`자산 '${asset.name}'을(를) 삭제할까요?`)) return;
      if (store.commit(next => { next.assets = next.assets.filter(a => a.id !== id); }, '자산을 삭제했습니다.')) render();
    });
  }

  ui.views.assets = { render };
})(window.SecurityChecklist);
