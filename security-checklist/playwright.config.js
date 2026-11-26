const { defineConfig } = require('@playwright/test');

const PORT = 4173;

// 리눅스에서 로캘이 UTF-8이 아니면 브라우저가 한글 내려받기 파일 이름을 'download'로 바꿉니다.
// 테스트용 브라우저만 UTF-8 로캘로 띄웁니다. (Windows·macOS는 영향 없음)
const locale = process.env.LC_ALL || process.env.LANG || '';
const env = process.platform === 'linux' && !/utf-?8/i.test(locale) ? { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } : undefined;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    timezoneId: 'America/New_York', // KST 처리가 PC 시간대와 무관한지 함께 확인
    trace: 'off',
    launchOptions: env ? { env } : {}
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI
  }
});
