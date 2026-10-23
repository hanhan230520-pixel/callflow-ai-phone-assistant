import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const executablePath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const outputDir = new URL('../docs/screenshots/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('input[autocomplete="username"]').fill(process.env.DEMO_ADMIN_USERNAME || 'admin');
  await page.locator('input[autocomplete="current-password"]').fill(process.env.DEMO_ADMIN_PASSWORD || 'CallFlowDemo!2026');
  await page.getByRole('button', { name: '进入 CallFlow' }).click();
  await page.locator('.page-header h1').first().waitFor();
  const shots = [
    ['/', 'dashboard.png', null],
    ['/appointments', 'appointments.png', '预约列表'],
    ['/calendar', 'calendar.png', '预约日历'],
    ['/customers', 'customers.png', '客户档案'],
    ['/calls', 'calls.png', '来电与 AI 通话工作台'],
    ['/walk-ins', 'walk-ins.png', '散客登记'],
    ['/tables', 'tables.png', '桌台与座位图'],
    ['/reports', 'reports.png', '运营报表'],
    ['/settings', 'settings.png', '系统设置']
  ];
  for (const [route, file, title] of shots) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    if (title) await page.getByText(title, { exact: true }).first().waitFor();
    else await page.locator('.page-header h1').first().waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: fileURLToPath(new URL(file, outputDir)), fullPage: false });
    console.log(`captured ${file}`);
  }

  await page.goto(`${baseUrl}/calls`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '模拟来电' }).first().click();
  const sim = page.getByRole('dialog', { name: '模拟来电', exact: true });
  await sim.locator('#simPhone').fill('13800000001');
  await sim.getByRole('button', { name: '发起模拟来电' }).click();
  await sim.getByText('推荐话术').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: fileURLToPath(new URL('call-simulation.png', outputDir)), fullPage: false });
  await sim.getByRole('button', { name: '关闭' }).click();
  console.log('captured call-simulation.png');
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`${baseUrl}/appointments`, { waitUntil: 'networkidle' });
  await page.getByText('预约列表', { exact: true }).first().waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL('tablet-appointments.png', outputDir)), fullPage: false });
  console.log('captured tablet-appointments.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-dashboard.png', outputDir)), fullPage: false });
  console.log('captured mobile-dashboard.png');
} finally {
  await browser.close();
}
