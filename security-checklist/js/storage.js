// 저장·백업: 브라우저 로컬 저장소와 JSON 백업 파일.
(function (app) {
  'use strict';

  const KEY = 'security-assessment-ko-v1';
  const LEGACY_KEY = 'incident-checklist-ko-v1'; // 이전 '보안 이슈 대응 점검표'. 읽기만 하고 지우지 않습니다.
  const KEY_UNREADABLE = KEY + '.unreadable';
  const UNREADABLE = '로컬 저장을 읽을 수 없습니다. 백업 파일이 있으면 [백업·설정]에서 복원하세요.';

  function keep(key, raw) {
    try { localStorage.setItem(key, raw); } catch { /* 보존 실패는 무시 */ }
  }

  // { state, message }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { return { state: app.schema.fresh(), message: UNREADABLE }; }
    if (raw === null) return { state: app.schema.fresh(), message: '' };
    try {
      const state = JSON.parse(raw);
      if (!app.schema.isValid(state)) throw new Error('invalid');
      return { state, message: '' };
    } catch {
      keep(KEY_UNREADABLE, raw);
      return { state: app.schema.fresh(), message: UNREADABLE };
    }
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  }

  // 이전 점검표 기록(같은 브라우저·같은 위치에서 쓰던 것)
  function readLegacy() {
    try {
      const x = JSON.parse(localStorage.getItem(LEGACY_KEY));
      return app.schema.isLegacy(x) ? x : null;
    } catch { return null; }
  }

  const toBackupJson = state => JSON.stringify(state, null, 2);

  // → { kind: 'state', state } | { kind: 'legacy', legacy } . 형식이 맞지 않으면 예외.
  function parseBackup(text) {
    const x = JSON.parse(text);
    if (app.schema.isValid(x)) return { kind: 'state', state: x };
    if (app.schema.isLegacy(x)) return { kind: 'legacy', legacy: x };
    throw new Error('invalid backup');
  }

  app.storage = { KEY, LEGACY_KEY, load, save, readLegacy, toBackupJson, parseBackup };
})(window.SecurityChecklist = window.SecurityChecklist || {});
