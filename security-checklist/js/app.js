// 시작점: 화면 전환과 첫 렌더링.
(function (app) {
  'use strict';

  const { ui } = app;
  const { $ } = ui;
  let active = 'assess';

  function show(tab) {
    active = tab;
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    // 보이지 않는 화면은 비워 두어, 화면마다 항상 최신 상태로 다시 그립니다.
    for (const panel of document.querySelectorAll('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== tab;
      if (panel.hidden) panel.innerHTML = '';
    }
    ui.views[tab].render();
  }

  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => { ui.say(''); show(b.dataset.tab); };

  show(active);
  if (ui.store.initialMessage) ui.say(ui.store.initialMessage);
  else if (app.storage.readLegacy() && !ui.store.state.assessments.length) ui.say("이전 '보안 이슈 대응 점검표' 기록이 있습니다. [백업·설정]에서 기준판을 가져올 수 있습니다.");

  app.show = show;
  app.activeTab = () => active;
  $('message').dataset.ready = 'true';
})(window.SecurityChecklist);
