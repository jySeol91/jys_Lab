const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const KEY = 'incident-checklist-ko-v1';
const SCHEMA1_BACKUP = fs.readFileSync(path.join(__dirname, 'fixtures', 'schema1-backup.json'), 'utf8');
const GUIDE_2025 = '전자금융기반시설 · 2025 · 제2025-1호 / 첨부 대응방안 v1.0';
const GUIDE_2026 = '전자금융기반시설 · 2026 · 제2026-1호';

// 접수 2026-03-02 09:00 KST → 72시간 기한 2026-03-05 09:00 KST (= 00:00 UTC)
const RECEIVED = '2026-03-02T09:00';
const DUE_UTC = Date.parse('2026-03-05T00:00:00Z');
const MINUTE = 60000;

const setNow = (page, ms) => page.clock.setFixedTime(new Date(ms));
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);

async function open(page, now = Date.parse('2026-03-02T00:30:00Z')) {
  await setNow(page, now);
  await page.goto('/index.html');
}

async function registerCase(page, title = 'VPN 장비 인증 우회 취약점') {
  await page.getByLabel('사고명').fill(title);
  await page.getByLabel('접수 일시 (KST)').fill(RECEIVED);
  await page.getByLabel('서비스·담당자').fill('인터넷뱅킹 · 김보안');
  await page.getByRole('button', { name: '사고 등록' }).click();
  await expect(page.locator('#message')).toHaveText('사고를 등록했습니다.');
}

async function fillStep(page, step, { status, note, evidence, doneAt }) {
  if (status !== undefined) await page.getByLabel(step + ' 상태').selectOption(status);
  if (note !== undefined) await page.getByLabel(step + ' 결과').fill(note);
  if (evidence !== undefined) await page.getByLabel(step + ' 증적').fill(evidence);
  if (doneAt !== undefined) await page.getByLabel(step + ' 일시').fill(doneAt);
}
const saveCase = page => page.getByRole('button', { name: '대응 기록 저장' }).click();

// 2025판에서 1건 추가, 1건 위험도 변경, 1건 삭제한 2026판을 등록한다.
async function registerRevision(page) {
  await page.getByRole('button', { name: '연도별 기준' }).click();
  await page.getByRole('button', { name: '조회 중인 판의 항목 불러오기' }).click();
  const items = page.getByLabel('항목 목록');
  const lines = (await items.inputValue()).split('\n')
    .filter(line => !line.startsWith('WEB-SER-052 |'))
    .map(line => line.startsWith('WEB-SER-038 |') ? 'WEB-SER-038 | 일반공통 | 불필요한 웹 메서드 허용 | 2 | p. 45' : line);
  lines.push('WEB-SER-060 | 일반공통 | API 인증 누락 | 5 | p. 55');
  await items.fill(lines.join('\n'));
  await page.getByLabel('연도').fill('2026');
  await page.getByLabel('버전·고시 번호').fill('제2026-1호');
  await page.getByLabel('시행일 또는 게시일').fill('2026-02-01');
  await page.getByLabel('출처 URL').fill('https://example.org/guide-2026');
  await page.getByRole('button', { name: '새 기준판 등록' }).click();
  await expect(page.locator('#message')).toHaveText('새 기준판을 등록했습니다.');
}

async function exportBackup(page) {
  await page.getByRole('button', { name: '백업', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'JSON 백업 다운로드' }).click()
  ]);
  return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
}

// 파일 경로 대신 내용을 직접 넘긴다 (경로의 한글·OS 차이와 무관하게 동작).
const jsonFile = (name, text) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });

async function importBackup(page, text) {
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#file').setInputFiles(jsonFile('backup.json', text));
}

