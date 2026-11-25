// 대응 단계 정의.
// - 배열 순서가 화면 표시 순서입니다. 순서를 바꾸거나 단계를 추가해도 됩니다.
// - id 는 저장된 대응 결과가 연결되는 고정 키입니다. 한 번 배포한 id 는 바꾸지 마세요.
(function (app) {
  'use strict';

  app.STEPS = [
    { id: 'intake', title: '접수·분류', detail: '관련 자산, 인지 경위, 심각도, 담당자를 기록', hint: '접수 티켓' },
    { id: 'patch-history', title: '패치 이력 확인', detail: '공지와 현재 버전을 대조하고 적용·미적용·패치 미제공 여부를 기록', hint: '벤더 공지와 현재 버전' },
    { id: 'service-impact', title: '서비스 영향도 확인', detail: '영향 서비스와 의존성, 고객·거래 영향, 중단 가능 시간을 기록', hint: '영향도 검토 문서' },
    { id: 'evidence-preservation', title: '증적 보존·침해 흔적 확인', detail: '관련 시간대의 로그를 보존하고 관측 신호, 확인 결과 및 범위를 기록', hint: '보존 위치와 관측 시간' },
    { id: 'initial-response', title: '초동 대응·신고 검토', detail: '격리나 접근 제한 필요성을 판단하고, 신고·통지 대상과 기한 및 처리 결과를 기록', hint: '대응 또는 보고 기록' },
    { id: 'change-preparation', title: '변경·복구 준비', detail: '백업, 복구 절차, 변경 승인 및 작업 창을 확인', hint: '변경 승인 번호' },
    { id: 'test-verification', title: '테스트 서버 검증', detail: '패치 후 로그인·핵심 거래·연동·모니터링의 정상 동작과 보안 설정을 확인', hint: '테스트 결과와 배포 버전' },
    { id: 'production-rollout', title: '운영 반영', detail: '승인 범위와 적용 버전, 작업 시간 및 실패 시 복구 결과를 확인', hint: '배포 또는 대체조치 기록' },
    { id: 'closure', title: '운영 검증·종결', detail: '핵심 서비스, 오류율 및 이상 징후를 확인하고 잔여 위험과 승인자를 기록', hint: '모니터링 결과와 종료 승인' }
  ];

  // 패치 확인 기한(기본 72시간)을 판정하는 단계.
  app.PATCH_STEP_ID = 'patch-history';
})(window.SecurityChecklist = window.SecurityChecklist || {});
