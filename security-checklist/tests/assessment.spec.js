const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const KEY = 'security-assessment-ko-v1';
const LEGACY_KEY = 'incident-checklist-ko-v1';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BUILTIN = '전자금융기반시설 · 2025 · 제2025-1호 / 첨부 대응방안 v1.0';
const REVISED = '전자금융기반시설 · 2026 · 제2026-1호';
const NOW = Date.parse('2026-03-02T00:30:00Z'); // KST 2026-03-02 09:30

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const fileSpec = (name, mimeType, buffer = fixture(name)) => ({ name, mimeType, buffer });
const pad = n => String(n).padStart(2, '0');
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const message = page => page.locator('#message');

async function open(page, now = NOW) {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('/index.html');
}
const tab = (page, name) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();

async function addAsset(page, name, type = '웹 서비스', homepage = false) {
  await tab(page, '자산·주기');
  const form = page.locator('#newAsset');
  await form.getByLabel('자산명').fill(name);
  await form.getByLabel('유형').fill(type);
  if (homepage) await form.getByLabel('홈페이지').check();
  await form.getByRole('button', { name: '자산 추가' }).click();
  await expect(message(page)).toHaveText(`자산 '${name}'을(를) 추가했습니다.`);
}

async function createAssessment(page, { title, criteria, start = '2026-03-02', end = '2026-03-02', assets = [], network }) {
  await tab(page, '진단 평가');
  const panel = page.locator('#newAssessPanel');
  if (!(await panel.evaluate(d => d.open))) await panel.locator('summary').click();
  const form = page.locator('#newAssessment');
  await form.getByLabel('진단명').fill(title);
  if (criteria) await form.getByLabel('적용 기준판').selectOption({ label: criteria });
  await form.getByLabel('시작일').fill(start);
  await form.getByLabel('종료일').fill(end);
  if (network) await form.getByLabel('망분리 구분').selectOption({ label: network });
  for (const name of assets) await form.getByRole('checkbox', { name: new RegExp('^' + name + ' ') }).check();
  await form.getByRole('button', { name: '진단 만들기' }).click();
  await expect(message(page)).toHaveText('진단을 만들었습니다.');
}

async function selectScope(page, text) {
  const value = await page.locator('#scopeSelect option', { hasText: text }).getAttribute('value');
  await page.locator('#scopeSelect').selectOption(value);
}

async function judge(page, id, verdict, finding) {
  await page.getByLabel(`${id} 판정`).selectOption(verdict);
  await expect(message(page)).toHaveText(`${id} 저장됨`);
  if (finding !== undefined) {
    await page.getByLabel(`${id} 발견 내용`).fill(finding);
    await page.getByLabel(`${id} 발견 내용`).blur();
  }
}

async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return { name: file.suggestedFilename(), buffer: fs.readFileSync(await file.path()) };
}

// 페이지 안의 엑셀 읽기·쓰기로 양식을 고칩니다(엑셀에서 고치는 것과 같음).
async function editWorkbook(page, buffer, edit) {
  const b64 = await page.evaluate(async ([input, source]) => {
    const app = window.SecurityChecklist;
    const bytes = Uint8Array.from(atob(input), c => c.charCodeAt(0));
    const wb = await app.xlsx.readWorkbook(bytes.buffer);
    new Function('wb', source)(wb);
    const out = new Uint8Array(await app.xlsx.writeWorkbook(wb.sheets).arrayBuffer());
    let s = ''; for (const b of out) s += String.fromCharCode(b);
    return btoa(s);
  }, [buffer.toString('base64'), edit]);
  return Buffer.from(b64, 'base64');
}

async function registerTemplate(page, spec) {
  await tab(page, '기준판');
  await page.locator('#templateFile').setInputFiles(spec);
  await expect(page.locator('#registerPreview')).toBeVisible();
  await page.getByRole('button', { name: '이 내용으로 등록' }).click();
  await expect(message(page)).toHaveText('새 기준판을 등록했습니다.');
}