test('사고 등록: KST 접수 시각과 기본 72시간 기한이 표시된다', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('접수 일시 (KST)')).toHaveValue('2026-03-02T09:30'); // 현재 시각(KST)
  await expect(page.getByLabel('패치 이력 확인 기한 (시간)')).toHaveValue('72');
  await expect(page.locator('#caseSelect')).toHaveText('등록된 사고가 없습니다');

  await registerCase(page);

  await expect(page.locator('#caseSelect option')).toHaveText(['VPN 장비 인증 우회 취약점']);
  await expect(page.locator('#caseDetail')).toContainText('취약점·보안이슈 · 인터넷뱅킹 · 김보안');
  await expect(page.locator('#caseDetail')).toContainText('0/9 항목 처리');
  await expect(page.locator('#deadline')).toHaveText('패치 이력 확인 대기 · 2026-03-05 09:00 KST');
  await expect(page.locator('#caseDetail')).toContainText('적용 기준판 ' + GUIDE_2025);
});

test('사고 등록: 미래의 접수 시각은 거부한다', async ({ page }) => {
  await open(page);
  await page.getByLabel('사고명').fill('미래 사고');
  await page.getByLabel('접수 일시 (KST)').fill('2026-03-02T09:31');
  await page.getByLabel('서비스·담당자').fill('테스트');
  await page.getByRole('button', { name: '사고 등록' }).click();
  await expect(page.locator('#message')).toHaveText('사고명·서비스를 입력하고 접수 시각을 확인하세요.');
  expect(await stored(page)).toBeNull();
});

test('72시간 경계: 기한 정각까지는 대기, 지나면 초과', async ({ page }) => {
  await open(page);
  await registerCase(page);
  const deadline = page.locator('#deadline');

  await setNow(page, DUE_UTC - MINUTE); await page.reload();
  await expect(deadline).toHaveText('패치 이력 확인 대기 · 2026-03-05 09:00 KST');
  await expect(deadline).not.toHaveClass(/bad/);

  await setNow(page, DUE_UTC); await page.reload();
  await expect(deadline).toHaveText('패치 이력 확인 대기 · 2026-03-05 09:00 KST');
  await expect(deadline).not.toHaveClass(/bad/);

  await setNow(page, DUE_UTC + 1); await page.reload();
  await expect(deadline).toHaveText('패치 이력 기한 초과 · 2026-03-05 09:00 KST');
  await expect(deadline).toHaveClass(/bad/);
});

test('72시간 경계: 확인 일시가 기한 정각이면 기한 내, 1분 뒤면 기한 후', async ({ page }) => {
  await open(page);
  await registerCase(page);
  await setNow(page, DUE_UTC + 10 * MINUTE); await page.reload();
  const deadline = page.locator('#deadline');

  await fillStep(page, '패치 이력 확인', { status: '완료', note: '패치 미적용 확인', evidence: 'SEC-1', doneAt: '2026-03-05T09:00' });
  await saveCase(page);
  await expect(deadline).toHaveText('패치 이력 기한 내 확인 · 2026-03-05 09:00 KST');
  await expect(deadline).not.toHaveClass(/bad/);

  await fillStep(page, '패치 이력 확인', { doneAt: '2026-03-05T09:01' });
  await saveCase(page);
  await expect(deadline).toHaveText('패치 이력 기한 후 확인 · 2026-03-05 09:00 KST');
  await expect(deadline).toHaveClass(/bad/);

  await fillStep(page, '패치 이력 확인', { status: '해당 없음', note: '패치 대상 아님' });
  await saveCase(page);
  await expect(deadline).toHaveText('패치 이력 해당 없음 · 2026-03-05 09:00 KST');
});

test('사고별 기한: 시간을 바꿔 등록하면 그 사고에만 적용된다', async ({ page }) => {
  await open(page);
  await page.getByLabel('패치 이력 확인 기한 (시간)').fill('24');
  await registerCase(page, '긴급 사고');
  await expect(page.locator('#deadline')).toContainText('2026-03-03 09:00 KST');
  await page.getByLabel('패치 이력 확인 기한 (시간)').fill('72');
  await registerCase(page, '일반 사고');
  await expect(page.locator('#deadline')).toContainText('2026-03-05 09:00 KST');
  await page.locator('#caseSelect').selectOption({ label: '긴급 사고' });
  await expect(page.locator('#deadline')).toContainText('2026-03-03 09:00 KST');
});

