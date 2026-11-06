/* 管理员密钥哈希化 + 半自动发版（导出种子）回归
   验收口径（主人 2026-11-06 定，甲方案）：
     ① 页面源码 / 导出 MD / 导出种子 中均不得出现明文密钥
     ② 旧版本机存过明文的，启动时自动转哈希且原密钥仍可用（不锁死主人）
     ③ 后台可重设密钥、可导出 01_seed.js 供发版                              */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { JSDOM } = require('jsdom');
const AK = require('./_ak');
const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'ops-diagnosis-agent.html'), 'utf8');
const URL = 'https://local.test/';
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

const res = [];
function ck(n, v, extra) { res.push([n, !!v]); console.log((v ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : '')); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function mk(before) {
  return new JSDOM(HTML, { url: URL, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: before || function () {} });
}

(async () => {
  /* —— 1. 哈希实现与 node crypto 对拍（UTF-8 / 跨块长度） —— */
  const d1 = mk(); await wait(700);
  const w1 = d1.window, D1 = w1.document;
  const cases = ['', 'abc', AK, '中文密钥测试', 'x'.repeat(200)];
  ck('1 SHA-256 实现与 node 一致', cases.every(s => w1.__sha256(s) === sha(s)));

  /* —— 2. 种子只存哈希，源码无明文 —— */
  const kb1 = w1.__diag.getKB();
  ck('2 种子存的是哈希', kb1.cfg.adminKeyHash === sha(AK), String(kb1.cfg.adminKeyHash).slice(0, 12) + '…');
  ck('3 种子里没有明文字段', kb1.cfg.adminKey === undefined);
  ck('4 页面源码不含明文密钥', HTML.indexOf(AK) < 0);

  /* —— 3. 登录校验 —— */
  D1.getElementById('btnAdmin').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(300);
  ck('5 弹出密钥验证', !!D1.getElementById('adminKeyIn'));
  D1.getElementById('adminKeyIn').value = 'wrong-key';
  D1.getElementById('btnKeyGo').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(250);
  ck('6 错误密钥被拒', !!D1.getElementById('adminKeyIn'));
  D1.getElementById('adminKeyIn').value = AK;
  D1.getElementById('btnKeyGo').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(350);
  ck('7 正确密钥可进后台', !!D1.querySelector('#mbody [data-tab="meta"]'));

  /* —— 4. 导出 MD / 导出种子均不含明文 —— */
  const vols = w1.__diag.mdVols();
  const v00 = vols[0][1];
  ck('8 导出 MD 不含明文密钥', v00.indexOf(AK) < 0 && /不随文档导出/.test(v00));
  const seedTxt = w1.__diag.seedText();
  ck('9 导出种子不含明文密钥', seedTxt.indexOf(AK) < 0);
  let parsed = null, okParse = false;
  try {
    const ctx = { window: {} };
    require('vm').createContext(ctx);
    require('vm').runInContext(seedTxt, ctx);
    parsed = ctx.window.__KB_SEED__; okParse = !!parsed;
  } catch (e) { okParse = false; }
  ck('10 导出种子语法合法可回灌', okParse && parsed.meta && parsed.meta.ver && parsed.cfg.adminKeyHash === sha(AK));
  ck('11 导出种子保留结构版本', okParse && Number(parsed.meta.schema) === 1);
  ck('12 导出种子带全量分区', okParse && parsed.aspects.length === 5 && parsed.tags.length === 8
    && parsed.score.rows.length === 17 && (parsed.guide || '').length > 2000);

  /* —— 5. 后台重设密钥：旧钥失效 / 新钥可用 —— */
  const NEWK = 'Qa7#kb-2026';
  D1.querySelector('#mbody [data-tab="meta"]').click();
  await wait(200);
  ck('13 概览页有密钥重设与导出种子入口', !!D1.getElementById('akSet') && !!D1.getElementById('btnSeed'));
  D1.getElementById('akNew').value = NEWK;
  D1.getElementById('akSet').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(300);
  const kb2 = w1.__diag.getKB();
  ck('14 重设后只存新哈希', kb2.cfg.adminKeyHash === sha(NEWK) && kb2.cfg.adminKey === undefined);
  /* 另开一个页面（带入刚保存的本机知识库），验证旧钥失效 / 新钥可用 */
  const stored = w1.localStorage.getItem('opsdiag.kb.v2');
  const d3 = mk(w => { try { w.localStorage.setItem('opsdiag.kb.v2', stored); } catch (e) {} });
  await wait(800);
  const w3 = d3.window, D3 = w3.document;
  D3.getElementById('btnAdmin').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  await wait(300);
  D3.getElementById('adminKeyIn').value = AK;
  D3.getElementById('btnKeyGo').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  await wait(280);
  ck('15 旧密钥已失效', !!D3.getElementById('adminKeyIn'));
  D3.getElementById('adminKeyIn').value = NEWK;
  D3.getElementById('btnKeyGo').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  await wait(320);
  ck('16 新密钥可进入', !!D3.querySelector('#mbody [data-tab="meta"]'));

  /* —— 6. 旧版明文迁移：预置含 adminKey 的本机知识库 —— */
  const oldKB = JSON.parse(JSON.stringify(kb1));
  oldKB.cfg.adminKey = 'LegacyPass#1'; delete oldKB.cfg.adminKeyHash;
  const d2 = mk(w => { try { w.localStorage.setItem('opsdiag.kb.v2', JSON.stringify(oldKB)); } catch (e) {} });
  await wait(900);
  const w2 = d2.window, D2 = w2.document, kb3 = w2.__diag.getKB();
  ck('17 旧明文作废，密钥回落到种子', kb3.cfg.adminKeyHash === sha(AK));
  ck('18 明文已从本机删除', kb3.cfg.adminKey === undefined);
  ck('19 本机存储里也无明文', (w2.localStorage.getItem('opsdiag.kb.v2') || '').indexOf('LegacyPass#1') < 0);
  D2.getElementById('btnAdmin').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(250);
  D2.getElementById('adminKeyIn').value = 'LegacyPass#1';
  D2.getElementById('btnKeyGo').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(300);
  ck('20 原明文密钥已失效', !!D2.getElementById('adminKeyIn'));
  D2.getElementById('adminKeyIn').value = AK;
  D2.getElementById('btnKeyGo').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(320);
  ck('21 种子密钥在本机可登录', !!D2.querySelector('#mbody [data-tab="meta"]'));

  const bad = res.filter(r => !r[1]).length;
  console.log('结果：' + (res.length - bad) + '/' + res.length + ' 通过');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
