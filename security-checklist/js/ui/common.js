// 화면 공통 도우미와 저장소(store). 각 화면(js/ui/*-view.js)이 함께 씁니다.
(function (app) {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const opts = (rows, chosen) => rows.map(([value, label]) => `<option value="${esc(value)}" ${String(value) === String(chosen) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const say = text => { $('message').textContent = text; };
  const multiline = text => esc(text).replace(/\n/g, '<br>');

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const safeFileName = text => String(text).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '파일';

  // ── 저장소 ─────────────────────────────────────────────
  const loaded = app.storage.load();
  const store = {
    state: loaded.state,
    initialMessage: loaded.message,
    // 상태를 복사해 고친 뒤 저장. 저장에 실패하면 화면 상태도 바꾸지 않습니다.
    commit(update, message) {
      const next = structuredClone(store.state);
      update(next);
      if (!app.storage.save(next)) { say('저장하지 못했습니다. 브라우저 저장 공간이나 설정을 확인하세요.'); return false; }
      store.state = next;
      if (message !== undefined) say(message);
      return true;
    },
    replace(next, message) {
      if (!app.storage.save(next)) { say('저장하지 못했습니다. 브라우저 저장 공간이나 설정을 확인하세요.'); return false; }
      store.state = next; say(message); return true;
    }
  };

  // 화면 사이에서 함께 쓰는 선택 상태
  const ctx = {
    assessmentId: store.state.assessments[0]?.id || '',
    criteriaId: store.state.criteria.at(-1)?.id || ''
  };

  const criteriaOf = id => store.state.criteria.find(c => c.id === id);
  const assessmentOf = id => store.state.assessments.find(a => a.id === id);
  const assetsById = () => new Map(store.state.assets.map(a => [a.id, a]));
  const currentAssessment = () => assessmentOf(ctx.assessmentId) || store.state.assessments[0] || null;

  const assessmentOptions = chosen => store.state.assessments.length
    ? opts(store.state.assessments.map(a => [a.id, `${a.title} (${a.start} ~ ${a.end})`]), chosen)
    : '<option value="">등록된 진단이 없습니다</option>';

  const verdictLabel = code => {
    const v = app.scoring.verdictOf(code);
    return v ? (v.mark && v.code ? `${v.label} (${v.mark})` : v.label) : '';
  };
  const levelLabel = (criteria, level) => `${level} · ${app.scoring.points(criteria.scoring, level)}점`;
  const STATE_CLASS = { '조치 완료': 'ok', '조치불가': 'warn', '기한 초과': 'bad', '계획 미수립': 'warn', '조치 예정': '', '정상': 'ok', '30일 이내 도래': 'warn', '진단 이력 없음': 'warn' };
  const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;

  app.ui = {
    $, esc, opts, say, multiline, uid, download, safeFileName, store, ctx,
    criteriaOf, assessmentOf, assetsById, currentAssessment, assessmentOptions, verdictLabel, levelLabel, STATE_CLASS, badge,
    views: {}
  };
})(window.SecurityChecklist);
