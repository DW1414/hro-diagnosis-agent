const {chromium}=require('playwright-core');
const path=require('path');
const FILE='file:///'+path.resolve(__dirname,'..','ops-diagnosis-agent.html').replace(/\\/g,'/');
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1200}});
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto(FILE,{waitUntil:'load'});
  await p.waitForTimeout(400);
  await p.click('#btnDemo'); await p.click('#btnRun'); await p.waitForTimeout(1200);
  const sum=await p.$('#secSummary');
  if(sum) await sum.screenshot({path:path.join(__dirname,'v_sum2.png')});
  const info=await p.evaluate(()=>{
    const rows=document.querySelectorAll('#secSummary table:first-of-type td');
    const txt=(document.querySelector('#secSummary')||{}).innerText||'';
    const m=txt.match(/重点提升\/打造事项\n([\s\S]*?)\n整改事项清单/);
    return {adv:[...txt.matchAll(/【[^】]*】/g)].length, focus:m?m[1]:''};
  });
  console.log('优势分组标签数：',info.adv);
  console.log('重点提升内容：\n'+info.focus);
  console.log('页面错误：',errs.length?errs.join('; '):'无');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
