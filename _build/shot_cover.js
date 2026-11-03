const {chromium}=require('playwright-core');
const path=require('path');
const FILE='file:///'+path.resolve(__dirname,'..','ops-diagnosis-agent.html').replace(/\\/g,'/');
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1200}});
  const errs=[];
  p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  await p.goto(FILE,{waitUntil:'load'});
  await p.waitForTimeout(400);
  // 只输少量文本，制造大量未覆盖
  await p.fill('#tx','安全三级教育覆盖率 100%，隐患排查台账每周更新，闭环率 96%。客户投诉 2 起。');
  await p.click('#btnRun'); await p.waitForTimeout(1200);
  const cover=await p.$('#bCover');
  if(cover) await cover.screenshot({path:path.join(__dirname,'v_cover.png')});
  const sec=await p.$('#secCover');
  if(sec) await sec.screenshot({path:path.join(__dirname,'v_cover_rpt.png')});
  // 标一项为不相关
  const sel=await p.$('#coverBox [data-cv]');
  const code=await sel.getAttribute('data-cv');
  await sel.selectOption('NA'); await p.waitForTimeout(400);
  const info=await p.evaluate(()=>{
    const t=(document.querySelector('#bCover')||{}).innerText||'';
    const m=t.match(/覆盖度 \d+%/);
    return {rate:m?m[0]:'', na:/无\/不相关 1/.test(t), rows:document.querySelectorAll('#coverBox [data-cv]').length};
  });
  console.log('覆盖度：',info.rate,'| 标不相关生效：',info.na,'| 面板待补行数：',info.rows,'| 标注子项：',code);
  console.log('错误：',errs.length?errs.join('; '):'无');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
