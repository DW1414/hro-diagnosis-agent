/* 融入报告版干净截图：整改表双出处 + 模块三 AI 归纳 */
const { chromium } = require('playwright-core');
const PWD = require('./_pwd');
const path = require('path');
const { spawn } = require('child_process');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'ops-diagnosis-agent.html').replace(/\\/g, '/');
const MOCK_PORT = 8899, PROXY_PORT = 8788;
const PY = process.env.PYTHON || 'python';
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
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await p.goto(FILE, { waitUntil: 'load' });
    await wait(500);
    await p.fill('#gateIn', PWD);
    await p.click('#gateBtn');
    await wait(500);
    await p.fill('#mName', '华东智能制造外包项目');
    await p.fill('#tx', TEXT);
    await p.fill('#tx2', '客户：苏州精控电子有限公司；对接人：张伟经理。要求补员周期压缩到 7 天。');
    await p.click('#btnRun');
    await wait(1500);
    await p.click('#aiFab');
    await wait(300);
    await p.selectOption('#aiPid', 'custom');
    await p.fill('#aiBase', 'http://127.0.0.1:' + PROXY_PORT + '/v1');
    await p.fill('#aiModel', 'mock-model');
    await p.fill('#aiKey', 'sk-ui-test');
    await p.check('#aiMask');
    await p.click('#aiSave');
    await wait(300);
    await p.evaluate(() => {
      const el = document.getElementById('aiOn');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(5000);
    await p.keyboard.press('Escape');
    await wait(400);
    await p.locator('#doc tr[data-fx="0"]').scrollIntoViewIfNeeded();
    await wait(300);
    await p.locator('#doc tr[data-fx="0"]').screenshot({ path: path.join(__dirname, 'm_row.png') });
    await p.locator('#doc tr[data-fx="1"]').screenshot({ path: path.join(__dirname, 'm_row2.png') });
    await p.locator('#aiSumBox').scrollIntoViewIfNeeded();
    await wait(300);
    await p.locator('#aiSumBox').screenshot({ path: path.join(__dirname, 'm_sum.png') });
    await p.locator('#rptTag').scrollIntoViewIfNeeded();
    await wait(300);
    await p.screenshot({ path: path.join(__dirname, 'm_tag.png') });
    console.log('shots done');
  } finally {
    await b.close(); proxy.kill(); mock.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
