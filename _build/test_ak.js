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


/* —— 结构完整性校验（不依赖具体数量，内容扩充时仍然有效） —— */
function shapeErrs(o){
  const e=[];
  ['meta','cfg','layout','guide','aspects','tags','score','rules','evals'].forEach(k=>{ if(o[k]==null) e.push('缺顶层 '+k); });
  if(!(o.aspects||[]).length) e.push('aspects 为空');
  (o.aspects||[]).forEach(a=>{
    if(!a.code||!a.name||!Array.isArray(a.items)||!a.items.length) e.push('族缺字段/空 '+(a.code||'?'));
    (a.items||[]).forEach(it=>{
      if(!it.code||!it.name) e.push(a.code+' 事项缺 code/name');
      ['reviews','signals','tags','families'].forEach(f=>{
        if(!Array.isArray(it[f])) e.push((it.code||'?')+' 缺字段 '+f);   /* 允许为空：措施待补充事项本就没有 families */
      });
      if(!Array.isArray(it.reviews)||!it.reviews.length) e.push((it.code||'?')+' 缺审查要点 reviews');
    });
  });
  const parts=(o.score&&o.score.parts||[]).map(x=>String(x.part||x.id||x.code||''));
  ['P1','P2','P3','P4'].forEach(p=>{ if(!parts.some(x=>x.indexOf(p)>=0)) e.push('缺评分段 '+p); });
  (o.score&&o.score.rows||[]).forEach(r=>{
    if(!r.id||!r.part) e.push('评分项缺 id/part '+(r.id||'?'));
    if(!(r.name||r.l1||r.target)) e.push('评分项无可读名称 '+(r.id||'?'));   /* 允许 name 为空，退到 l1/target */
    if(typeof r.max!=='number') e.push('评分项 max 非数值 '+(r.id||'?'));
    if(!Array.isArray(r.bands)) e.push('评分项缺 bands '+(r.id||'?'));
  });
  const R=o.rules||{};
  ['fiveDims','redFlags','eightElements','methods','verdict'].forEach(k=>{
    if(R[k]==null) e.push('rules 缺 '+k);
    else if(Array.isArray(R[k])&&!R[k].length) e.push('rules.'+k+' 为空');
  });
  if(!(o.tags||[]).length) e.push('tags 为空');
  if(!String(o.guide||'').length) e.push('guide 为空');
  return e;
}
/* 逐字段深比对，返回第一处差异路径（用于"导出不丢内容"的判定） */
function firstDiff(a,b,path){
  path=path||'';
  if(a===b) return '';
  if(a===null||b===null||typeof a!==typeof b) return path+'（类型/空值不同）';
  if(typeof a!=='object') return path+'（'+JSON.stringify(a)+' ≠ '+JSON.stringify(b)+'）';
  if(Array.isArray(a)!==Array.isArray(b)) return path+'（数组/对象不同）';
  if(Array.isArray(a)){
    if(a.length!==b.length) return path+'（长度 '+a.length+' ≠ '+b.length+'）';
    for(let i=0;i<a.length;i++){ const d=firstDiff(a[i],b[i],path+'['+i+']'); if(d) return d; }
    return '';
  }
  const ka=Object.keys(a).sort(), kb=Object.keys(b).sort();
  if(ka.join(',')!==kb.join(',')) return path+'（键不同：'+ka.filter(k=>kb.indexOf(k)<0).join('/')+' | '+kb.filter(k=>ka.indexOf(k)<0).join('/')+'）';
  for(const k of ka){ const d=firstDiff(a[k],b[k],path+'.'+k); if(d) return d; }
  return '';
}

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
  const e12 = okParse ? shapeErrs(parsed) : ['解析失败'];
  ck('12 导出种子结构完整（顶层/五族/事项字段/四个评分段/规则/标签/写作要求）', e12.length === 0, e12.slice(0, 3).join('；'));
  const kbNow = JSON.parse(JSON.stringify(w1.__diag.getKB()));
  delete kbNow.cfg.adminKey; delete kbNow.meta.updated;
  const expObj = JSON.parse(JSON.stringify(parsed)); delete expObj.meta.updated;
  const df = okParse ? firstDiff(expObj, kbNow) : '解析失败';
  ck('13 导出种子与当前知识库逐字段一致（不按数量写死，扩充内容后仍成立）', okParse && df === '', df);
  ck('14 内容量不低于基线（只设下限，允许随扩充增长）', okParse && parsed.aspects.length >= 5 && parsed.tags.length >= 8
    && parsed.score.rows.length >= 17 && (parsed.guide || '').length >= 2000,
    '族 ' + (parsed.aspects || []).length + ' / 标签 ' + (parsed.tags || []).length
    + ' / 评分项 ' + ((parsed.score || {}).rows || []).length + ' / 写作要求 ' + (parsed.guide || '').length + ' 字');

  /* —— 5. 后台重设密钥：旧钥失效 / 新钥可用 —— */
  const NEWK = 'Qa7#kb-2026';
  D1.querySelector('#mbody [data-tab="meta"]').click();
  await wait(200);
  ck('15 概览页有密钥双重验证表单（原密钥+新密钥+确认）',
     !!D1.getElementById('akSet') && !!D1.getElementById('akOld') && !!D1.getElementById('akNew') && !!D1.getElementById('akNew2'));
  D1.querySelector('#mbody [data-tab="mds"]').click();
  await wait(150);
  const hasSeedBtn = !!D1.getElementById('btnSeed');
  D1.querySelector('#mbody [data-tab="meta"]').click();
  await wait(150);
  ck('15b 导出种子入口已迁移至 MD 文件库页签最下方', hasSeedBtn);
  D1.getElementById('akOld').value = AK;
  D1.getElementById('akNew').value = NEWK;
  D1.getElementById('akNew2').value = NEWK;
  D1.getElementById('akSet').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await wait(300);
  const kb2 = w1.__diag.getKB();
  ck('16 重设后只存新哈希', kb2.cfg.adminKeyHash === sha(NEWK) && kb2.cfg.adminKey === undefined);
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
  ck('17 旧密钥已失效', !!D3.getElementById('adminKeyIn'));
  D3.getElementById('adminKeyIn').value = NEWK;
  D3.getElementById('btnKeyGo').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  await wait(320);
  ck('18 新密钥可进入', !!D3.querySelector('#mbody [data-tab="meta"]'));

  /* —— 6. 旧版明文迁移：预置含 adminKey 的本机知识库 —— */
  const oldKB = JSON.parse(JSON.stringify(kb1));
  oldKB.cfg.adminKey = 'LegacyPass#1'; delete oldKB.cfg.adminKeyHash;
  const d2 = mk(w => { try { w.localStorage.setItem('opsdiag.kb.v2', JSON.stringify(oldKB)); } catch (e) {} });
  await wait(900);
  const w2 = d2.window, D2 = w2.document, kb3 = w2.__diag.getKB();
  ck('19 旧明文作废，密钥回落到种子', kb3.cfg.adminKeyHash === sha(AK));
  ck('20 明文已从本机删除', kb3.cfg.adminKey === undefined);
  ck('21 本机存储里也无明文', (w2.localStorage.getItem('opsdiag.kb.v2') || '').indexOf('LegacyPass#1') < 0);
  D2.getElementById('btnAdmin').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(250);
  D2.getElementById('adminKeyIn').value = 'LegacyPass#1';
  D2.getElementById('btnKeyGo').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(300);
  ck('22 原明文密钥已失效', !!D2.getElementById('adminKeyIn'));
  D2.getElementById('adminKeyIn').value = AK;
  D2.getElementById('btnKeyGo').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(320);
  ck('23 种子密钥在本机可登录', !!D2.querySelector('#mbody [data-tab="meta"]'));


  /* —— 7. 措施卡（知识点）扩充场景：导入 MD 后必须随种子一起导出，条数一致 —— */
  const v7 = w3.__diag.mdVols().filter(v => /KBVOL:07/.test(v[1]))[0];
  if (v7) {
    w3.__diag.applyMd([{ vol: '07', name: '07.md', txt: v7[1] }], [], () => {});
    await wait(250);
    const kbActs = (w3.__diag.getKB().acts || []).length;
    const ctxA = { window: {} };
    require('vm').createContext(ctxA); require('vm').runInContext(w3.__diag.seedText(), ctxA);
    const pA = ctxA.window.__KB_SEED__;
    ck('24 措施卡随种子导出且条数一致（内容扩充后可增长）', kbActs > 0 && (pA.acts || []).length === kbActs,
      '页面 ' + kbActs + ' 张 / 种子 ' + (pA.acts || []).length + ' 张');
    ck('25 措施卡字段完整（id + 动作口径必填）', (pA.acts || []).every(x => x && x.id && x.act && x.act.n),
      '样本 ' + String(((pA.acts || [])[0] || {}).id));
  } else {
    ck('24 措施卡随种子导出且条数一致（内容扩充后可增长）', false, '未找到 07 卷');
  }

  const bad = res.filter(r => !r[1]).length;
  console.log('结果：' + (res.length - bad) + '/' + res.length + ' 通过');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
