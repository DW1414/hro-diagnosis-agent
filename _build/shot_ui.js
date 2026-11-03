const {chromium}=require('playwright-core');
const FILE='file:///D:/AI工具包/2026-10-16-17-30-15/ops-diagnosis-agent.html';
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto(FILE,{waitUntil:'load'}); await p.waitForTimeout(400);
  await p.click('#btnDemo');
  const hold=await p.$('#holdBtn');
  await hold.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await p.screenshot({path:'v23_oral.png'});
  const run=await p.$('#btnRun');
  await run.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await p.screenshot({path:'v23_run.png'});
  await b.close();
})();
