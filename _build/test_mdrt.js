const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const FILE='file:///'+path.join(ROOT,'ops-diagnosis-agent.html').replace(/\\/g,'/');
/* 措施卡/知识包现并入 03_KNOWLEDGE（KBVOL:07 / KBVOL:08 分节），按标记切卷回写 */
const vol=(n)=>{
  const txt=fs.readFileSync(path.join(ROOT,'知识库_v2_MD','03_KNOWLEDGE_制造业外包项目运营知识库.md'),'utf8');
  const m=txt.match(new RegExp('<!--KBVOL:'+n+'-->[\\s\\S]*?(?=<!--KBVOL:\\d\\d-->|$)'));
  if(!m) throw new Error('未找到 KBVOL:'+n);
  return m[0];
};
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(FILE,{waitUntil:'load'}); await p.waitForTimeout(300);
  const r=await p.evaluate(([t7,t8])=>{
    let a=[],e=[];
    window.__diag.applyMd([{vol:'07',name:'07.md',txt:t7},{vol:'08',name:'08.md',txt:t8}],e,(ap,er)=>{a=ap;e=er;});
    const kb=window.__diag.getKB();
    return {applied:a,errs:e,acts:(kb.acts||[]).length,kp:kb.kp?Object.keys(kb.kp).length:0,
      idxActs:window.__diag.getKB().meta.ver};
  },[vol('07'),vol('08')]);
  console.log('回写结果：',JSON.stringify(r,null,1));
  // 跑一次诊断验证措施卡仍能匹配（gate 遮罩拦截信任点击，用 DOM 内部 click）
  await p.evaluate(()=>{document.getElementById('btnDemo').click();document.getElementById('btnRun').click();});
  await p.waitForTimeout(1000);
  const R=await p.evaluate(()=>{const R=window.__diag.getR();return {total:R.total,fixes:R.fixes.length,act:R.fixes.filter(f=>f.primary&&f.primary.act).length};});
  console.log('诊断复跑：',JSON.stringify(R), '错误：',errs.length?errs:'无');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