// 기본 기준판에서 1개 추가, 1개 등급 변경, 1개 삭제, 1개 대응 방안(문구) 변경한 2026판
async function revisionBuffer(page) {
  const b64 = await page.evaluate(async () => {
    const app = window.SecurityChecklist, base = app.INITIAL_CRITERIA;
    const items = base.items.filter(i => i.id !== 'WEB-SER-052')
      .map(i => i.id === 'WEB-SER-038' ? { ...i, level: '2' } : i.id === 'WEB-SER-001' ? { ...i, remediation: '입력값 검증과 바인딩 쿼리 적용' } : i);
    items.push({ ...base.items[0], id: 'WEB-SER-060', category: '일반공통', name: 'API 인증 누락', level: '5', ref: 'p. 55' });
    const blob = app.criteria.templateWorkbook({ meta: { ...base, year: 2026, version: '제2026-1호', date: '2026-02-01', source: 'https://example.org/2026' }, items });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  return fileSpec('revision-2026.xlsx', XLSX, Buffer.from(b64, 'base64'));
}

test('[붙임4] 예제: 원문 예제의 점수를 그대로 재현한다', async ({ page }) => {
  await open(page);
  await registerTemplate(page, fileSpec('example-annex4.xlsx', XLSX));
  await expect(page.locator('#tab-criteria')).toContainText('시행·게시 2025-12-01'); // 엑셀 날짜 일련번호
  for (const n of [1, 2, 3]) await addAsset(page, `서버 ${n}`, '');
  await createAssessment(page, { title: '붙임4 예제', criteria: '예시 기준(붙임4 예제) · 2026 · 붙임4-예제', assets: ['서버 1', '서버 2', '서버 3'], network: '논리적 분리 (95%)' });

  // 관리적: 10개 중 2개 취약 → 80점 / 물리적: 5개 중 1개 취약, 1개 부분 조치 → 70점
  await selectScope(page, '기관 공통');
  for (let i = 1; i <= 10; i++) await judge(page, `M-${pad(i)}`, i <= 2 ? 'fail' : 'pass');
  for (let i = 1; i <= 5; i++) await judge(page, `P-${pad(i)}`, i === 1 ? 'fail' : i === 2 ? 'partial' : 'pass');
  // 기술적: 원문 예제의 자산별 식별 취약점
  const fails = { '서버 1': [1, 2, 9], '서버 2': [2, 5], '서버 3': [2, 3, 4, 5, 6] };
  for (const [server, list] of Object.entries(fails)) {
    await selectScope(page, server);
    for (let i = 1; i <= 10; i++) await judge(page, `T-${pad(i)}`, list.includes(i) ? 'fail' : 'pass');
  }

  await expect(page.locator('[data-area="관리적"]')).toHaveText('80.0');
  await expect(page.locator('[data-area="물리적"]')).toHaveText('70.0');
  await expect(page.locator('[data-area="기술적"]')).toHaveText('64.4');
  await expect(page.locator('#totalScore')).toHaveText('68.2');
  await expect(page.locator('#progress')).toHaveText('100%');
  await page.locator('.asset-scores summary').click();
  await expect(page.locator('.asset-scores tbody tr')).toHaveText([/서버 1\s*10\s*90\s*26\s*71\.1/, /서버 2\s*10\s*90\s*20\s*77\.8/, /서버 3\s*10\s*90\s*50\s*44\.4/]);

  await tab(page, '보고서');
  await expect(page.locator('#reportTotal')).toHaveText('68.2');
  await expect(page.locator('#report')).toContainText('합산 71.8점 × 망분리 비율 95%');
});

test('진단 만들기: 필수값을 확인하고, 기본 날짜는 PC 시간대와 관계없이 KST 오늘이다', async ({ page }) => {
  await open(page, Date.parse('2026-03-01T16:30:00Z')); // KST 3월 2일 01:30, UTC·뉴욕은 아직 3월 1일
  const form = page.locator('#newAssessment');
  await expect(form.getByLabel('시작일')).toHaveValue('2026-03-02');
  await expect(form.getByLabel('종료일')).toHaveValue('2026-03-02');
  await form.getByRole('button', { name: '진단 만들기' }).click();
  await expect(form.getByLabel('진단명')).toHaveJSProperty('validity.valueMissing', true);

  await form.getByLabel('진단명').fill('자산 없는 진단');
  await form.getByRole('button', { name: '진단 만들기' }).click();
  await expect(message(page)).toHaveText('기술적 항목을 점검할 대상 자산을 하나 이상 고르세요.');
  await form.getByLabel('종료일').fill('2026-03-01');
  await form.getByRole('button', { name: '진단 만들기' }).click();
  await expect(message(page)).toHaveText('종료일은 시작일보다 빠를 수 없습니다.');
  expect(await stored(page)).toBeNull();
});

test('판정: 점수와 진단률이 바로 바뀌고, 발견 내용이 빈 취약은 기록 누락으로 표시한다', async ({ page }) => {
  await open(page);
  await addAsset(page, '인터넷뱅킹 웹');
  await createAssessment(page, { title: '웹 진단', assets: ['인터넷뱅킹 웹'] });
  await expect(page.locator('#assessDetail')).toContainText('적용 기준판 ' + BUILTIN);
  await expect(page.locator('#totalScore')).toHaveText('산출 불가');

  await judge(page, 'WEB-SER-001', 'fail'); // 위험도 5 → 10점
  await expect(page.locator('#totalScore')).toHaveText('0.0');
  const row = page.locator('tr[data-item="WEB-SER-001"]');
  await expect(row.locator('.badges')).toHaveText('기록 누락');
  await expect(page.locator('.tile.warn')).toContainText('기록 누락1');

  await judge(page, 'WEB-FIN-001', 'pass');
  await expect(page.locator('#totalScore')).toHaveText('50.0'); // (20 − 10) ÷ 20
  await judge(page, 'WEB-SER-038', 'na', '웹 메서드 설정이 없는 정적 서버');
  await expect(page.locator('#totalScore')).toHaveText('50.0'); // 해당 없음은 계산에서 제외
  await expect(page.locator('#progress')).toHaveText('6%'); // 3 / 48칸

  await page.getByLabel('WEB-SER-001 발견 내용').fill('로그인 id 파라미터에서 SQL 삽입 확인');
  await page.getByLabel('WEB-SER-001 증적').fill('EVD-0301');
  await page.getByLabel('WEB-SER-001 증적').blur();
  await expect(row.locator('.badges')).toHaveText('');
  await judge(page, 'WEB-SER-001', 'partial');
  await expect(page.locator('#totalScore')).toHaveText('75.0'); // (20 − 5) ÷ 20

  const state = await stored(page);
  const assetId = state.assets[0].id;
  expect(state.assessments[0].results['WEB-SER-001'][assetId]).toEqual({ verdict: 'partial', finding: '로그인 id 파라미터에서 SQL 삽입 확인', evidence: 'EVD-0301' });
  expect(state.assessments[0].criteriaId).toBe('fin-2025-1');
});

test('문서 변환(hwpx): 영역·대상 유형을 읽고, 기술적 항목은 같은 유형의 자산에만 적용한다', async ({ page }) => {
  await open(page);
  await tab(page, '기준판');
  await page.locator('#documentFile').setInputFiles(fileSpec('sample-checklist.hwpx', 'application/hwp+zip'));
  const result = page.locator('#convertResult');
  await expect(result).toContainText('항목 5개');
  await expect(result).toContainText('관리적 2 · 기술적 / 유닉스 2 · 기술적 / 웹 서비스 1');
  const converted = await download(page, page.locator('#downloadConverted'));
  expect(converted.name).toBe('변환_sample-checklist.xlsx');

  // 연도·버전이 없는 초안은 등록할 수 없다
  await page.locator('#templateFile').setInputFiles(fileSpec(converted.name, XLSX, converted.buffer));
  await expect(page.locator('#registerPreview .errors')).toContainText("기준정보의 '연도'을(를) 입력하세요.");
  await expect(page.getByRole('button', { name: '이 내용으로 등록' })).toBeDisabled();
  // 엑셀에서 기준정보를 채운 것과 같게 고쳐 등록
  const fixed = await editWorkbook(page, converted.buffer, "wb.sheets[0].rows[2][1] = '2026'; wb.sheets[0].rows[3][1] = 'v1';");
  await registerTemplate(page, fileSpec('checklist.xlsx', XLSX, fixed));

  await addAsset(page, 'web01', '웹 서비스');
  await addAsset(page, 'unix01', '유닉스');
  await createAssessment(page, { title: '유형 적용', criteria: '기관 내부 기준 · 2026 · v1', assets: ['web01', 'unix01'] });
  await expect(page.locator('#scopeSelect option')).toHaveText(['기관 공통 · 관리적·물리적 (2개)', 'web01 · 웹 서비스 (기술적 1개)', 'unix01 · 유닉스 (기술적 2개)']);
  await expect(page.locator('#itemRows tr')).toHaveCount(2);
  await expect(page.locator('tr[data-item="A-1"]')).toContainText('정책');
  await expect(page.locator('tr[data-item="A-2"]')).toContainText('정책'); // 세로 병합 칸
  await selectScope(page, 'unix01');
  await expect(page.locator('#itemRows tr')).toHaveText([/U-1 root 계정 원격 접속 제한/, /U-2 비밀번호 관리정책 설정/]);
  await selectScope(page, 'web01');
  await expect(page.locator('#itemRows tr')).toHaveText([/SI SQL 인젝션/]);
});

test('문서 변환(docx): 글상자를 한 번만 읽고 항목ID 누락을 알리며, 보고서와 엑셀에 대응 방안을 넣는다', async ({ page }) => {
  await open(page);
  await tab(page, '기준판');
  await page.locator('#documentFile').setInputFiles(fileSpec('sample-guide.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  const result = page.locator('#convertResult');
  await expect(result).toContainText('기관 내부 기준 · 2026 · 제2026-1호 · 위험도 5~1 · 항목 3개');
  await expect(result.locator('.warnings')).toContainText("상세 표의 항목ID 'TST-'가 목록 표에 없어, 항목명이 같은 TST-002(관리자 페이지 노출)에 합쳤습니다.");
  await expect(result.locator('.warnings')).toContainText('그림 1개는 글자로 옮기지 못해');
  const converted = await download(page, page.locator('#downloadConverted'));
  await registerTemplate(page, fileSpec(converted.name, XLSX, converted.buffer));

  const items = (await stored(page)).criteria[1].items;
  expect(items.map(i => [i.id, i.category, i.level, i.ref])).toEqual([['TST-001', '인증', '5', 'p. 5'], ['TST-002', '인증', '4', 'p. 6'], ['TST-003', '세션', '3', 'p. 7']]);
  expect(items[0].remediation).toBe('- 5회 초과 실패 시 계정 잠금\nMaxAuthTries 5\nLockoutDuration 30');
  expect(items[0].criteria).toBe('- 5회 연속 실패 후 계정이 잠기는지 확인');
  expect(items[1].content).toBe('관리자 페이지가 외부에 노출되는지 점검');
  expect(items[1].remediation).toBe('- 관리자 페이지는 내부망에서만 접근\n[그림: 원문 참조]');

  await addAsset(page, '고객 포털');
  await createAssessment(page, { title: '포털 진단', criteria: '기관 내부 기준 · 2026 · 제2026-1호', assets: ['고객 포털'] });
  await page.locator('tr[data-item="TST-001"] details.criteria summary').click();
  await expect(page.locator('tr[data-item="TST-001"] details.criteria')).toContainText('MaxAuthTries 5');
  await judge(page, 'TST-001', 'fail', '6회째에도 잠기지 않음');
  await judge(page, 'TST-003', 'pass');

  await tab(page, '보고서');
  const report = page.locator('#report');
  await expect(report).toContainText('6회째에도 잠기지 않음');
  await expect(report).toContainText('5회 초과 실패 시 계정 잠금');
  await expect(report.locator('table.findings tbody tr')).toHaveCount(1);
  const exported = await download(page, page.getByRole('button', { name: '엑셀로 내려받기' }));
  expect(exported.name).toBe('진단결과_포털 진단_2026-03-02.xlsx');
  const sheets = await page.evaluate(async b64 => {
    const wb = await window.SecurityChecklist.xlsx.readWorkbook(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
    return wb.sheets.map(s => [s.name, s.rows.length, s.rows[1]?.[1] ?? '']);
  }, exported.buffer.toString('base64'));
  expect(sheets).toEqual([['요약', 15, '포털 진단'], ['점검결과', 4, 'TST-001'], ['이행계획', 2, 'TST-001']]);
});

test('기준판 개정: 추가·변경·삭제·문구 변경을 보여 주고, 기존 진단은 처음 고른 판을 계속 쓴다', async ({ page }) => {
  await open(page);
  await addAsset(page, '인터넷뱅킹 웹');
  await createAssessment(page, { title: '2025판 진단', assets: ['인터넷뱅킹 웹'] });

  await tab(page, '기준판');
  await page.locator('#templateFile').setInputFiles(await revisionBuffer(page));
  const preview = page.locator('#registerPreview');
  await expect(preview.locator('details.diff summary')).toHaveText(`직전 등록판(${BUILTIN}) 대비: 추가 1 · 변경 1 · 삭제 1 · 문구 변경 1`);
  await expect(preview).toContainText('WEB-SER-038: 등급');
  await page.getByRole('button', { name: '이 내용으로 등록' }).click();
  await expect(message(page)).toHaveText('새 기준판을 등록했습니다.');
  await expect(page.locator('#criteriaSelect option:checked')).toHaveText(REVISED);

  // 같은 판을 다시 등록할 수 없다
  await page.locator('#templateFile').setInputFiles(await revisionBuffer(page));
  await expect(page.locator('#registerPreview .errors')).toContainText('같은 계열·연도·버전의 기준판이 이미 있습니다.');

  await tab(page, '진단 평가');
  await expect(page.locator('#assessDetail')).toContainText('적용 기준판 ' + BUILTIN);
  await expect(page.locator('tr[data-item="WEB-SER-052"]')).toHaveCount(1);
  await expect(page.locator('#newAssessment').getByLabel('적용 기준판').locator('option:checked')).toHaveText(REVISED);
  const state = await stored(page);
  expect(state.assessments[0].criteriaId).toBe('fin-2025-1');
  expect(state.criteria.map(c => c.version)).toEqual(['제2025-1호 / 첨부 대응방안 v1.0', '제2026-1호']);
});

test('새 기준판으로 이어서 진단: 바뀌지 않은 항목만 이어받고 추가·변경 항목은 다시 점검한다', async ({ page }) => {
  await open(page);
  await addAsset(page, '인터넷뱅킹 웹');
  await createAssessment(page, { title: '2025 진단', start: '2026-02-02', end: '2026-02-27', assets: ['인터넷뱅킹 웹'] });
  await judge(page, 'WEB-SER-001', 'fail', 'SQL 삽입 확인');
  await judge(page, 'WEB-SER-038', 'pass');
  await judge(page, 'WEB-FIN-001', 'pass');
  await tab(page, '조치 관리');
  const card = page.locator('details.finding', { hasText: 'WEB-SER-001' });
  await card.locator('summary').click();
  await card.getByLabel('담당자').fill('개발팀 이영희');
  await card.getByRole('button', { name: '저장' }).click();
  await expect(card.locator('.form-msg')).toHaveText('저장했습니다.');

  await tab(page, '기준판');
  await page.locator('#templateFile').setInputFiles(await revisionBuffer(page));
  await page.getByRole('button', { name: '이 내용으로 등록' }).click();

  await tab(page, '진단 평가');
  await page.locator('#carryPanel summary').click();
  const form = page.locator('#carryForm');
  await expect(form.getByLabel('새 기준판').locator('option:checked')).toHaveText(REVISED);
  await expect(page.locator('#carryPreview')).toHaveText('이어받는 항목 46개 · 다시 점검할 항목 2개(추가 1, 변경 1) · 빠지는 항목 1개');
  await form.getByLabel('진단명').fill('2026 진단');
  await form.getByRole('button', { name: '이어서 진단 만들기' }).click();
  await expect(message(page)).toHaveText('새 기준판으로 이어서 진단을 만들었습니다.');

  await expect(page.locator('#assessDetail')).toContainText('적용 기준판 ' + REVISED);
  await expect(page.locator('#assessDetail .note')).toContainText('이어받은 판정 2칸 · 개정 추가 1개 · 개정 변경 1개 · 개정 삭제 1개');
  await expect(page.getByLabel('WEB-SER-001 판정')).toHaveValue('fail');
  await expect(page.locator('tr[data-item="WEB-SER-001"] .badges')).toHaveText('이전 결과 직전 취약');
  await expect(page.getByLabel('WEB-SER-038 판정')).toHaveValue('');
  await expect(page.locator('tr[data-item="WEB-SER-038"] .badges')).toHaveText('개정 변경');
  await expect(page.locator('tr[data-item="WEB-SER-060"] .badges')).toHaveText('개정 추가');
  await expect(page.locator('tr[data-item="WEB-SER-052"]')).toHaveCount(0);
  await page.locator('#filterSelect').selectOption('revised');
  await expect(page.locator('#itemRows tr')).toHaveCount(2);

  await page.locator('#filterSelect').selectOption('all');
  await judge(page, 'WEB-SER-001', 'pass');
  await expect(page.locator('tr[data-item="WEB-SER-001"] .badges')).toHaveText('직전 취약');

  await tab(page, '조치 관리');
  await page.locator('#actionAssessSelect').selectOption({ label: '2025 진단 (2026-02-02 ~ 2026-02-27)' });
  await expect(page.locator('details.finding')).toHaveCount(1);
  const state = await stored(page);
  const [newer, older] = state.assessments;
  expect(older.results['WEB-SER-001'][state.assets[0].id].verdict).toBe('fail');
  expect(Object.values(newer.actions)[0].owner).toBe('개발팀 이영희');
});

test('조치 관리: 완료·조치불가 필수값, 기한 초과, 조치율을 관리한다', async ({ page }) => {
  await open(page);
  await tab(page, '백업·설정');
  await page.getByLabel('조기 개선 (일)').fill('14');
  await page.getByRole('button', { name: '기본값 저장' }).click();
  await expect(message(page)).toHaveText('조치 기한 기본값을 저장했습니다.');
  await addAsset(page, '인터넷뱅킹 웹');
  await createAssessment(page, { title: '조치 진단', start: '2026-02-02', end: '2026-02-27', assets: ['인터넷뱅킹 웹'] });
  await judge(page, 'WEB-SER-001', 'fail', 'SQL 삽입');
  await judge(page, 'WEB-SER-038', 'fail', 'PUT 허용');
  await judge(page, 'WEB-FIN-004', 'partial', '일부 거래만 검증');

  await tab(page, '조치 관리');
  await expect(page.locator('#unplannedCount')).toHaveText('3');
  const first = page.locator('details.finding', { hasText: 'WEB-SER-001' });
  await expect(first.locator('summary')).toContainText('조기 개선 · 기한 2026-03-13'); // 2026-02-27 + 14일
  await expect(page.locator('details.finding', { hasText: 'WEB-SER-038' }).locator('summary')).toContainText('장기 개선 · 기한 2026-08-26');

  await first.locator('summary').click();
  await first.getByLabel('상태').selectOption('조치 완료');
  await first.getByRole('button', { name: '저장' }).click();
  await expect(first.locator('.form-msg')).toHaveText('조치 완료에는 조치 내용, 완료일, 증적 참조가 필요합니다.');
  await first.getByLabel('조치 내용·계획').fill('바인딩 쿼리로 수정');
  await first.getByLabel('완료일').fill('2026-03-03');
  await first.getByLabel('증적 참조').fill('CHG-2026-0301');
  await first.getByRole('button', { name: '저장' }).click();
  await expect(first.locator('.form-msg')).toHaveText('완료일은 진단 시작일부터 오늘 사이여야 합니다.');
  await first.getByLabel('완료일').fill('2026-03-01');
  await first.getByRole('button', { name: '저장' }).click();
  await expect(first.locator('.form-msg')).toHaveText('저장했습니다.');
  await expect(first.locator('summary')).toContainText('조치 완료');

  const second = page.locator('details.finding', { hasText: 'WEB-SER-038' });
  await second.locator('summary').click();
  await second.getByLabel('상태').selectOption('조치불가');
  await expect(second.locator('fieldset.unfixable')).toBeVisible();
  await second.getByRole('button', { name: '저장' }).click();
  await expect(second.locator('.form-msg')).toHaveText('조치불가에는 사유, 보완대책, 최고경영자 승인일, 승인 문서 번호가 필요합니다.');
  await second.getByLabel('사유').selectOption('조치 시 서비스 운영이 불가능');
  await second.getByLabel('보완대책').fill('웹 방화벽에서 PUT 차단');
  await second.getByLabel('최고경영자 승인일').fill('2026-02-28');
  await second.getByLabel('승인 문서 번호').fill('결재-2026-112');
  await second.getByRole('button', { name: '저장' }).click();
  await expect(second.locator('.form-msg')).toHaveText('저장했습니다.');

  const third = page.locator('details.finding', { hasText: 'WEB-FIN-004' });
  await third.locator('summary').click();
  await third.getByLabel('담당자').fill('전자금융팀');
  await third.getByLabel('조치 기한').fill('2026-03-01');
  await third.getByRole('button', { name: '저장' }).click();
  await expect(third.locator('summary')).toContainText('기한 초과');

  await expect(page.locator('#actionRate')).toHaveText('33.3%');
  await expect(page.locator('#overdueCount')).toHaveText('1');
  await expect(page.locator('#unfixableCount')).toHaveText('1');
  await expect(page.locator('#unplannedCount')).toHaveText('0');
  await page.locator('#actionStateFilter').selectOption('기한 초과');
  await expect(page.locator('details.finding')).toHaveCount(1);

  await tab(page, '보고서');
  await expect(page.locator('#report')).toContainText('조치율 33.3% (조치 완료 1 / 전체 3건)');
  await expect(page.locator('#report')).toContainText('2026-02-28 · 결재-2026-112');
  const actions = Object.values((await stored(page)).assessments[0].actions);
  expect(actions.map(a => a.status).sort()).toEqual(['조치 예정', '조치 완료', '조치불가']);
});

test('자산·주기: 연 1회(홈페이지 6개월) 기한을 마지막 진단 종료일로 계산한다', async ({ page }) => {
  await open(page);
  await addAsset(page, '홈페이지', '웹 서비스', true);
  await addAsset(page, '내부 업무', '웹 서비스');
  await addAsset(page, '임박 홈페이지', '웹 서비스', true);
  await addAsset(page, '신규 시스템', '웹 서비스');
  await createAssessment(page, { title: '작년 하반기', start: '2025-08-18', end: '2025-09-01', assets: ['홈페이지', '내부 업무'] });
  await createAssessment(page, { title: '작년 가을', start: '2025-09-08', end: '2025-09-20', assets: ['임박 홈페이지'] });

  await tab(page, '자산·주기');
  const row = name => page.locator(`#assetRows tr:has(input[data-field=name][value="${name}"])`);
  await expect(row('홈페이지')).toContainText(/2025-09-01\s*2026-03-01\s*기한 초과/);
  await expect(row('내부 업무')).toContainText(/2025-09-01\s*2026-09-01\s*정상/);
  await expect(row('임박 홈페이지')).toContainText(/2025-09-20\s*2026-03-20\s*30일 이내 도래/);
  await expect(row('신규 시스템')).toContainText('진단 이력 없음');
  await expect(row('홈페이지').getByRole('button', { name: '삭제' })).toBeDisabled();

  await row('내부 업무').getByLabel('내부 업무 홈페이지').check();
  await expect(row('내부 업무')).toContainText(/2026-03-01\s*기한 초과/);
});

test('새로고침 후에도 자산·진단·판정이 유지된다', async ({ page }) => {
  await open(page);
  await addAsset(page, '인터넷뱅킹 웹');
  await createAssessment(page, { title: '유지 확인', assets: ['인터넷뱅킹 웹'] });
  await judge(page, 'WEB-SER-002', 'fail', '확장자 우회 업로드');
  await page.getByLabel('WEB-SER-002 증적').fill('EVD-1');
  await page.getByLabel('WEB-SER-002 증적').blur();
  await expect(message(page)).toHaveText('WEB-SER-002 저장됨');

  await page.reload();
  await expect(page.locator('#assessSelect option:checked')).toHaveText('유지 확인 (2026-03-02 ~ 2026-03-02)');
  await expect(page.getByLabel('WEB-SER-002 판정')).toHaveValue('fail');
  await expect(page.getByLabel('WEB-SER-002 발견 내용')).toHaveValue('확장자 우회 업로드');
  await expect(page.getByLabel('WEB-SER-002 증적')).toHaveValue('EVD-1');
  await expect(page.locator('#totalScore')).toHaveText('0.0');
});

test('JSON 백업 왕복: 내려받은 파일로 빈 브라우저에 그대로 복원된다', async ({ page }) => {
  await open(page);
  await addAsset(page, '인터넷뱅킹 웹', '웹 서비스', true);
  await createAssessment(page, { title: '백업 확인', assets: ['인터넷뱅킹 웹'] });
  await judge(page, 'WEB-SER-001', 'fail', '확인');
  await tab(page, '기준판');
  await page.locator('#templateFile').setInputFiles(await revisionBuffer(page));
  await page.getByRole('button', { name: '이 내용으로 등록' }).click();

  await tab(page, '백업·설정');
  const backup = await download(page, page.getByRole('button', { name: 'JSON 백업 내려받기' }));
  expect(backup.name).toBe('security-assessment-2026-03-02.json');
  const before = JSON.parse(backup.buffer.toString('utf8'));
  expect(before).toEqual(await stored(page));

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#assessSelect')).toHaveText('등록된 진단이 없습니다');
  await tab(page, '백업·설정');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#backupFile').setInputFiles(fileSpec('backup.json', 'application/json', backup.buffer));
  await expect(message(page)).toHaveText('백업을 복원했습니다.');
  expect(await stored(page)).toEqual(before);

  await page.locator('#backupFile').setInputFiles(fileSpec('broken.json', 'application/json', Buffer.from('{"app":"security-assessment"}')));
  await expect(message(page)).toHaveText('이 도구의 JSON 백업 파일이 아닙니다.');
  expect(await stored(page)).toEqual(before);
});

test('이전 점검표 기록: 로컬 저장과 백업 파일에서 기준판만 가져오고 원래 기록은 지우지 않는다', async ({ page }) => {
  const legacy = JSON.parse(fixture('schema1-backup.json'));
  legacy.guides.push({ ...legacy.guides[0], id: 'fin-2026-1', year: 2026, version: '제2026-1호', items: legacy.guides[0].items.slice(0, 5) });
  legacy.guides.push({ ...legacy.guides[0], id: 'broken', year: 2024, version: '위험도 없음', items: [['X-1', '분류', '이름', '', '']] });
  const raw = JSON.stringify(legacy);
  await open(page);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LEGACY_KEY, raw]);
  await page.reload();
  await expect(message(page)).toHaveText("이전 '보안 이슈 대응 점검표' 기록이 있습니다. [백업·설정]에서 기준판을 가져올 수 있습니다.");

  await tab(page, '백업·설정');
  await expect(page.locator('#legacyPanel')).toContainText('기준판 3개, 사고 1건');
  await page.getByRole('button', { name: '기준판 가져오기' }).click();
  await expect(message(page)).toHaveText('기준판 1개를 가져왔습니다. 위험도가 1~5가 아닌 항목이 있어 건너뛴 기준판: 전자금융기반시설 · 2024 · 위험도 없음 사고 대응 기록 1건은 이 도구가 다루지 않아 가져오지 않았습니다. 이전 기록은 원래 위치에 그대로 있습니다.');
  expect((await stored(page)).criteria.map(c => c.id)).toEqual(['fin-2025-1', 'fin-2026-1']);
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_KEY)).toBe(raw);

  await page.locator('#backupFile').setInputFiles(fileSpec('old-backup.json', 'application/json', Buffer.from(raw)));
  await expect(message(page)).toContainText('새로 가져올 기준판이 없습니다(이미 있음).');
  expect((await stored(page)).criteria).toHaveLength(2);
});

test('기준판 양식 오류: 행 번호와 함께 고칠 내용을 보여 주고 등록을 막는다', async ({ page }) => {
  await open(page);
  await tab(page, '기준판');
  const blank = await download(page, page.locator('#blankTemplate'));
  expect(blank.name).toBe('기준판_양식.xlsx');
  const broken = await editWorkbook(page, blank.buffer, `
    const meta = wb.sheets[0].rows; meta[1][1] = '기관 내부 기준'; meta[2][1] = '26'; meta[3][1] = 'v1'; meta[6][1] = '중요도 상·중·하';
    wb.sheets[1].rows.push(['A-1', '관리적', '', '', '정책 수립', '상'], ['A-1', '기타', '', '', '중복', '중'], ['A-3', '기술적', '', '', '', '5']);`);
  await page.locator('#templateFile').setInputFiles(fileSpec('broken.xlsx', XLSX, broken));
  const errors = page.locator('#registerPreview .errors li');
  await expect(errors).toHaveText([
    "기준정보의 연도 '26'는 2000~2100 사이의 4자리 숫자여야 합니다.",
    "3행: 항목ID 'A-1'가 2행과 겹칩니다.",
    "3행: 영역 '기타'는 관리적, 물리적, 기술적 중 하나여야 합니다.",
    '4행: 항목명이 비어 있습니다.',
    "4행: 등급 '5'는 중요도 상·중·하 방식에서 상, 중, 하 중 하나여야 합니다."
  ]);
  await expect(page.getByRole('button', { name: '이 내용으로 등록' })).toBeDisabled();
});

test('파일 직접 열기(file://)로도 동작하고 저장된다', async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await addAsset(page, '인터넷뱅킹 웹');
  await createAssessment(page, { title: '파일 실행', assets: ['인터넷뱅킹 웹'] });
  await judge(page, 'WEB-FIN-001', 'pass');
  await page.reload();
  await expect(page.getByLabel('WEB-FIN-001 판정')).toHaveValue('pass');
  await expect(page.locator('#totalScore')).toHaveText('100.0');
});
