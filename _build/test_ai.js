/* AI 增强 · 融入报告版 E2E（jsdom）
   验收口径（主人 2026-10-27 定）：AI 结果不再单独列出，直接体现在诊断报告中；
   建议项前方标注「知识库」/「大模型」两个出处；成功静默、失败才报错。 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'ops-diagnosis-agent.html'), 'utf8');
const URL = 'https://local.test/';
const res = [];
function ck(n, v, extra) { res.push([n, !!v]); console.log((v ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : '')); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

let MODE = 'ok', CALLS = [];
const GATE_OK = 2877810214;
const TEXT = '走访客户：苏州精控电子有限公司。项目经理张伟经理介绍，现场一线员工流失率偏高，近三个月离职 28 人。'
  + '联系电话 13812345678。招聘交付不及时，客户多次投诉；考勤靠纸质签到，无系统留痕。'
  + '班组长李强反映排班不合理，加班时长超标。员工满意度下降，食堂与宿舍条件一般。';
const GAP_JSON = JSON.stringify({
  items: [{
    code: 'A1', has: true, clue: '【客户】现场一线员工流失率偏高',
    ask: '近三个月离职 28 人中，主动离职与被动离职各多少？', evidence: '调取离职台账与离职访谈记录'
  }, {
    code: 'B1', has: false, clue: '', ask: '关键岗位补员周期实际是多少天？', evidence: '查看招聘需求表与到岗记录'
  }]
});
const RW_JSON = JSON.stringify({
  fixes: [{ i: 0, items: [
    { act: '【项目】建立离职预警台账：班组长每周上报在岗与离职意向', accept: '连续 4 周台账完整、预警准确率≥80%' }] },
  { i: 1, items: [
    { act: '【项目】考勤电子打卡替换纸质签到，班长每日核对异常', accept: '连续 30 天打卡率≥98%' }] }],
  summary: '共性短板两条主线：一是人员稳定性，【客户】现场一线流失集中在入职三个月内并传导为交付压力；'
    + '二是过程数据留痕薄弱。建议先建台账与电子打卡两条最小闭环，再谈排班与加班治理。'
});

function fetchStub(url, opt) {
  if (String(url).indexOf('version.json') >= 0) {
    /* 热更新模块的版本检查：与 AI 调用计数隔离 */
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  }
  CALLS.push({ url: url, body: opt && opt.body });
  if (MODE === 'cors') return Promise.reject(new TypeError('Failed to fetch'));
  if (MODE === '401') return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
  let content = GAP_JSON;
  const b = (opt && opt.body) || '';
  if (b.indexOf('整改事项清单') >= 0) content = RW_JSON;
  else if (b.indexOf('只回复两个字') >= 0) content = '正常';
  else if (b.indexOf('【我的问题】') >= 0) content = '根据材料，流失集中在入职 3 个月内（材料未体现具体比例）。';
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: content } }] }) });
}

