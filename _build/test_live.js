/* 线上站点验收：门禁 → 版本号 → 热更状态 → 截图 */
const { chromium } = require('playwright-core');
const PWD = require('./_pwd');
const path = require('path');
const fs = require('fs');
const BASE = 'https://dw1414.github.io/hro-diagnosis-agent/';
/* 版本断言改为自动读取，避免每次发版改测试 */
const APPV = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').split(/\r?\n/)[0].trim();
const KBV = (fs.readFileSync(path.join(__dirname, '01_seed.js'), 'utf8')
  .match(/"ver"\s*:\s*"([^"]*)"/) || [])[1] || '';
const res = [];
function ck(n, v, extra) { res.push([n, !!v]); console.log((v ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : '')); }
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  try {
    await p.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await wait(800);
    ck('1 线上页面打开（门禁出现）', await p.isVisible('#gateIn'));
    await p.fill('#gateIn', PWD);
    await p.click('#gateBtn');
    await wait(1200);
    ck('2 门禁解锁成功', await p.isVisible('#mName'));
    const appVer = await p.textContent('#appVer');
    ck('3 页面显示程序版本号', (appVer || '').indexOf('程序 v' + APPV) >= 0, appVer);
    const kbVer = await p.textContent('#kbVer');
    ck('4 知识库版本正确', (kbVer || '').indexOf(KBV) >= 0, kbVer);
    await wait(3000);
    const st = await p.evaluate(() => window.__hu.state());
    ck('5 热更状态=已是最新（不打扰）', st.state === 'current', JSON.stringify(st.state));
    ck('6 未弹更新条', !(await p.isVisible('#huBar')));
    await p.screenshot({ path: path.join(__dirname, 'live_online.png') });

    /* 安全冒烟：线上页面源码里不得出现门禁明文口令 */
    const src = await p.content();
    ck('8 页面源码不含门禁明文', !PWD || src.indexOf(PWD) < 0);
    const AKV = require('./_ak');
    ck('9 页面源码不含管理员密钥明文', !AKV || src.indexOf(AKV) < 0);

    /* 冒烟：跑一份真实报告，确认线上程序可用 */
    await p.fill('#mName', '线上验收项目');
    await p.fill('#tx', '走访客户：某电子厂。一线员工流失率高，近三个月离职 28 人。招聘交付不及时，客户投诉；考勤靠纸质签到，无系统留痕。');
    await p.click('#btnRun');
    await wait(2500);
    const tag = await p.textContent('#rptTag');
    ck('7 线上可正常生成报告', (tag || '').indexOf('分') >= 0, tag);
    await p.screenshot({ path: path.join(__dirname, 'live_report.png') });
  } finally {
    await b.close();
  }
  const bad = res.filter(r => !r[1]).length;
  console.log('结果：' + (res.length - bad) + '/' + res.length + ' 通过');
  console.log('--- 运行错误 ---', errs.length ? errs.join('\n') : '无');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