test('완료 필수값: 결과·증적·확인 일시가 모두 있어야 저장된다', async ({ page }) => {
  await open(page);
  await registerCase(page);
  const message = page.locator('#message');
  const missing = '접수·분류 항목의 완료 또는 해당 없음 처리에 필요한 내용을 입력하세요.';

  await fillStep(page, '접수·분류', { status: '완료' });
  await saveCase(page);
  await expect(message).toHaveText(missing);

  await fillStep(page, '접수·분류', { note: '자산 식별 완료' });
  await saveCase(page);
  await expect(message).toHaveText(missing);

  await fillStep(page, '접수·분류', { evidence: 'TCK-1001' });
  await saveCase(page);
  await expect(message).toHaveText(missing);
  expect((await stored(page)).cases[0].results.intake.status).toBe('대기');

  // 확인 일시는 접수 시각 ~ 현재 시각 사이여야 한다 (현재 09:30 KST)
  for (const doneAt of ['2026-03-02T08:59', '2026-03-02T09:31']) {
    await fillStep(page, '접수·분류', { doneAt });
    await saveCase(page);
    await expect(message).toHaveText('접수·분류 확인 일시를 접수 시각부터 현재 시각 사이로 입력하세요.');
  }

  await fillStep(page, '접수·분류', { doneAt: '2026-03-02T09:10' });
  await saveCase(page);
  await expect(message).toHaveText('대응 기록을 저장했습니다.');
  await expect(page.locator('#caseDetail')).toContainText('1/9 항목 처리');
  expect((await stored(page)).cases[0].results.intake)
    .toEqual({ status: '완료', note: '자산 식별 완료', evidence: 'TCK-1001', doneAt: '2026-03-02T09:10' });
});

test('해당 없음: 사유가 있어야 저장된다', async ({ page }) => {
  await open(page);
  await registerCase(page);
  await fillStep(page, '운영 반영', { status: '해당 없음' });
  await saveCase(page);
  await expect(page.locator('#message')).toHaveText('운영 반영 항목의 완료 또는 해당 없음 처리에 필요한 내용을 입력하세요.');
  await fillStep(page, '운영 반영', { note: '패치 미제공으로 대체조치' });
  await saveCase(page);
  await expect(page.locator('#message')).toHaveText('대응 기록을 저장했습니다.');
  await expect(page.locator('#caseDetail')).toContainText('1/9 항목 처리');
});

test('기준판 비교: 같은 계열 직전 등록판 대비 추가·변경·삭제를 표시한다', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '연도별 기준' }).click();
  await expect(page.locator('#guideDetail')).toContainText('48개 항목');
  await expect(page.locator('#guideDetail')).not.toContainText('직전 등록판 대비 변경');

  await registerRevision(page);

  const detail = page.locator('#guideDetail');
  await expect(page.locator('#guideSelect option:checked')).toHaveText(GUIDE_2026);
  await expect(detail).toContainText('2026-02-01 · 48개 항목');
  await detail.getByText('직전 등록판 대비 변경 (제2025-1호 / 첨부 대응방안 v1.0)').click();
  await expect(detail.locator('details').first().locator('p')).toHaveText([
    '추가 1건 WEB-SER-060', '변경 1건 WEB-SER-038', '삭제 1건 WEB-SER-052'
  ]);

  // 다른 계열의 판은 비교 대상이 없다
  await page.getByLabel('기준 계열').selectOption('기관 내부 기준');
  await page.getByLabel('항목 목록').fill('INT-001 | 내부 | 계정 점검 | 3 | 1장');
  await page.getByLabel('연도').fill('2026');
  await page.getByLabel('버전·고시 번호').fill('v1');
  await page.getByLabel('시행일 또는 게시일').fill('2026-02-10');
  await page.getByLabel('출처 URL').fill('https://example.org/internal');
  await page.getByRole('button', { name: '새 기준판 등록' }).click();
  await expect(detail).toContainText('1개 항목');
  await expect(detail).not.toContainText('직전 등록판 대비 변경');

  // 같은 계열·연도·버전은 다시 등록할 수 없다
  await page.getByLabel('기준 계열').selectOption('기관 내부 기준');
  await page.getByLabel('항목 목록').fill('INT-001 | 내부 | 계정 점검 | 3 | 1장');
  await page.getByLabel('연도').fill('2026');
  await page.getByLabel('버전·고시 번호').fill('v1');
  await page.getByLabel('시행일 또는 게시일').fill('2026-02-10');
  await page.getByLabel('출처 URL').fill('https://example.org/internal');
  await page.getByRole('button', { name: '새 기준판 등록' }).click();
  await expect(page.locator('#message')).toHaveText('같은 연도와 버전의 기준판이 이미 있습니다.');
});

