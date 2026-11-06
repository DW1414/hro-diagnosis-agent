/* 线上站点验收：门禁 → 版本号 → 热更状态 → 截图 */
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = 'https://dw1414.github.io/hro-diagnosis-agent/';
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
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(1200);
    ck('2 门禁解锁成功', await p.isVisible('#mName'));
    const appVer = await p.textContent('#appVer');
    ck('3 页面显示程序版本号', (appVer || '').indexOf('程序 v2.3.0') >= 0, appVer);
    const kbVer = await p.textContent('#kbVer');
    ck('4 知识库版本正确', (kbVer || '').indexOf('2.2.5') >= 0, kbVer);
    await wait(3000);
    const st = await p.evaluate(() => window.__hu.state());
    ck('5 热更状态=已是最新（不打扰）', st.state === 'current', JSON.stringify(st.state));
    ck('6 未弹更新条', !(await p.isVisible('#huBar')));
    await p.screenshot({ path: path.join(__dirname, 'live_online.png') });

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
