const {chromium}=require('playwright-core');
const path=require('path');
const FILE='file:///'+path.resolve(__dirname,'..','ops-diagnosis-agent.html').replace(/\\/g,'/');
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  await p.goto(FILE,{waitUntil:'load'});
  await p.waitForTimeout(500);
  await p.click('#btnDemo'); await p.waitForTimeout(300);
  await p.click('#btnRun'); await p.waitForTimeout(1200);

  // 1) 顶部录入区（红框三项应已删除）
  const cardIn=await p.$('#cardIn');
  if(cardIn) await cardIn.screenshot({path:path.join(__dirname,'v_top.png')});
  // 2) 评分表
  const score=await p.$('#secScore');
  if(score) await score.screenshot({path:path.join(__dirname,'v_score.png')});
  // 3) 总结 + 总得分框
  const sum=await p.$('#secSummary');
  if(sum) await sum.screenshot({path:path.join(__dirname,'v_sum.png')});
  // 4) 管理员密钥锁屏
  await p.click('#btnAdmin'); await p.waitForTimeout(400);
  await p.screenshot({path:path.join(__dirname,'v_lock.png')});
  // 5) 进入后台 → 布局页签
  await p.fill('#adminKeyIn','hro2026');
  await p.click('#btnKeyGo'); await p.waitForTimeout(400);
  await p.click('#mbody [data-tab="layout"]'); await p.waitForTimeout(300);
  await p.screenshot({path:path.join(__dirname,'v_layout.png')});
  // 6) 写作要求页签
  await p.click('#mbody [data-tab="guide"]'); await p.waitForTimeout(300);
  await p.screenshot({path:path.join(__dirname,'v_guide.png')});

  const info=await p.evaluate(()=>({
    hasEval: !!document.getElementById('f_eval')||!!document.querySelector('[data-ap*="eval"]'),
    metaText: (document.querySelector('#bMeta')||{}).innerText||'',
    totalBox: (document.querySelector('.totalbox')||{}).innerText||'',
    docColors: Array.from(document.querySelectorAll('#doc td,#doc th,#doc .who,#doc .tag,#doc .fm'))
      .slice(0,120).map(e=>getComputedStyle(e).color)
      .filter(c=>!/rgb\(17, 17, 17\)/.test(c)),
    tabs: Array.from(document.querySelectorAll('#mbody [data-tab]')).map(e=>e.textContent)
  }));
  console.log('--- 页面信息 ---');
  console.log('评分表非黑色字体数：',info.docColors.length, info.docColors.slice(0,8));
  console.log('总得分框：',JSON.stringify(info.totalBox.replace(/\n/g,' | ')));
  console.log('是否残留评价人字段：',/评价人/.test(info.metaText));
  console.log('后台页签：',info.tabs.join(' / '));
  console.log('--- 运行错误 ---',errs.length?errs.join('\n'):'无');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
