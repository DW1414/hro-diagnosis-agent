/* 定向截图：措施待补充（数字化 D1/D2）行在 AI 融入前后的对比 */
const { chromium } = require('playwright-core');
const PWD = require('./_pwd');
const path = require('path');
const { spawn } = require('child_process');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'ops-diagnosis-agent.html').replace(/\\/g, '/');
const MOCK_PORT = 8899, PROXY_PORT = 8789;
const PY = process.env.PYTHON || 'python';
const wait = ms => new Promise(r => setTimeout(r, ms));
const TEXT = '走访客户：苏州精控电子有限公司。项目经理张伟经理介绍，现场一线员工流失率偏高，近三个月离职 28 人。'
  + '联系电话 13812345678。招聘交付不及时，客户多次投诉；考勤靠纸质签到，无系统留痕，打卡数据需人工汇总，'
  + '缺勤率统计不及时；数字化看板缺失，数据散落在各班长个人表格，一线工时数据不准确。'
  + '另外：车间叉车通道有货物占用，安全通道标线不清晰；来料检验有漏检，客户反馈批量质量异常两起；'
  + '物料损耗没有台账，月度成本超支无法归因；排班靠班长口头安排，加班时长超标；'
  + '宿舍热水供应不稳定，员工投诉多次；新员工入职培训只有半天就上岗，技能不达标返工多；'
  + '安全培训签到表有代签现象，应急演练一年没搞过。';
(async () => {
  const env = Object.assign({}, process.env, { LLM_FORCE_TARGET: 'http://127.0.0.1:' + MOCK_PORT + '/v1' });
  const mock = spawn(PY, [path.join(__dirname, 'mock_llm.py'), String(MOCK_PORT)]);
  const proxy = spawn(PY, [path.join(__dirname, 'llm_proxy.py'), String(PROXY_PORT)], { env: env });
  await wait(1800);
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  try {
    await p.goto(FILE, { waitUntil: 'load' });
    await wait(500);
    await p.fill('#gateIn', PWD);
    await p.click('#gateBtn');
    await wait(500);
    await p.fill('#mName', '华东智能制造外包项目');
    await p.fill('#tx', TEXT);
    await p.fill('#tx2', '客户：苏州精控电子有限公司；对接人：张伟经理。');
    await p.click('#btnRun');
    await wait(1800);
    const dtRow0 = p.locator('#doc tr[data-fx]', { hasText: '数字化' }).first();
    await dtRow0.scrollIntoViewIfNeeded(); await wait(250);
    await dtRow0.screenshot({ path: path.join(__dirname, 'dt_before.png') });
    const beforeHtml = await dtRow0.innerHTML();
    console.log('BEFORE pending:', beforeHtml.indexOf('措施待补充') >= 0);

    await p.click('#aiFab'); await wait(300);
    await p.selectOption('#aiPid', 'custom');
    await p.fill('#aiBase', 'http://127.0.0.1:' + PROXY_PORT + '/v1');
    await p.fill('#aiModel', 'mock-model');
    await p.fill('#aiKey', 'sk-ui-test');
    await p.check('#aiMask');
    await p.click('#aiSave'); await wait(300);
    await p.evaluate(() => {
      const el = document.getElementById('aiOn');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(5000);
    await p.keyboard.press('Escape'); await wait(300);
    const dtRow1 = p.locator('#doc tr[data-fx]', { hasText: '数字化' }).first();
    await dtRow1.scrollIntoViewIfNeeded(); await wait(250);
    await dtRow1.screenshot({ path: path.join(__dirname, 'dt_after.png') });
    const html = await dtRow1.innerHTML();
    console.log('AFTER has AI tag:', html.indexOf('大模型') >= 0,
      '| has no-card note:', html.indexOf('暂无对应措施卡') >= 0,
      '| has act:', html.indexOf('考勤') >= 0);
    console.log('still pending?', html.indexOf('措施待补充') >= 0);
  } finally { await b.close(); proxy.kill(); mock.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