test('기준판 유지: 새 판을 등록해도 기존 사고는 최초 적용 기준판을 참조한다', async ({ page }) => {
  await open(page);
  await registerCase(page, '기존 사고');
  await page.getByLabel('관련 기준 항목').selectOption(['WEB-SER-052']); // 2026판에서 삭제되는 항목
  await saveCase(page);

  await registerRevision(page);
  await page.getByRole('button', { name: '사고 대응' }).click();

  const detail = page.locator('#caseDetail');
  await expect(detail).toContainText('적용 기준판 ' + GUIDE_2025);
  await expect(page.getByLabel('관련 기준 항목').locator('option:checked')).toHaveText(['WEB-SER-052 · 서버 사이드 템플릿 인젝션(SSTI)']);
  await expect(page.getByLabel('관련 기준 항목').locator('option[value="WEB-SER-060"]')).toHaveCount(0);

  // 새 사고는 방금 등록한 판이 기본 선택된다
  await expect(page.locator('#newGuide option:checked')).toHaveText(GUIDE_2026);
  await registerCase(page, '새 사고');
  await expect(detail).toContainText('적용 기준판 ' + GUIDE_2026);
  await expect(page.getByLabel('관련 기준 항목').locator('option[value="WEB-SER-060"]')).toHaveCount(1);
  await expect(page.getByLabel('관련 기준 항목').locator('option[value="WEB-SER-052"]')).toHaveCount(0);

  await page.locator('#caseSelect').selectOption({ label: '기존 사고' });
  await expect(detail).toContainText('적용 기준판 ' + GUIDE_2025);
  const state = await stored(page);
  expect(state.cases.map(c => [c.title, c.guide])).toEqual([['새 사고', state.guides[1].id], ['기존 사고', 'fin-2025-1']]);
});

test('새로고침 후에도 사고·대응 기록·기준판이 유지된다', async ({ page }) => {
  await open(page);
  await registerCase(page);
  await page.getByLabel('관련 기준 항목').selectOption(['WEB-SER-001', 'WEB-SER-019']);
  await page.getByLabel('침해지표 및 확인 결과').fill('08:40 KST 방화벽 로그 · 203.0.113.7');
  await fillStep(page, '접수·분류', { status: '완료', note: '자산 식별 완료', evidence: 'TCK-1001', doneAt: '2026-03-02T09:10' });
  await fillStep(page, '서비스 영향도 확인', { status: '진행', note: '의존성 조사 중' });
  await saveCase(page);
  await registerRevision(page);

  await page.reload();

  await expect(page.locator('#caseSelect option:checked')).toHaveText('VPN 장비 인증 우회 취약점');
  await expect(page.locator('#caseDetail')).toContainText('1/9 항목 처리');
  await expect(page.getByLabel('접수·분류 상태')).toHaveValue('완료');
  await expect(page.getByLabel('접수·분류 결과')).toHaveValue('자산 식별 완료');
  await expect(page.getByLabel('접수·분류 증적')).toHaveValue('TCK-1001');
  await expect(page.getByLabel('접수·분류 일시')).toHaveValue('2026-03-02T09:10');
  await expect(page.getByLabel('서비스 영향도 확인 상태')).toHaveValue('진행');
  await expect(page.getByLabel('서비스 영향도 확인 결과')).toHaveValue('의존성 조사 중');
  await expect(page.getByLabel('관련 기준 항목')).toHaveValues(['WEB-SER-001', 'WEB-SER-019']);
  await expect(page.getByLabel('침해지표 및 확인 결과')).toHaveValue('08:40 KST 방화벽 로그 · 203.0.113.7');
  await expect(page.locator('#guideSelect option')).toHaveText([GUIDE_2026, GUIDE_2025]);
});

