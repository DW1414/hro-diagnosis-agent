/* 文案改动目检截图：顶栏引导 / 覆盖度检查 / 指标速填 / AI 接入弹窗 */
const { chromium } = require('playwright-core');
const path = require('path');
const PWD = require('./_pwd');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'ops-diagnosis-agent.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 2 });
  await p.goto(FILE, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  if (await p.isVisible('#gateIn')) {
    await p.fill('#gateIn', PWD);
    await p.click('#gateBtn');
    await p.waitForTimeout(900);
  }
  /* 1 顶栏引导 */
  await p.screenshot({ path: path.join(__dirname, 't_tips.png'), clip: { x: 90, y: 0, width: 1260, height: 130 } });
  /* 2 覆盖度检查 + 指标速填 */
  await p.evaluate(() => { const e = document.getElementById('bCover'); if (e) e.scrollIntoView({ block: 'start' }); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, 't_cover.png') });
  await p.evaluate(() => { const e = document.getElementById('bKpi'); if (e) e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(__dirname, 't_kpi.png') });
  /* 3 AI 接入弹窗 */
  await p.evaluate(() => { if (window.__llm) window.__llm.openConfig(); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(__dirname, 't_ai.png') });
  console.log('shots ok');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
