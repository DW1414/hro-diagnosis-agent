const {chromium}=require('playwright-core');
const path=require('path');
const FILE='file:///'+path.resolve(__dirname,'..','ops-diagnosis-agent.html').replace(/\\/g,'/');
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1400}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(FILE,{waitUntil:'load'});
  await p.waitForTimeout(400);
  await p.click('#btnDemo'); await p.click('#btnRun'); await p.waitForTimeout(1400);

  // 1) select option 文字颜色（全局）
  const optColor=await p.evaluate(()=>{
    const o=document.querySelector('select option');
    return getComputedStyle(o).color;
  });
  console.log('下拉选项字色：',optColor,'（应为浅色 rgb(232,238,245)）');
  const selColor=await p.evaluate(()=>{
    const s=document.querySelector('[data-cv]');
    return s?getComputedStyle(s).color:'(无下拉)';
  });
  console.log('覆盖度下拉框字色：',selColor);

  // 2) 补充输入框数量
  const nIn=await p.evaluate(()=>document.querySelectorAll('[data-cvx]').length);
  console.log('补充输入框数量：',nIn);

  // 3) 模拟输入补充信息 → 并入重跑
  const before=await p.evaluate(()=>({cover:window.__diag.getR().cover.stat.rate,tx2:document.getElementById('tx2').value.length}));
  await p.evaluate(()=>{
    const el=document.querySelector('[data-cvx]');
    el.value='已建立交付日报制度，每日 17 点发布 OTD 看板，延迟订单当日升级项目经理';
    el.dispatchEvent(new Event('change'));
  });
  await p.click('#btnMergeSup'); await p.waitForTimeout(1400);
  const after=await p.evaluate(()=>{
    const R=window.__diag.getR();
    return {cover:R.cover.stat.rate,tx2:document.getElementById('tx2').value,merged:document.getElementById('tx2').value.indexOf('【')>=0};
  });
  console.log('并入前覆盖度：',before.cover,'% ｜并入后：',after.cover,'%');
  console.log('补充信息已并入输入框：',after.merged,'｜内容片段：',after.tx2.slice(0,80));

  // 4) 截图覆盖度面板
  const el=await p.$('#coverBox');
  if(el) await el.screenshot({path:path.join(__dirname,'v212_cover.png')});
  console.log('页面错误：',errs.length?errs.join('; '):'无');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