(async () => {
  const dom = new JSDOM(HTML, {
    url: URL, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse: function (w) {
      w.localStorage.setItem('opsdiag.gate', JSON.stringify({ v: GATE_OK, t: Date.now() }));
      w.localStorage.setItem('opsdiag.llm', JSON.stringify({
        on: false, pid: 'deepseek', base: 'http://127.0.0.1:8787/v1',
        key: 'sk-test-abc', model: 'deepseek-chat', temp: 0.3, timeout: 60, mask: true
      }));
      w.fetch = fetchStub;
    }
  });
  const w = dom.window, D = w.document;
  await wait(700);
  const llm = w.__llm;
  ck('1 AI 模块已加载', !!llm && !!llm.maybeAuto);
  ck('2 悬浮球已创建', !!D.getElementById('aiFab'));
  ck('3 悬浮球初始为未开启态', !D.getElementById('aiFab').classList.contains('on'));

  /* 录入并生成报告（AI 未开启 → 不调用、报告无 AI 痕迹） */
  D.getElementById('mName').value = '华东智能制造外包项目';
  D.getElementById('tx').value = TEXT;
  D.getElementById('tx2').value = '客户：苏州精控电子有限公司；对接人：张伟经理。';
  D.getElementById('btnRun').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(1200);
  const doc0 = D.getElementById('doc') || D.body;
  ck('4 未开启时生成报告零 AI 调用', CALLS.length === 0, CALLS.length + ' 次');
  ck('5 报告内无「大模型」出处标记', doc0.querySelectorAll('.srcTag.ai').length === 0);
  ck('6 模块三 AI 归纳容器为空', (D.getElementById('aiSumBox') || {}).innerHTML === '');
  ck('7 知识库建议已标「知识库」出处', doc0.querySelectorAll('.srcTag.kb').length > 0);

  /* 散落小按钮已全部退役 */
  ck('8 覆盖度面板无单项/批量 AI 按钮', D.querySelectorAll('[data-aigap]').length === 0
    && !D.getElementById('btnAiGapAll') && !D.getElementById('btnAiAsk'));
  ck('9 整改表无 AI 改写按钮', D.querySelectorAll('#doc .aifix').length === 0);

  /* 脱敏 */
  const mk = llm.mask(TEXT);
  ck('10 客户名/人名/手机号已脱敏', mk.text.indexOf('苏州精控') < 0 && mk.text.indexOf('张伟') < 0
    && mk.text.indexOf('13812345678') < 0 && mk.text.indexOf('【客户】') >= 0 && mk.text.indexOf('【人名】') >= 0);
  ck('11 泛称未被误伤', mk.text.indexOf('项目经理') >= 0);

  /* 悬浮球 → 配置面板 */
  D.getElementById('aiFab').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(200);
  ck('12 点击悬浮球打开配置面板', !!D.getElementById('aiBase') && !!D.getElementById('aiOn'));
  ck('13 面板含测试/保存/忘记/立即诊断/追问', !!D.getElementById('aiTest') && !!D.getElementById('aiSave')
    && !!D.getElementById('aiForget') && !!D.getElementById('aiNow') && !!D.getElementById('aiAskBtn'));

  /* 开启开关：已有报告 → 立即融入（静默，写入报告本体） */
  const tagBase = (D.getElementById('rptTag') || {}).textContent || '';
  D.getElementById('aiOn').checked = true;
  D.getElementById('aiOn').dispatchEvent(new w.Event('change', { bubbles: true }));
  await wait(500);
  ck('14 开启即自动执行（补检 + 改写归纳 两次调用）', CALLS.length === 2, CALLS.length + ' 次');
  ck('15 发出内容不含客户名', CALLS.every(c => (c.body || '').indexOf('苏州精控电子有限公司') < 0));
  ck('16 发出内容不含手机号', CALLS.every(c => (c.body || '').indexOf('13812345678') < 0));

  const row0 = doc0.querySelector('tr[data-fx="0"]');
  const tdAct = row0 && row0.children[2] ? row0.children[2].innerHTML : '';
  ck('17 整改行动项已原位替换为大模型版', tdAct.indexOf('srcTag ai') >= 0 && tdAct.indexOf('大模型') >= 0
    && tdAct.indexOf('离职预警台账') >= 0);
  ck('18 同格保留知识库原措施追溯', tdAct.indexOf('srcTag kb') >= 0 && tdAct.indexOf('原措施') >= 0
    && tdAct.indexOf('保留追溯') >= 0);
  ck('19 占位符已回填真实名', tdAct.indexOf('华东智能制造外包项目') >= 0 && tdAct.indexOf('【项目】') < 0);

  const sum = (D.getElementById('aiSumBox') || {}).innerHTML || '';
  ck('20 模块三已融入 AI 归纳总结', sum.indexOf('综合评估补充') >= 0 && sum.indexOf('共性短板') >= 0
    && sum.indexOf('srcTag ai') >= 0);

  /* 全量覆盖（主人 2026-10-27 定）：AI 覆盖行数应等于事项总数（不再只取前 8 条） */
  const fixesLen = (w.__diag && w.__diag.fixes ? w.__diag.fixes() : []).length;
  const aiRows = doc0.querySelectorAll('tr[data-fx] .srcTag.ai').length;
  ck('20b AI 全量覆盖所有事项', aiRows === Math.min(fixesLen, 30),
    '覆盖 ' + aiRows + ' / 事项 ' + fixesLen);

  ck('21 不再单独生成 AI 结果抽屉', !D.getElementById('aidCpRpt'));
  ck('22 悬浮球转为开启态', D.getElementById('aiFab').classList.contains('on'));

  const tagNow = (D.getElementById('rptTag') || {}).textContent || '';
  ck('23 报告标签显示「已融合 AI 建议」且分值不变', tagNow.indexOf('已融合 AI 建议') >= 0
    && tagNow.indexOf(tagBase) === 0, '[' + tagNow + ']');

  /* 覆盖度面板追问行切换为大模型版并注明知识库原追问 */
  await wait(200);
  const cvRow = D.querySelector('[data-cv="A1"]');
  const cvBox = cvRow ? cvRow.parentNode.parentNode : null;
  const cvHtml = cvBox ? cvBox.innerHTML : '';
  ck('24 覆盖度追问标注「大模型」并保留知识库原追问', cvHtml.indexOf('cvTag ai') >= 0
    && cvHtml.indexOf('知识库原追问') >= 0, cvHtml ? '' : '(未取到面板 DOM)');

  /* 关闭开关 → 立即诊断被拦 */
  llm.openConfig();
  await wait(200);
  D.getElementById('aiOn').checked = false;
  D.getElementById('aiOn').dispatchEvent(new w.Event('change', { bubbles: true }));
  await wait(200);
  D.getElementById('aiNow').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(200);
  ck('25 未开启时「立即诊断」被拦', (D.getElementById('aiState').textContent || '').indexOf('开关') >= 0);

  /* 错误处理：只有失败才弹窗 */
  llm.openConfig();
  await wait(200);
  D.getElementById('aiOn').checked = true;
  D.getElementById('aiOn').dispatchEvent(new w.Event('change', { bubbles: true }));
  await wait(150);
  MODE = 'cors'; CALLS = [];
  llm.autoDiagnose();
  await wait(300);
  ck('26 跨域报错给出可执行指引', (D.getElementById('aidBody').innerHTML || '').indexOf('llm_proxy.py') >= 0);
  MODE = '401'; CALLS = [];
  llm.autoDiagnose();
  await wait(300);
  ck('27 401 提示密钥问题', (D.getElementById('aidBody').innerHTML || '').indexOf('密钥') >= 0);
  ck('28 失败后报告标签回滚不带 AI 后缀', ((D.getElementById('rptTag') || {}).textContent || '').indexOf('AI 增强中') < 0);
  MODE = 'ok';

  /* 后台已无 AI 页签 */
  D.getElementById('btnAdmin').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(300);
  D.getElementById('adminKeyIn').value = 'Ops2026#KB';
  D.getElementById('btnKeyGo').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(300);
  ck('29 管理员后台已无 AI 页签', !D.querySelector('#mbody [data-tab="ai"]'));
  D.getElementById('btnClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  /* 忘记密钥 */
  llm.openConfig();
  await wait(200);
  D.getElementById('aiForget').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(150);
  ck('30 忘记密钥清空并停用', llm.cfg().key === '' && llm.cfg().on === false);

  const bad = res.filter(r => !r[1]).length;
  console.log('结果：' + (res.length - bad) + '/' + res.length + ' 通过');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