test('JSON 백업 왕복: 내보낸 파일로 빈 브라우저에 그대로 복원된다', async ({ page }) => {
  await open(page);
  await registerCase(page);
  await fillStep(page, '접수·분류', { status: '완료', note: '자산 식별 완료', evidence: 'TCK-1001', doneAt: '2026-03-02T09:10' });
  await saveCase(page);
  await registerRevision(page);

  const before = await exportBackup(page);
  expect(before.name).toBe('security-checklist-2026-03-02.json');
  const backup = JSON.parse(before.text);
  expect(backup.schema).toBe(2);
  expect(backup.cases[0].rows).toBeUndefined();
  expect(Object.keys(backup.cases[0].results)).toHaveLength(9);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#caseSelect')).toHaveText('등록된 사고가 없습니다');

  await page.getByRole('button', { name: '백업', exact: true }).click();
  await importBackup(page, before.text);
  await expect(page.locator('#message')).toHaveText('백업을 복원했습니다.');

  expect(await stored(page)).toEqual(backup);
  expect(JSON.parse((await exportBackup(page)).text)).toEqual(backup);
  await page.getByRole('button', { name: '사고 대응' }).click();
  await expect(page.getByLabel('접수·분류 결과')).toHaveValue('자산 식별 완료');
  await expect(page.locator('#guideSelect option')).toHaveText([GUIDE_2026, GUIDE_2025]);
});

test('JSON 복원: 형식이 맞지 않는 파일은 거부하고 기존 기록을 지킨다', async ({ page }) => {
  await open(page);
  await registerCase(page);
  const before = await stored(page);
  const broken = JSON.parse(SCHEMA1_BACKUP);
  broken.cases[0].rows.pop();
  const cases = { 'not-json.json': '{', 'short-rows.json': JSON.stringify(broken), 'future.json': JSON.stringify({ ...before, schema: 3 }) };
  for (const [name, text] of Object.entries(cases)) {
    await page.locator('#file').setInputFiles(jsonFile(name, text));
    await expect(page.locator('#message')).toHaveText('이 도구의 유효한 JSON 백업 파일을 선택하세요.');
    await page.locator('#message').evaluate(el => { el.textContent = ''; });
  }
  expect(await stored(page)).toEqual(before);
});

test('schema 1 백업 가져오기: 인덱스 기반 결과가 단계 ID로 옮겨진다', async ({ page }) => {
  await open(page, DUE_UTC + 24 * 60 * MINUTE);
  await page.getByRole('button', { name: '백업', exact: true }).click();
  await importBackup(page, SCHEMA1_BACKUP);
  await expect(page.locator('#message')).toHaveText('백업을 복원했습니다.');
  await page.getByRole('button', { name: '사고 대응' }).click();

  await expect(page.locator('#caseSelect option:checked')).toHaveText('VPN 장비 인증 우회 취약점');
  await expect(page.locator('#deadline')).toHaveText('패치 이력 기한 내 확인 · 2026-03-05 09:00 KST');
  await expect(page.locator('#caseDetail')).toContainText('2/9 항목 처리');
  await expect(page.getByLabel('패치 이력 확인 상태')).toHaveValue('완료');
  await expect(page.getByLabel('패치 이력 확인 증적')).toHaveValue('SEC-2026-0312');
  await expect(page.getByLabel('테스트 서버 검증 결과')).toHaveValue('스테이징 배포 대기');
  await expect(page.getByLabel('운영 검증·종결 상태')).toHaveValue('해당 없음');
  await expect(page.getByLabel('관련 기준 항목')).toHaveValues(['WEB-SER-019', 'WEB-SER-052']);

  const state = await stored(page);
  const v1 = JSON.parse(SCHEMA1_BACKUP);
  expect(state.schema).toBe(2);
  expect(state.guides).toEqual(v1.guides);
  const { rows, ...rest } = v1.cases[0];
  expect(state.cases[0]).toEqual({
    ...rest,
    results: {
      'intake': rows[0], 'patch-history': rows[1], 'service-impact': rows[2],
      'evidence-preservation': rows[3], 'initial-response': rows[4], 'change-preparation': rows[5],
      'test-verification': rows[6], 'production-rollout': rows[7], 'closure': rows[8]
    }
  });
});

