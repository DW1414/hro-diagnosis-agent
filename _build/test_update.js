/* 云端热更新 + 回滚端到端测试（本地 http server 模拟 GitHub Pages）
   覆盖：① 版本一致时不打扰 ② 新版本出现更新浮条 ③ 立即更新带 ?v= 穿透缓存
        ④ ?pin= 跳转历史版本并显示横幅 ⑤ file:// 静默不报错 ⑥ 自动更新仅在空闲时执行 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PY = process.env.PYTHON || 'python';
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const PORT = 8901;
const BASE = 'http://127.0.0.1:' + PORT + '/';
const res = [];
function ck(n, v, extra) { res.push([n, !!v]); console.log((v ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : '')); }
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  /* 用临时副本做站点，避免污染真实 docs/version.json */
  const tmp = path.join(ROOT, '_build', '_site_test');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(DOCS, tmp, { recursive: true });

  const srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: tmp });
  await wait(1600);

  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  try {
    /* ① 版本一致：不应弹更新条 */
    await p.goto(BASE, { waitUntil: 'load' });
    await wait(600);
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(3200);
    ck('1 页面注入程序版本号', (await p.textContent('#appVer') || '').indexOf('程序 v') >= 0,
      await p.textContent('#appVer'));
    ck('2 版本一致时不弹更新条', !(await p.isVisible('#huBar')));
    const st0 = await p.evaluate(() => window.__hu.state());
    ck('3 状态为 current', st0.state === 'current', JSON.stringify(st0.state));

    /* ② 模拟新版本：改 version.json 的 build */
    const vpath = path.join(tmp, 'version.json');
    const vj = JSON.parse(fs.readFileSync(vpath, 'utf8'));
    const oldBuild = vj.build;
    vj.build = 'feedbeef12345678';
    vj.ver = '2.3.1';
    vj.notes = '测试：修复整改表措施待补充行的 AI 覆盖';
    fs.writeFileSync(vpath, JSON.stringify(vj, null, 2));

    await p.reload({ waitUntil: 'load' });
    await wait(600);
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(3600);
    ck('4 检测到新版本并弹出更新条', await p.isVisible('#huBar'));
    const barTxt = await p.textContent('#huBar');
    ck('5 更新条显示新版本号与说明', barTxt.indexOf('v2.3.1') >= 0 && barTxt.indexOf('AI 覆盖') >= 0, barTxt.slice(0, 60));
    await p.screenshot({ path: path.join(__dirname, 'hu_bar.png') });

    /* ③ 稍后：记住跳过，重载后不再打扰 */
    await p.click('#huNo');
    await wait(300);
    ck('6 点稍后关闭更新条', !(await p.isVisible('#huBar')));
    await p.reload({ waitUntil: 'load' });
    await wait(600);
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(3600);
    ck('7 已跳过的版本不再提示', !(await p.isVisible('#huBar')));

    /* ④ 立即更新：URL 带 ?v=新build */
    await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('opsdiag.hu') || '{}'); c.skip = ''; localStorage.setItem('opsdiag.hu', JSON.stringify(c)); });
    await p.reload({ waitUntil: 'load' });
    await wait(600);
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(3600);
    await p.click('#huGo');
    await wait(900);
    ck('8 立即更新跳转带 ?v= 新指纹', p.url().indexOf('v=feedbeef12345678') >= 0, p.url());

    /* ⑤ ?pin= 回滚到历史版本 */
    await p.goto(BASE + '?pin=REL-011_v2.2.5', { waitUntil: 'load' });
    await wait(1200);
    ck('9 ?pin= 自动跳转到历史版本目录', /releases\/REL-011_v2\.2\.5\//.test(p.url()), p.url());
    await wait(600);
    const pinVisible = await p.isVisible('#huPin');
    ck('10 历史版本页显示回滚横幅', pinVisible);
    const pinTxt = await p.textContent('#huPin');
    ck('11 横幅含版本号与回到最新入口', pinTxt.indexOf('REL-011') >= 0 && pinTxt.indexOf('回到最新版') >= 0);
    await p.screenshot({ path: path.join(__dirname, 'hu_pin.png') });

    /* ⑥ 回到最新版 */
    await p.click('#huPinBack');
    await wait(1200);
    ck('12 回到最新版路径正确', !/\/releases\//.test(p.url()), p.url());

    /* ⑦ 不存在的 pin：提示而不是 404 */
    await p.goto(BASE + '?pin=REL-999', { waitUntil: 'load' });
    await wait(1600);
    const t2 = await p.textContent('#huPin').catch(() => '');
    ck('13 不存在的版本给出提示', (t2 || '').indexOf('未找到') >= 0 || (t2 || '').indexOf('不可达') >= 0, t2);

    /* ⑧ 自动更新开关：空闲时自动刷新（用 localStorage 预置） */
    await p.goto(BASE, { waitUntil: 'load' });
    await wait(500);
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(3600);
    await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('opsdiag.hu') || '{}'); c.skip = ''; c.auto = true; localStorage.setItem('opsdiag.hu', JSON.stringify(c)); });
    await wait(400);
    await p.reload({ waitUntil: 'load' });
    await wait(600);
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(4200);
    ck('14 开启自动更新且输入为空 → 自动跳转新版', p.url().indexOf('v=feedbeef12345678') >= 0, p.url());

    /* ⑨ file:// 静默：不发请求、不报错 */
    const p2 = await ctx.newPage();
    const ferrs = [];
    p2.on('pageerror', e => ferrs.push(e.message));
    await p2.goto('file:///' + path.join(ROOT, 'ops-diagnosis-agent.html').replace(/\\/g, '/'), { waitUntil: 'load' });
    await wait(3000);
    ck('15 file:// 打开不弹更新条且不报错', !(await p2.isVisible('#huBar')) && ferrs.length === 0, ferrs.join(';'));
    const stf = await p2.evaluate(() => window.__hu.state());
    ck('16 file:// 判定为离线模式', stf.file === true, JSON.stringify(stf.file));
  } finally {
    await b.close();
    srv.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const bad = res.filter(r => !r[1]).length;
  console.log('结果：' + (res.length - bad) + '/' + res.length + ' 通过');
  console.log('--- 运行错误 ---', errs.length ? errs.join('\n') : '无');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
