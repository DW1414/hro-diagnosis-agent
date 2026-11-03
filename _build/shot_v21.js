const {chromium}=require('playwright-core');
const path=require('path');
const FILE='file:///'+path.resolve(__dirname,'..','ops-diagnosis-agent.html').replace(/\\/g,'/');
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1400}});
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto(FILE,{waitUntil:'load'});
  await p.waitForTimeout(400);
  await p.click('#btnDemo'); await p.click('#btnRun'); await p.waitForTimeout(1400);

  async function shoot(sel,name){
    const el=await p.$(sel);
    if(el) await el.screenshot({path:path.join(__dirname,name)});
    return !!el;
  }
  await shoot('#secEval','v21_eval.png');
  await shoot('#secSummary','v21_sum.png');

  const info=await p.evaluate(()=>{
    const R=window.__diag.getR();
    return {
      fixes:R.fixes.map(f=>({dim:f.dim,pri:f.pri,thing:f.thing.slice(0,24),total:f.jd.total,rf:f.jd.rf,methods:f.methods,act:f.primary&&f.primary.act?f.primary.act.id:(f.primary&&f.primary.todo?'待补充':'—')})),
      evals:R.evals.map(e=>({n:e.name,lv:e.lv,basis:e.basisLine.slice(0,60)})),
      focus:R.sum.focus.length, hl:R.sum.hl.length,
      hasCoverInReport:/输入覆盖度/.test(document.getElementById('doc').innerHTML),
      hasEvalBlock:/模块二 · 满意度评价/.test(document.getElementById('doc').innerHTML)
    };
  });
  console.log('整改事项：');
  info.fixes.forEach(f=>console.log(' ',f.pri,f.dim,'五维'+f.total+'/15','红灯['+f.rf.join('/')+']','方法['+f.methods.join('/')+']','→',f.act,'|',f.thing));
  console.log('评价项：');
  info.evals.forEach(e=>console.log(' ',e.n,e.lv,'|',e.basis));
  console.log('总结：优势',info.hl,'条 / 重点提升',info.focus,'条');
  console.log('报告含覆盖度模块：',info.hasCoverInReport,'｜含满意度模块：',info.hasEvalBlock);

  // 后台「判定标准A」页签
  await p.click('#btnAdmin'); await p.waitForTimeout(400);
  const ki=await p.$('#adminKeyIn');
  if(ki){ await ki.fill('hro2026'); await p.click('#btnKeyGo'); await p.waitForTimeout(600); }
  const btn=await p.$('[data-tab="rules"]');
  if(btn){ await btn.click(); await p.waitForTimeout(500); }
  const mb=await p.$('#mtab');
  if(mb) await mb.screenshot({path:path.join(__dirname,'v21_rules.png')});
  console.log('页面错误：',errs.length?errs.join('; '):'无');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
