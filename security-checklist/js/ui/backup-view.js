// 백업·설정 화면: JSON 백업·복원, 이전 점검표 기준판 가져오기, 조치 기한 기본값.
(function (app) {
  'use strict';

  const { RULES, ui, dates } = app;
  const { $, esc, say, store, ctx } = ui;

  // 이전 점검표(사고 대응)의 기준판을 현재 기준판 목록에 더합니다. 사고 기록은 가져오지 않습니다.
  function importLegacy(legacy) {
    const { converted, skipped, cases } = app.schema.legacyCriteria(legacy);
    const exists = c => store.state.criteria.some(x => x.id === c.id || (x.family === c.family && x.year === c.year && x.version === c.version));
    const fresh = converted.filter(c => !exists(c));
    const notes = [];
    if (fresh.length && !store.commit(next => next.criteria.push(...fresh))) return;
    notes.push(fresh.length ? `기준판 ${fresh.length}개를 가져왔습니다.` : '새로 가져올 기준판이 없습니다(이미 있음).');
    if (skipped.length) notes.push(`위험도가 1~5가 아닌 항목이 있어 건너뛴 기준판: ${skipped.join(', ')}`);
    if (cases) notes.push(`사고 대응 기록 ${cases}건은 이 도구가 다루지 않아 가져오지 않았습니다. 이전 기록은 원래 위치에 그대로 있습니다.`);
    say(notes.join(' '));
    render();
  }

  function render() {
    const legacy = app.storage.readLegacy();
    const days = store.state.settings.dueDays;
    $('tab-backup').innerHTML = `<section class="card">
        <h2>백업과 복원</h2>
        <p>기록은 이 브라우저의 로컬 저장소에만 있습니다. 브라우저 데이터를 지우거나 다른 PC·브라우저로 옮길 때 JSON 백업을 씁니다. 파일을 직접 여는 방식과 로컬 서버 방식도 서로 다른 저장 공간이므로 JSON 백업으로 옮깁니다.</p>
        <div class="actions"><button type="button" class="primary" id="exportBackup">JSON 백업 내려받기</button><button type="button" id="importBackup">JSON에서 복원</button><input id="backupFile" type="file" accept=".json,application/json" hidden></div>
        <p class="muted">복원하면 지금 기록이 백업 내용으로 모두 바뀝니다. 이전 '보안 이슈 대응 점검표'의 백업 파일을 고르면 기준판만 가져옵니다.</p>
      </section>
      ${legacy ? `<section class="card" id="legacyPanel"><h2>이전 점검표 기록</h2>
        <p>이 브라우저에 이전 '보안 이슈 대응 점검표' 기록이 있습니다: 기준판 ${legacy.guides.length}개, 사고 ${legacy.cases.length}건.</p>
        <p class="muted">기준판은 이 도구로 가져올 수 있습니다. 사고 대응 기록은 가져오지 않으며, 이전 기록은 지우지 않고 그대로 둡니다.</p>
        <button type="button" id="importLegacy">기준판 가져오기</button></section>` : ''}
      <section class="card">
        <h2>조치 기한 기본값</h2>
        <p class="muted">취약 항목의 조치 기한 기본값(진단 종료일부터의 일수)입니다. 고시에 일수가 없어 정한 값이므로 사내 기준에 맞게 바꿉니다. 이미 저장한 조치 기한은 바뀌지 않습니다.</p>
        <form id="settingsForm" class="grid">
          ${RULES.PRIORITY_ORDER.map(p => `<label>${p} 개선 (일)<input type="number" name="${p}" min="0" max="3650" required value="${esc(days[p])}"></label>`).join('')}
          <div><button class="primary">기본값 저장</button></div>
        </form>
      </section>`;

    $('exportBackup').onclick = () => {
      ui.download(new Blob([app.storage.toBackupJson(store.state)], { type: 'application/json' }), `security-assessment-${dates.todayKst()}.json`);
      say('JSON 백업을 내려받았습니다.');
    };
    $('importBackup').onclick = () => $('backupFile').click();
    $('backupFile').onchange = async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      let parsed;
      try { parsed = app.storage.parseBackup(await file.text()); } catch { say('이 도구의 JSON 백업 파일이 아닙니다.'); return; }
      if (parsed.kind === 'legacy') { importLegacy(parsed.legacy); return; }
      if (!confirm('복원하면 지금 브라우저의 기록이 백업 내용으로 모두 바뀝니다. 계속할까요?')) return;
      if (store.replace(parsed.state, '백업을 복원했습니다.')) {
        ctx.assessmentId = parsed.state.assessments[0]?.id || '';
        ctx.criteriaId = parsed.state.criteria.at(-1).id;
        render();
      }
    };
    const legacyButton = $('importLegacy');
    if (legacyButton) legacyButton.onclick = () => importLegacy(app.storage.readLegacy());
    $('settingsForm').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const values = Object.fromEntries(RULES.PRIORITY_ORDER.map(p => [p, Number(f.get(p))]));
      if (Object.values(values).some(v => !Number.isInteger(v) || v < 0 || v > 3650)) { say('일수는 0~3650 사이의 정수로 입력하세요.'); return; }
      store.commit(next => { next.settings.dueDays = values; }, '조치 기한 기본값을 저장했습니다.');
    };
  }

  ui.views.backup = { render };
})(window.SecurityChecklist);
