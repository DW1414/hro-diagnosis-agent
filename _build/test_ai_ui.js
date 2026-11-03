/* AI 增强 · 融入报告版真实链路实测（页面 → 本地代理 → 模拟上游）+ 截图目检
   验收：AI 内容不再单独列出，直接融入报告；建议项标「知识库 / 大模型」出处。 */
const { chromium } = require('playwright-core');
const path = require('path');
const { spawn } = require('child_process');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'ops-diagnosis-agent.html').replace(/\\/g, '/');
const MOCK_PORT = 8899, PROXY_PORT = 8787;
const PY = process.env.PYTHON || 'python';
const res = [];
function ck(n, v, extra) { res.push([n, !!v]); console.log((v ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : '')); }
const wait = ms => new Promise(r => setTimeout(r, ms));

const TEXT = '走访客户：苏州精控电子有限公司。项目经理张伟经理介绍，现场一线员工流失率偏高，近三个月离职 28 人。'
  + '联系电话 13812345678。招聘交付不及时，客户多次投诉；考勤靠纸质签到，无系统留痕。'
  + '班组长李强反映排班不合理，加班时长超标。员工满意度下降，食堂与宿舍条件一般。';

(async () => {
  const env = Object.assign({}, process.env, { LLM_FORCE_TARGET: 'http://127.0.0.1:' + MOCK_PORT + '/v1' });
  const mock = spawn(PY, [path.join(__dirname, 'mock_llm.py'), String(MOCK_PORT)]);
  const proxy = spawn(PY, [path.join(__dirname, 'llm_proxy.py'), String(PROXY_PORT)], { env: env });
  await wait(1800);

  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  try {
    await p.goto(FILE, { waitUntil: 'load' });
    await wait(500);
    await p.fill('#gateIn', '__GATE_PW__');
    await p.click('#gateBtn');
    await wait(500);

    ck('1 悬浮球出现', await p.isVisible('#aiFab'));
    const onCls1 = await p.getAttribute('#aiFab', 'class');
    ck('2 初始未开启', (onCls1 || '').indexOf('on') < 0, onCls1);

    /* 录入并生成报告 */
    await p.fill('#mName', '华东智能制造外包项目');
    await p.fill('#tx', TEXT);
    await p.fill('#tx2', '客户：苏州精控电子有限公司；对接人：张伟经理。要求补员周期压缩到 7 天。');
    await p.click('#btnRun');
    await wait(2000);
    ck('3 报告已生成', (await p.textContent('#rptTag') || '').indexOf('分') >= 0);
    ck('4 未开启时报告无「大模型」标记', (await p.$$('#doc .srcTag.ai')).length === 0);
    ck('5 覆盖度面板无散落 AI 按钮', (await p.$$('[data-aigap]')).length === 0);
    ck('6 整改表无 AI 改写按钮', (await p.$$('#doc .aifix')).length === 0);

    /* 点悬浮球 → 配置并测试连接 */
    await p.click('#aiFab');
    await wait(400);
    ck('7 配置面板打开', await p.isVisible('#aiBase'));
    await p.selectOption('#aiPid', 'custom');
    await p.fill('#aiBase', 'http://127.0.0.1:' + PROXY_PORT + '/v1');
    await p.fill('#aiModel', 'mock-model');
    await p.fill('#aiKey', 'sk-ui-test');
    await p.check('#aiMask');
    await p.click('#aiTest');
    await wait(2500);
    const st = await p.textContent('#aiState');
    ck('8 测试连接成功（真实走代理）', (st || '').indexOf('连接成功') >= 0, st);
    await p.click('#aiSave');
    await wait(300);
    await p.screenshot({ path: path.join(__dirname, 'm_config.png') });

    /* 开启开关 → 静默融入报告 */
    await p.evaluate(() => {
      const el = document.getElementById('aiOn');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(5000);
    const td0 = await p.innerHTML('#doc tr[data-fx="0"] td:nth-child(3)');
    ck('9 整改行动项已换成大模型版并标出处', td0.indexOf('大模型') >= 0 && td0.indexOf('离职预警台账') >= 0);
    ck('10 知识库原措施保留追溯', td0.indexOf('原措施') >= 0 && td0.indexOf('保留追溯') >= 0);
    ck('11 「【客户】」占位符已回填真实名', td0.indexOf('苏州精控电子有限公司') >= 0 && td0.indexOf('【客户】') < 0);
    const sumTxt = await p.innerHTML('#aiSumBox');
    ck('12 模块三融入 AI 归纳总结', sumTxt.indexOf('综合评估补充') >= 0 && sumTxt.indexOf('共性短板') >= 0);
    const tag = await p.textContent('#rptTag');
    ck('13 报告标签显示「已融合 AI 建议」', (tag || '').indexOf('已融合 AI 建议') >= 0, tag);
    ck('14 未单独弹出 AI 结果抽屉', !(await p.isVisible('#aidCpRpt')));
    const onCls2 = await p.getAttribute('#aiFab', 'class');
    ck('15 悬浮球转为开启态', (onCls2 || '').indexOf('on') >= 0);
    ck('16 整改表全部事项被大模型改写', (await p.$$('#doc tr[data-fx] .srcTag.ai')).length === (await p.evaluate(() => (window.__diag && window.__diag.fixes ? window.__diag.fixes() : []).length)),
      (await p.$$('#doc tr[data-fx] .srcTag.ai')).length + ' / ' + (await p.evaluate(() => (window.__diag && window.__diag.fixes ? window.__diag.fixes() : []).length)));

    /* 截图目检 */
    await p.locator('#doc tr[data-fx="0"]').screenshot({ path: path.join(__dirname, 'm_row.png') });
    await p.locator('#aiSumBox').screenshot({ path: path.join(__dirname, 'm_sum.png') });
    await p.locator('#doc').screenshot({ path: path.join(__dirname, 'm_fix.png') });

    /* 再次生成报告：应再次自动融入 */
    await p.keyboard.press('Escape');
    await wait(300);
    await p.click('#btnRun');
    await wait(6000);
    ck('17 重新生成报告自动再次融入', (await p.$$('#doc .srcTag.ai')).length >= 2
      && (await p.textContent('#rptTag') || '').indexOf('已融合 AI 建议') >= 0);
    await p.screenshot({ path: path.join(__dirname, 'm_auto.png'), fullPage: false });
  } finally {
    await b.close();
    proxy.kill(); mock.kill();
  }
  const bad = res.filter(r => !r[1]).length;
  console.log('结果：' + (res.length - bad) + '/' + res.length + ' 通过');
  console.log('--- 运行错误 ---', errs.length ? errs.join('\n') : '无');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
