// 평가기준 상수. 계산·판정·기한 규칙은 모두 이 파일의 값을 따릅니다.
// 근거와 해석은 docs/evaluation-criteria.md 에 정리했습니다. 고시·규정이 바뀌면 두 곳을 함께 고칩니다.
(function (app) {
  'use strict';

  const freezeDeep = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value); }
    return value;
  };

  app.RULES = freezeDeep({
    // 과학기술정보통신부 고시 「주요정보통신기반시설 취약점 분석·평가 기준」
    // (제2025-62호, 2025. 12. 24. 시행) [붙임4] 취약점 분석·평가 점수 산출식 예시
    SCORE_SOURCE: '과학기술정보통신부 고시 제2025-62호 [붙임4] 취약점 분석·평가 점수 산출식 예시',

    AREAS: ['관리적', '물리적', '기술적'],

    // 항목 배점. grade3 은 [붙임4] 원문, risk5 는 이 도구의 적용안(위험도 × 2, 원문 간격과 동일).
    SCORING_TYPES: {
      grade3: { label: '중요도 상·중·하', levels: ['상', '중', '하'], points: { 상: 10, 중: 8, 하: 6 } },
      risk5: { label: '위험도 5~1', levels: ['5', '4', '3', '2', '1'], points: { 5: 10, 4: 8, 3: 6, 2: 4, 1: 2 } }
    },

    // 진단 결과값: 배점에 곱하는 비율. [붙임4] ○ 취약점 발견 = 전부, P 일부 취약점만 제거 = 절반, × 취약점 제거 = 0.
    // 해당 없음과 미점검은 [붙임4]에 규정이 없어 계산에서 제외합니다(이 도구의 적용안).
    VERDICTS: [
      { code: '', label: '미점검', mark: '', factor: null },
      { code: 'pass', label: '양호', mark: '×', factor: 0 },
      { code: 'fail', label: '취약', mark: '○', factor: 1 },
      { code: 'partial', label: '부분 조치', mark: 'P', factor: 0.5 },
      { code: 'na', label: '해당 없음', mark: 'N/A', factor: null }
    ],

    // 망분리 비율. 인터넷 연결이 반드시 필요한 시설은 비율을 적용하지 않습니다([붙임4] 단서).
    NETWORK: [
      { code: 'exempt', label: '미적용 (인터넷 연결 필수 시설)', ratio: 1 },
      { code: 'physical', label: '물리적 분리', ratio: 1 },
      { code: 'logical', label: '논리적 분리', ratio: 0.95 },
      { code: 'none', label: '미분리', ratio: 0.9 }
    ],

    // 개선 구분. 고시 본문: 위험등급 "상"은 조기, "중"·"하"는 중기 또는 장기.
    // 중→중기, 하→장기와 위험도 5~1의 구분은 이 도구의 적용안입니다.
    PRIORITY: {
      grade3: { 상: '조기', 중: '중기', 하: '장기' },
      risk5: { 5: '조기', 4: '조기', 3: '중기', 2: '장기', 1: '장기' }
    },
    PRIORITY_ORDER: ['조기', '중기', '장기'],

    // 개선 구분별 기본 조치 기한(진단 종료일부터의 일수). 고시에 일수가 없어 사내 기준으로 바꿔 쓰는 기본값입니다.
    DEFAULT_DUE_DAYS: { 조기: 30, 중기: 90, 장기: 180 },

    // 조치 상태. 조치불가는 전자금융감독규정 제37조의2제5항제2호에 따라 최고경영자 승인을 기록합니다.
    ACTION_STATUS: ['조치 예정', '조치 완료', '조치불가'],
    // 조치불가 사유. 고시 본문의 두 경우 + 그 밖의 사유.
    UNFIXABLE_REASONS: ['보호조치 방안이 존재하지 않음', '조치 시 서비스 운영이 불가능', '기타'],

    // 실시 주기. 전자금융감독규정 제37조의2제1항·제3항: 연 1회 이상(홈페이지는 6개월에 1회 이상).
    // 마지막 진단 종료일부터 12개월·6개월로 보수적으로 계산합니다.
    CYCLE: { months: 12, homepageMonths: 6, warnDays: 30 }
  });
})(window.SecurityChecklist = window.SecurityChecklist || {});
