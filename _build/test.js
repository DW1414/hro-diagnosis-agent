const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync(path.join(__dirname,'..','ops-diagnosis-agent.html'),'utf8');
const errors=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window;
w.addEventListener('error',e=>errors.push('window error: '+e.message));

// jsdom 没有 localStorage 之外的很多东西；补齐必要 stub
if(!w.localStorage){ const d={}; w.localStorage={getItem:k=>(k in d?d[k]:null),setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}}; }
w.URL.createObjectURL=()=>'blob:stub';
w.URL.revokeObjectURL=()=>{};
w.HTMLElement.prototype.scrollIntoView=function(){};
w.scrollTo=()=>{};
if(!w.SpeechRecognition && !w.webkitSpeechRecognition){ /* 语音不可用属正常 */ }

setTimeout(()=>{
  const btn=doc(w,'btnDemo'), run=doc(w,'btnRun');
  if(!btn||!run){ console.log('FATAL: 找不到按钮', !!btn, !!run); process.exit(1); }
  btn.click();
  run.click();

  const R=w.__diag.getR(), KB=w.__diag.getKB();
  console.log('=== 运行错误 ===', errors.length?errors:'无');
  if(!R){ console.log('FATAL: 未生成报告对象'); process.exit(1); }

  console.log('\n=== 评分表 ===');
  console.log('项目:', R.meta.name, '| 类型', R.meta.type, '| 人数', R.meta.head);
  R.score.rows.forEach(o=>{
    const s={OK:'有据',TBD:'待确认',NA:'不适用'}[o.state]||o.state;
    console.log(`  [${o.row.part}] ${(o.row.l1||'').padEnd(6)} ${(o.row.name||'—').padEnd(12)} 目标=${String(o.row.target||'—').padEnd(10)} 实际=${String(o.actual||'').padEnd(22)} ${s.padEnd(4)} 得分=${o.got}/${o.row.max}`);
  });
  console.log('\nPart.1 =',R.parts.P1,'/50');
  console.log('Part.2 =',R.parts.P2,'/30');
  console.log('Part.3 =',R.parts.P3,'/20');
  console.log('基准合计 =', R.parts.P1+R.parts.P2+R.parts.P3);
  console.log('不适用满分 =', R.score.naSum, '| K =', R.K, '| 加分 =', R.parts.P4);
  console.log('总得分 =', R.parts.P1+R.parts.P2+R.parts.P3, '×', R.K, '+', R.parts.P4, '=', R.total);
  console.log('公式校验:', ((Math.round((R.parts.P1+R.parts.P2+R.parts.P3)*R.K*10)/10)+R.parts.P4)===R.total ? 'OK' : 'FAIL');

  console.log('\n=== 客户需求提取 ===');
  R.sum.needsRaw.forEach(n=>console.log('  ['+n.src+']', n.t));
  console.log('=== 项目亮点 ===');
  R.hl.forEach(h=>console.log('  ['+h.src+']', h.t));

  console.log('\n=== 整改事项（优先级排序）===');
  R.fixes.forEach((f,i)=>{
    const act=(f.primary&&f.primary.todo)?'措施待补充':((f.primary&&f.primary.act)?f.primary.act.id:'—');
    console.log(`  ${i+1}. ${f.pri} | ${f.tags.map(t=>t).join('/')||f.aspect} ${f.dim} ${f.dimName} | ${'★'.repeat(f.stars)} | 紧急=${f.urg}`);
    console.log(`      事项: ${f.thing}`);
    console.log(`      措施: ${act} | 责任人=${f.owner} | 交期=${f.due}`);
  });

  console.log('\n=== 分布统计 ===');
  const dist={}; R.fixes.forEach(f=>dist[f.pri]=(dist[f.pri]||0)+1);
  console.log(' 优先级分布:', JSON.stringify(dist));
  console.log(' 维度分布:', R.fixes.map(f=>f.dim).join(','));
  console.log(' IT待补措施:', R.fixes.filter(f=>f.primary&&f.primary.todo).length);

  const docEl=doc(w,'doc');
  console.log('\n=== 渲染检查 ===');
  console.log(' #doc 长度:', docEl.innerHTML.length);
  console.log(' 表格数:', docEl.querySelectorAll('table').length);
  console.log(' 含总得分:', docEl.innerHTML.includes('总得分：'));
  console.log(' 含模块一:', docEl.innerHTML.includes('模块一'));
  console.log(' 含模块二:', docEl.innerHTML.includes('模块二'));
  console.log(' 含整改表头附图/附件:', docEl.innerHTML.includes('附图/附件'));
  console.log(' 含重要提示:', docEl.innerHTML.includes('重要提示'));
  console.log(' JSON信封长度:', doc(w,'jsonPre').textContent.length);

  console.log('\n=== 分级检查（应为 false）===');
  console.log(' grading:', KB.cfg.grading, '| 报告中出现"等级/评级/优秀":',
    /成熟度等级|等级评定|评级 Date/.test(docEl.innerHTML));

  process.exit(0);
},600);

function doc(w,id){ return w.document.getElementById(id); }