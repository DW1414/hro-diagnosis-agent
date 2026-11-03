const { chromium } = require('playwright-core');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'ops-diagnosis-agent.html').replace(/\\/g, '/');
const PW = '__GATE_PW__';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(FILE, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const A1 = await p.isVisible('#gate');
  const bodyLocked = await p.evaluate(() => document.documentElement.style.overflow);
  await p.screenshot({ path: path.join(__dirname, 'g_lock.png') });

  await p.fill('#gateIn', 'wrongpass');
  await p.click('#gateBtn');
  await p.waitForTimeout(300);
  const A2 = await p.isVisible('#gate');
  const A2err = (await p.textContent('#gateErr')) || '';

  await p.fill('#gateIn', PW);
  await p.click('#gateBtn');
  await p.waitForTimeout(600);
  const A3 = !(await p.isVisible('#gate'));
  const A4 = await p.isVisible('#glock');
  const overflowBack = await p.evaluate(() => document.documentElement.style.overflow);
  await p.screenshot({ path: path.join(__dirname, 'g_main.png') });

  await p.click('#btnAdmin');
  await p.waitForTimeout(400);
  await p.fill('#adminKeyIn', 'Ops2026#KB');
  await p.click('#btnKeyGo');
  await p.waitForTimeout(500);
  const A5 = await p.evaluate(() => !!document.querySelector('#mbody [data-tab="layout"]'));
  const adminKey = await p.evaluate(() => (window.__diag && window.__diag.getKB().cfg.adminKey) || '');

  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(600);
  const A6 = !(await p.isVisible('#gate'));

  const out = [
    ['1 首屏出现门禁遮罩', A1],
    ['2 未解锁时页面禁止滚动', bodyLocked === 'hidden'],
    ['3 错误密码仍被拦截', A2],
    ['4 错误密码给出提示', /不正确/.test(A2err)],
    ['5 正确密码可进入', A3],
    ['6 解锁后出现锁定按钮', A4],
    ['7 解锁后恢复滚动', overflowBack === ''],
    ['8 管理员新密钥 Ops2026#KB 通过', A5],
    ['9 知识库 adminKey 已更新', adminKey === 'Ops2026#KB'],
    ['10 记住本机：刷新免密', A6]
  ];
  let bad = 0;
  out.forEach(([k, v]) => { if (!v) bad++; console.log((v ? 'PASS ' : 'FAIL ') + k); });
  console.log('结果：' + (out.length - bad) + '/' + out.length + ' 通过');
  console.log('--- 运行错误 ---', errs.length ? errs.join('\n') : '无');
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
