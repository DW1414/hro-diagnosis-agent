const {chromium}=require('playwright-core');
const fs=require('fs');
const path=require('path');
const FILE='file:///'+path.resolve(__dirname,'..','ops-diagnosis-agent.html').replace(/\\/g,'/');
const TMP=path.join(__dirname,'_tmp_upload.md');

(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1500}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',d=>d.accept());   /* confirm 一律确认，便于测「停用 / 删除」 */
  await p.goto(FILE,{waitUntil:'load'}); await p.waitForTimeout(400);

  /* ========== 1. 评分项补充：补充后必须能读进去 ========== */
  await p.click('#btnDemo'); await p.click('#btnRun'); await p.waitForTimeout(1300);
  const before=await p.evaluate(()=>{
    const R=window.__diag.getR();
    const r=R.score.rows.filter(o=>/^SC-P2-02/.test(o.row.id)).map(o=>({id:o.row.id,st:o.state,got:o.got,act:o.actual,sug:o.sugg}));
    return r;
  });
  console.log('【补充前】三条推进计划达成率：');
  before.forEach(r=>console.log('  ',r.id,r.st,'| 得分',r.got,'|',r.act,'|',r.sug));

  // 给三条都填数值（覆盖度面板的评分缺数输入框）
  const filled=await p.evaluate(()=>{
    const els=[...document.querySelectorAll('[data-cvx]')].filter(e=>/^SC-P2-02/.test(e.getAttribute('data-cvx')));
    els.forEach((e,i)=>{
      const code=e.getAttribute('data-cvx');
      const v=code.endsWith('-A')?'实际 92%':(code.endsWith('-B')?'实际 88%':'实际 75%');
      e.value=v; e.dispatchEvent(new Event('change'));
    });
    return els.map(e=>e.getAttribute('data-cvx'));
  });
  console.log('已填入：',filled.join(' / '));
  await p.click('#btnMergeSup'); await p.waitForTimeout(1500);
  const after=await p.evaluate(()=>{
    const R=window.__diag.getR();
    return R.score.rows.filter(o=>/^SC-P2-02/.test(o.row.id)).map(o=>({id:o.row.id,st:o.state,got:o.got,act:o.actual,src:o.src}));
  });
  console.log('【补充后】');
  after.forEach(r=>console.log('  ',r.id,r.st,'| 得分',r.got,'| 实际',r.act,'|',r.src));
  const ok=after.filter(r=>r.st==='OK').length;
  console.log('补充后可读入的条数：',ok,'/ 3', ok===3?'✅':'❌');

  /* ========== 2. 评分项「无/不适用」下拉 ========== */
  const naRes=await p.evaluate(async()=>{
    const sel=document.querySelector('[data-kna]');
    if(!sel) return 'no-select';
    const id=sel.getAttribute('data-kna');
    sel.value='NA'; sel.dispatchEvent(new Event('change'));
    return id;
  });
  await p.waitForTimeout(1200);
  const naState=await p.evaluate((id)=>{
    const R=window.__diag.getR();
    const o=R.score.rows.filter(x=>x.row.id===id)[0];
    return {id:id,st:o?o.state:'(已移除)',k:R.K,naSum:R.score.naSum,total:R.total};
  },naRes);
  console.log('下拉标「无/不适用」→',naState.id,'状态',naState.st,'｜K=',naState.k,'｜总分',naState.total);

  /* ========== 3. MD 文件库页签 ========== */
  await p.click('#btnAdmin'); await p.waitForTimeout(400);
  const ki=await p.$('#adminKeyIn');
  if(ki){ await ki.fill('hro2026'); await p.click('#btnKeyGo'); await p.waitForTimeout(600); }
  await p.click('[data-tab="mds"]'); await p.waitForTimeout(500);
  const files=await p.evaluate(()=>{
    return [...document.querySelectorAll('#mtab .actcard')].slice(1).map(c=>c.querySelector('b')?c.querySelector('b').textContent:'').filter(Boolean);
  });
  console.log('MD 文件库列出文件：',files.length,'个');
  const info=await p.evaluate(()=>{
    const KB=window.__diag.getKB();
    const V=window.__diag.mdVols();
    return {ver:KB.meta.ver,vols:V.map(v=>[v[0],v[1].length,(v[1].match(/<!--KBVOL:\d\d-->/g)||[]).length])};
  });
  console.log('知识库版本：',info.ver);
  info.vols.forEach(v=>console.log('  ',v[0],'｜字数',v[1],'｜分节',v[2]));
  const mb=await p.$('#mtab');
  if(mb) await mb.screenshot({path:path.join(__dirname,'v22_mds.png')});

  /* ========== 4. 上传新 MD 替换（测试用 KBVOL:04 写作要求） ========== */
  const oldGuide=await p.evaluate(()=>window.__diag.getKB().guide.slice(0,20));
  const SRC=path.resolve(__dirname,'..','知识库_v2_MD','项目走访报告写作要求与技巧.md');
  fs.writeFileSync(TMP,fs.readFileSync(SRC,'utf8').replace('<!--KBFILE:项目走访报告写作要求与技巧.md-->','<!--KBFILE:测试上传_写作要求.md-->')
    +'\n\n## 上传替换验证小节\n- 本段由「MD 文件库 → 上传新 MD」写入，用于验证回写链路 OK\n','utf8');
  await p.evaluate(()=>{ document.getElementById('fileMdNew').style.display='block'; });
  await p.setInputFiles('#fileMdNew',TMP); await p.waitForTimeout(1500);
  const up=await p.evaluate(()=>{
    const KB=window.__diag.getKB();
    return {marker:/上传替换验证小节/.test(KB.guide),len:KB.guide.length,tail:KB.guide.slice(-40),files:KB.files,ver:KB.meta.ver,log:KB.log[0]};
  });
  console.log('上传后 guide 含新小节：',up.marker,'｜长度',up.len,'｜尾部：',up.tail.replace(/\n/g,'⏎'));
  console.log('自定义文件登记：',JSON.stringify(up.files));
  console.log('版本：',up.ver,'｜日志：',up.log?up.log.m:'—');

  /* 还原写作要求 */
  await p.evaluate(()=>{ window.__diag.getKB().guide='（测试后已还原）'; });

  /* ========== 5. 停用 / 恢复内置文件 ========== */
  const del=await p.evaluate(()=>{
    const b=document.querySelector('[data-mddel]'); if(!b) return 'none';
    b.click(); return b.getAttribute('data-mddel');
  });
  await p.waitForTimeout(300);
  await p.evaluate(()=>{ /* confirm 自动确认 */ });
  p.on('dialog',d=>d.accept());
  await p.waitForTimeout(200);
  const state1=await p.evaluate(()=>JSON.stringify(window.__diag.getKB().mdState||{}));
  console.log('点击删除（停用）后 mdState：',state1);
  const res=await p.$('[data-mdres]');
  if(res){ res.click(); await p.waitForTimeout(400); }
  const state2=await p.evaluate(()=>JSON.stringify(window.__diag.getKB().mdState||{}));
  console.log('恢复后 mdState：',state2);

  console.log('页面错误：',errs.length?errs.join('; '):'无');
  if(fs.existsSync(TMP)) fs.unlinkSync(TMP);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
