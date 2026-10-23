import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const executablePath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => console.error('[pageerror]', error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.match(await page.title(), /CallFlow/);
  await page.locator('input[autocomplete="username"]').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill(process.env.DEMO_ADMIN_PASSWORD || 'CallFlowDemo!2026');
  await page.getByRole('button', { name: '进入 CallFlow' }).click();
  await page.locator('.page-header h1').first().waitFor();
  assert.ok((await page.url()).endsWith('/'));
  const initialReset = await page.request.post(`${baseUrl}/api/data/reset-demo`, { headers: { 'x-callflow-csrf': '1' } });
  assert.ok(initialReset.ok(), `初始演示数据重置失败：${initialReset.status()}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.page-header h1').first().waitFor();
  console.log('PASS login and dashboard');

  await page.getByRole('link', { name: '预约管理' }).click();
  await page.locator('.page-header h1').filter({ hasText: '预约列表' }).waitFor();
  await page.getByRole('button', { name: '新建预约' }).first().click();
  const drawer = page.getByRole('dialog', { name: '新建预约' });
  await drawer.waitFor();
  await drawer.getByRole('button', { name: '创建预约' }).click();
  await drawer.getByText('请填写客人姓名').waitFor();
  console.log('PASS appointment client validation');

  await drawer.locator('#guestName').fill('E2E 测试客人');
  await drawer.locator('#phone').fill('13700001234');
  await drawer.locator('#resDate').fill('2032-05-20');
  await drawer.locator('#resTime').fill('18:00');
  await drawer.locator('#partySize').fill('2');
  await drawer.locator('#tableId').selectOption('table_a02');
  await drawer.getByRole('button', { name: '检测桌台冲突' }).click();
  await drawer.locator('.conflict-panel').waitFor();
  await drawer.getByRole('button', { name: '创建预约' }).click();
  await page.getByText('预约已创建', { exact: true }).first().waitFor();
  console.log('PASS appointment conflict check and creation');

  await page.getByLabel('搜索预约').fill('E2E 测试客人');
  await page.waitForTimeout(500);
  await page.getByText('E2E 测试客人').first().waitFor();
  await page.getByText('E2E 测试客人').first().click();
  await page.getByRole('dialog', { name: '预约详情' }).waitFor();
  await page.getByText('预约信息', { exact: true }).waitFor();
  await page.getByRole('dialog', { name: '预约详情' }).getByRole('button', { name: '关闭' }).click();
  console.log('PASS appointment detail drawer');

  await page.getByRole('link', { name: '来电中心' }).click();
  await page.locator('.page-header h1').filter({ hasText: '来电与 AI' }).waitFor();
  await page.getByRole('button', { name: '模拟来电' }).first().click();
  const sim = page.getByRole('dialog', { name: '模拟来电', exact: true });
  await sim.waitFor();
  await sim.locator('#simPhone').fill('13800000001');
  await sim.getByRole('button', { name: '发起模拟来电' }).click();
  await sim.getByText('推荐话术').waitFor();
  await sim.getByRole('button', { name: '接听' }).click();
  await sim.getByRole('button', { name: '生成模拟转写' }).click();
  await sim.getByText(/客户：|坐席：/).first().waitFor();
  await sim.getByRole('button', { name: 'AI 分析' }).click();
  await page.getByText('AI 模拟分析完成').first().waitFor();
  await sim.getByText('AI 模拟分析结果').waitFor();
  await sim.getByText('客户画像建议 · 模拟生成').waitFor();
  await sim.getByRole('button', { name: '关闭' }).click();
  await page.locator('.call-table tbody tr').first().click();
  const callDrawer = page.getByRole('dialog', { name: '通话详情' });
  await callDrawer.waitFor();
  await callDrawer.getByText('AI 摘要与标签').waitFor();
  await callDrawer.getByText('通话转写').waitFor();
  await callDrawer.getByRole('button', { name: '关闭' }).click();
  console.log('PASS simulated call / transcript / AI chain');

  const routes = [
    ['/', null],
    ['/calendar', '预约日历'],
    ['/appointments', '预约列表'],
    ['/customers', '客户档案'],
    ['/calls', '来电与 AI 通话工作台'],
    ['/walk-ins', '散客登记'],
    ['/tables', '桌台与座位图'],
    ['/reports', '运营报表'],
    ['/notifications', '通知中心'],
    ['/settings', '系统设置'],
    ['/admin', '账号与审计'],
    ['/diagnostics', '系统诊断'],
    ['/help', '使用帮助']
  ];

  for (const [route, heading] of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    const title = page.locator('.page-header h1').first();
    await title.waitFor();
    if (heading) {
      assert.ok((await title.innerText()).includes(heading), `${route} 页面标题不匹配`);
    }
    assert.equal(await page.getByText('无法加载内容').count(), 0, `${route} 出现加载错误`);
    console.log(`PASS route ${route}`);
  }

  await page.goto(`${baseUrl}/customers`, { waitUntil: 'networkidle' });
  await page.locator('.customer-card').first().click();
  const customerDrawer = page.getByRole('dialog', { name: '客户资料' });
  await customerDrawer.waitFor();
  await customerDrawer.getByText('预约记录', { exact: true }).waitFor();
  await customerDrawer.getByRole('button', { name: '关闭' }).click();
  console.log('PASS customer detail drawer');

  await page.goto(`${baseUrl}/walk-ins`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '登记散客' }).first().click();
  const walkDialog = page.getByRole('dialog', { name: '登记散客' });
  await walkDialog.waitFor();
  await walkDialog.locator('#walkName').fill('E2E 散客');
  await walkDialog.locator('#walkPhone').fill('13700005678');
  await walkDialog.locator('#walkDate').fill('2032-06-01');
  await walkDialog.locator('#walkTime').fill('12:30');
  await walkDialog.locator('#walkParty').fill('3');
  await walkDialog.getByRole('button', { name: '保存登记' }).click();
  await page.locator('.toast').filter({ hasText: '散客已登记' }).first().waitFor();
  const walkRow = page.locator('tr').filter({ hasText: 'E2E 散客' });
  await walkRow.waitFor();
  await walkRow.getByRole('button', { name: '转预约' }).click();
  const convertDialog = page.getByRole('dialog', { name: '将散客转为预约' });
  await convertDialog.waitFor();
  await convertDialog.getByRole('button', { name: '确认转预约' }).click();
  await page.locator('.toast').filter({ hasText: '散客已转为预约' }).first().waitFor();
  console.log('PASS walk-in registration and conversion');

  await page.goto(`${baseUrl}/tables`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '新增桌台' }).first().click();
  const tableDialog = page.getByRole('dialog', { name: '新增桌台' });
  await tableDialog.waitFor();
  await tableDialog.locator('#tableName').fill('E2E 桌台');
  await tableDialog.locator('#tableCapacity').fill('6');
  await tableDialog.getByRole('button', { name: '保存桌台' }).click();
  await page.locator('.toast').filter({ hasText: '桌台已创建' }).first().waitFor();
  await page.getByText('E2E 桌台', { exact: true }).first().waitFor();
  console.log('PASS table creation');

  await page.goto(`${baseUrl}/reports`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '近 30 天' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '营收', exact: true }).click();
  await page.locator('.bar-chart').waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '预约 CSV' }).click()
  ]);
  assert.match(download.suggestedFilename(), /\.csv$/i);
  console.log('PASS reports range, chart and CSV export');

  await page.goto(`${baseUrl}/notifications`, { waitUntil: 'networkidle' });
  const beforeUnread = await page.locator('.notice-item.is-unread').count();
  assert.ok(beforeUnread > 0, '演示数据应包含未读通知');
  const unreadNotice = page.locator('.notice-item.is-unread').first();
  await unreadNotice.click();
  await page.waitForFunction((expected) => document.querySelectorAll('.notice-item.is-unread').length < expected, beforeUnread);
  console.log('PASS notification mark read');

  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '预约规则' }).click();
  await page.locator('#conflictWindow').waitFor();
  await page.getByRole('button', { name: '保存规则' }).click();
  await page.locator('.toast').filter({ hasText: '设置已保存' }).first().waitFor();
  await page.getByRole('button', { name: 'AI · 电话 · 飞书' }).click();
  await page.getByRole('button', { name: '测试模拟适配器' }).click();
  await page.locator('.toast').first().waitFor();
  console.log('PASS settings persistence and mock adapter test');

  const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await viewerPage.locator('input[autocomplete="username"]').fill('viewer');
  await viewerPage.locator('input[autocomplete="current-password"]').fill(process.env.DEMO_VIEWER_PASSWORD || 'CallFlowViewer!2026');
  await viewerPage.getByRole('button', { name: '进入 CallFlow' }).click();
  await viewerPage.locator('.page-header h1').first().waitFor();
  assert.equal(await viewerPage.getByRole('link', { name: '账号与审计' }).count(), 0, '只读角色不应看到管理员导航');
  await viewerPage.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await viewerPage.getByText('没有访问权限').waitFor();
  await viewerPage.getByRole('button', { name: '退出登录' }).click();
  await viewerPage.locator('input[autocomplete="username"]').waitFor();
  await viewerContext.close();
  console.log('PASS viewer role restrictions and logout');

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    assert.ok(metrics.scrollWidth <= metrics.innerWidth + 2, `${width}px 视口出现横向溢出：${metrics.scrollWidth}/${metrics.innerWidth}`);
    console.log(`PASS responsive ${width}px`);
  }

  const reset = await page.request.post(`${baseUrl}/api/data/reset-demo`, { headers: { 'x-callflow-csrf': '1' } });
  assert.ok(reset.ok(), `演示数据重置失败：${reset.status()}`);
  console.log('PASS demo data reset');
} finally {
  await browser.close();
}
