// 저장·백업: 브라우저 로컬 저장소 읽기/쓰기와 JSON 백업 직렬화.
(function (app) {
  'use strict';

  // 단일 파일 버전과 같은 키를 써서 같은 위치에서 열면 기존 기록이 이어집니다.
  const KEY = 'incident-checklist-ko-v1';
  // 형식을 올리거나 읽기에 실패했을 때 원래 내용을 남겨 두는 키.
  const KEY_BEFORE_UPGRADE = KEY + '.before-schema-' + app.schema.CURRENT_SCHEMA;
  const KEY_UNREADABLE = KEY + '.unreadable';
  const UNREADABLE = '로컬 저장을 읽을 수 없습니다. 백업 파일이 있으면 복원하세요.';

  const fresh = () => ({ schema: app.schema.CURRENT_SCHEMA, guides: [structuredClone(app.INITIAL_GUIDE)], cases: [] });

  function keep(key, raw) {
    try { localStorage.setItem(key, raw); } catch { /* 보존 실패는 무시하고 계속 진행 */ }
  }

  // { state, message } 를 돌려줍니다. message 는 사용자에게 보여 줄 안내(없으면 빈 문자열).
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { return { state: fresh(), message: UNREADABLE }; }
    if (raw === null) return { state: fresh(), message: '' };
    try {
      const stored = JSON.parse(raw);
      if (stored === null) return { state: fresh(), message: '' };
      const state = app.schema.upgrade(stored);
      if (stored.schema !== state.schema) {
        keep(KEY_BEFORE_UPGRADE, raw);
        keep(KEY, JSON.stringify(state));
      }
      return { state, message: '' };
    } catch {
      keep(KEY_UNREADABLE, raw);
      return { state: fresh(), message: UNREADABLE };
    }
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  }

  const toBackupJson = state => JSON.stringify(state, null, 2);

  // schema 1·2 백업 모두 받습니다. 유효하지 않으면 예외.
  const fromBackupJson = text => app.schema.upgrade(JSON.parse(text));

  app.storage = { KEY, fresh, load, save, toBackupJson, fromBackupJson };
})(window.SecurityChecklist = window.SecurityChecklist || {});