test('schema 1 로컬 저장: 열 때 자동으로 schema 2로 올리고 원본을 남긴다', async ({ page }) => {
  const raw = SCHEMA1_BACKUP;
  await open(page, DUE_UTC + 24 * 60 * MINUTE);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, raw]);
  await page.reload();

  await expect(page.locator('#message')).toHaveText('');
  await expect(page.getByLabel('패치 이력 확인 결과')).toHaveValue('벤더 패치 미적용 확인');
  const state = await stored(page);
  expect(state.schema).toBe(2);
  expect(state.cases[0].results['patch-history'].evidence).toBe('SEC-2026-0312');
  expect(await page.evaluate(key => localStorage.getItem(key + '.before-schema-2'), KEY)).toBe(raw);
});

test('읽을 수 없는 로컬 저장: 안내를 표시하고 원본을 남긴다', async ({ page }) => {
  await open(page);
  await page.evaluate(key => localStorage.setItem(key, '{"schema":1,"guides":'), KEY);
  await page.reload();
  await expect(page.locator('#message')).toHaveText('로컬 저장을 읽을 수 없습니다. 백업 파일이 있으면 복원하세요.');
  await expect(page.locator('#caseSelect')).toHaveText('등록된 사고가 없습니다');
  expect(await page.evaluate(key => localStorage.getItem(key + '.unreadable'), KEY)).toBe('{"schema":1,"guides":');
});

test('단계 순서 변경: 결과가 단계 ID를 따라가므로 순서를 바꿔도 어긋나지 않는다', async ({ page }) => {
  await page.route('**/js/data/steps.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + '\nwindow.SecurityChecklist.STEPS.reverse();\n' });
  });
  await open(page, DUE_UTC + 24 * 60 * MINUTE);
  await page.getByRole('button', { name: '백업', exact: true }).click();
  await importBackup(page, SCHEMA1_BACKUP);
  await page.getByRole('button', { name: '사고 대응' }).click();

  await expect(page.locator('#caseForm tbody tr strong').first()).toHaveText('운영 검증·종결');
  await expect(page.locator('#caseForm tbody tr strong').last()).toHaveText('접수·분류');
  await expect(page.getByLabel('패치 이력 확인 상태')).toHaveValue('완료');
  await expect(page.getByLabel('패치 이력 확인 결과')).toHaveValue('벤더 패치 미적용 확인');
  await expect(page.getByLabel('테스트 서버 검증 결과')).toHaveValue('스테이징 배포 대기');
  await expect(page.locator('#deadline')).toHaveText('패치 이력 기한 내 확인 · 2026-03-05 09:00 KST');

  await fillStep(page, '접수·분류', { status: '해당 없음', note: '이관 건' });
  await saveCase(page);
  const results = (await stored(page)).cases[0].results;
  expect(results.intake.note).toBe('이관 건');
  expect(results['patch-history'].evidence).toBe('SEC-2026-0312');
});

test('파일 직접 열기(file://)로도 동작하고 저장된다', async ({ page }) => {
  await setNow(page, Date.parse('2026-03-02T00:30:00Z'));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await registerCase(page);
  await page.reload();
  await expect(page.locator('#caseSelect option:checked')).toHaveText('VPN 장비 인증 우회 취약점');
  await expect(page.locator('#deadline')).toHaveText('패치 이력 확인 대기 · 2026-03-05 09:00 KST');
});
