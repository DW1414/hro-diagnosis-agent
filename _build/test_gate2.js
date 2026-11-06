/* 门禁 + 管理员密钥 E2E（jsdom） */
const fs = require('fs');
const PWD = require('./_pwd');
const path = require('path');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'ops-diagnosis-agent.html'), 'utf8');
const PW = PWD;
const AK = require('./_ak');   /* 管理员密钥从种子正则读取，不落明文 */
const OK = 2877810214;
const URL = 'https://local.test/';

function mk(before) {
  return new JSDOM(HTML, {
    url: URL, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse: before || function () {}
  });
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
const res = [];
function ck(name, v) { res.push([name, !!v]); }

(async () => {
  // —— 场景1：首次访问 ——
  const d1 = mk();
  await wait(600);
  const w1 = d1.window, D1 = w1.document;
  const g1 = D1.getElementById('gate');
  ck('1 首屏出现门禁遮罩', g1 && g1.style.display !== 'none');
  ck('2 未解锁时页面禁止滚动', D1.documentElement.style.overflow === 'hidden');
  // 错误密码
  D1.getElementById('gateIn').value = 'wrongpass';
  D1.getElementById('gateBtn').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(100);
  ck('3 错误密码仍被拦截', g1.style.display !== 'none');
  ck('4 错误密码给出提示', /不正确/.test(D1.getElementById('gateErr').textContent));
  // 正确密码
  D1.getElementById('gateIn').value = PW;
  D1.getElementById('gateBtn').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(200);
  ck('5 正确密码可进入', g1.style.display === 'none');
  ck('6 解锁后出现锁定按钮', !!D1.getElementById('glock'));
  ck('7 解锁后恢复滚动', D1.documentElement.style.overflow === '');
  ck('8 已写入本机记住凭证', JSON.parse(w1.localStorage.getItem('opsdiag.gate') || '{}').v === OK);
  ck('9 哈希函数可用', w1.__gate && w1.__gate.hash(PW) === OK);

  // —— 场景2：管理员新密钥 ——
  const kb = w1.__diag && w1.__diag.getKB();
  ck('10 知识库 adminKey 已更新', kb && kb.cfg.adminKey === AK);
  D1.getElementById('btnAdmin').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(300);
  const keyIn = D1.getElementById('adminKeyIn');
  ck('11 弹出管理员密钥验证', !!keyIn);
  if (keyIn) {
    keyIn.value = AK;
    D1.getElementById('btnKeyGo').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
    await wait(300);
    ck('12 新密钥验证通过进后台', !!D1.querySelector('#mbody [data-tab="layout"]'));
  }
  // 旧密钥应失效
  const d2 = mk(); await wait(500);
  const w2 = d2.window, D2 = w2.document;
  D2.getElementById('gateIn').value = PW;
  D2.getElementById('gateBtn').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(200);
  D2.getElementById('btnAdmin').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(300);
  const k2 = D2.getElementById('adminKeyIn');
  if (k2) {
    k2.value = 'hro2026';
    D2.getElementById('btnKeyGo').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
    await wait(300);
    ck('13 旧密钥 hro2026 已失效', !D2.querySelector('#mbody [data-tab="layout"]'));
  }

  // —— 场景3：记住本机后免密 ——
  const d3 = mk(function (w) {
    w.localStorage.setItem('opsdiag.gate', JSON.stringify({ v: OK, t: Date.now() }));
  });
  await wait(600);
  const g3 = d3.window.document.getElementById('gate');
  ck('14 记住本机后免密直达', g3 && g3.style.display === 'none');

  // —— 场景4：凭证过期需重新验证 ——
  const d4 = mk(function (w) {
    w.localStorage.setItem('opsdiag.gate', JSON.stringify({ v: OK, t: Date.now() - 8 * 86400000 }));
  });
  await wait(600);
  const g4 = d4.window.document.getElementById('gate');
  ck('15 超过 7 天凭证失效', g4 && g4.style.display !== 'none');

  let bad = 0;
  res.forEach(([n, v]) => { if (!v) bad++; console.log((v ? 'PASS ' : 'FAIL ') + n); });
  console.log('结果：' + (res.length - bad) + '/' + res.length + ' 通过');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
