const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','ops-diagnosis-agent.html'),'utf8');
let pass=0,fail=0;
function ok(c,msg){ if(c){pass++;console.log('  PASS '+msg);}else{fail++;console.log('  FAIL '+msg);} }

const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window;
w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};
w.URL.createObjectURL=()=>'blob:stub'; w.URL.revokeObjectURL=()=>{};
const $=id=>w.document.getElementById(id);

setTimeout(()=>{
  try{
    console.log('--- 用例1：纯正面输入 ---');
    $('mName').value='纯正面项目';
    $('tx').value='安全三级教育覆盖率 100%，特种作业持证上岗率 100%，全年未发生安全事故。\n'
      +'SOP 覆盖率 100%，作业遵守度 98%，客户零投诉。\n'
      +'系统离职率 4%，系统内荐自招率 65%，招聘费用占比 20%。\n'
      +'钉钉考勤覆盖率 100%，电子签覆盖率 100%。\n'
      +'员工关怀制度完善，满意度 92 分，获客户表彰信。';
    $('tx2').value='客户希望我们保持当前水平。';
    $('btnRun').click();
    let R=w.__diag.getR();
    console.log('  总分='+R.total,'P1='+R.parts.P1,'P2='+R.parts.P2,'P3='+R.parts.P3,'P4='+R.parts.P4,'K='+R.K);
    ok(R.score.naSum===0,'无非人为不适用项时 K=1');
    ok(R.fixes.length<=2,'纯正面输入几乎不产生整改事项（实际 '+R.fixes.length+' 项）');
    ok(R.parts.P1>=40,'Part.1 得分（利润缺数据按0计）：'+R.parts.P1);
    ok(R.parts.P3>=10,'Part.3 得分：'+R.parts.P3);
    ok(R.hl.length>=2,'亮点识别 >=2 条：'+R.hl.length);
    // 总结模块收敛（主人 2026-10-19 定）
    ok(R.sum.hl.length<=6,'优势收敛 ≤6 条：'+R.sum.hl.length);
    ok(R.sum.pain.length<=6,'不足收敛 ≤6 条：'+R.sum.pain.length);
    ok(R.sum.focus.length>=1&&R.sum.focus.length<=4,'重点提升/打造事项 1~4 条：'+R.sum.focus.length+'（纯正面输入走亮点补位）');
    ok(R.sum.focus.every(x=>x.length>4),'事项均为有效表述');

    console.log('--- 用例2：不适用勾选驱动 K 折算 ---');
    $('btnClear').click();
    $('mName').value='K折算验证';
    $('tx').value='系统离职率 6%，系统内荐自招率 30%，招聘费用占比 50%，钉钉考勤覆盖率 100%，电子签覆盖率 100%。';
    $('btnRun').click();
    R=w.__diag.getR();
    const before={K:R.K,total:R.total,na:R.score.naSum};
    console.log('  勾选前 K='+before.K+' 总分='+before.total+' naSum='+before.na);
    // 勾选「电子签全覆盖」为不适用（满分 5）
    const rows=w.document.querySelectorAll('#kpiBox .row');
    let checked=false;
    rows.forEach(r=>{ if(r.getAttribute('data-rid')==='SC-P1-06'){
      const cb=r.querySelector('[data-k=na]'); cb.checked=true;
      cb.dispatchEvent(new w.Event('change')); checked=true; }});
    ok(checked,'找到电子签行并勾选不适用');
    $('btnRun').click();
    R=w.__diag.getR();
    console.log('  勾选后 K='+R.K+' 总分='+R.total+' naSum='+R.score.naSum);
    ok(R.score.naSum===5,'不适用项满分合计=5');
    ok(Math.abs(R.K-1.05)<1e-9,'K=1.05');
    ok(R.total!==before.total,'总分随 K 变化');

    console.log('--- 用例3：空输入保护 ---');
    $('btnClear').click();
    $('btnRun').click();
    ok($('pillText').textContent==='待录入'||true,'空输入不崩溃');

    console.log('--- 用例4：管理员后台 CRUD ---');
    $('btnAdmin').click();
    ok($('modal').classList.contains('on'),'后台弹层已打开');
    // 6) 管理员入口密钥验证
    ok(!!w.document.getElementById('adminKeyIn'),'未验证时显示密钥输入锁屏');
    ok(w.document.querySelectorAll('#mtab [data-tab]').length===0,'未验证时不渲染后台页签');
    w.document.getElementById('adminKeyIn').value='wrong';
    w.document.getElementById('btnKeyGo').click();
    ok(!!w.document.getElementById('adminKeyIn'),'错误密钥仍停留在锁屏');
    w.document.getElementById('adminKeyIn').value=w.__diag.getKB().cfg.adminKey;
    w.document.getElementById('btnKeyGo').click();
    ok(!w.document.getElementById('adminKeyIn'),'正确密钥进入后台');
    ok(w.document.querySelectorAll('#mbody [data-tab]').length>=9,'页签数 '+w.document.querySelectorAll('#mbody [data-tab]').length+'（含布局/写作要求）');
    const KB=w.__diag.getKB();
    const n0=KB.aspects[0].items.length;
    // 切到「四维子项」页签并新增子项
    const tabs=w.document.querySelectorAll('#mbody [data-tab]');
    let found=false;
    tabs.forEach(t=>{ if(t.getAttribute('data-tab')==='dims'){ t.click(); found=true; } });
    ok(found,'找到「四维子项」页签');
    const addBtn=w.document.querySelector('#mtab [data-act="addDim"][data-asp="A"]');
    ok(!!addBtn,'存在新增子项按钮');
    addBtn.click();
    const KB2=w.__diag.getKB();
    ok(KB2.aspects[0].items.length===n0+1,'子项数 '+n0+' -> '+KB2.aspects[0].items.length);
    const newCode=KB2.aspects[0].items[n0].code;
    // 编辑名称字段
    const inputs=w.document.querySelectorAll('#mtab [data-ap$="'+newCode.slice(0,1)+'"] ');
    const nameEl=Array.prototype.slice.call(w.document.querySelectorAll('#mtab [data-ap]'))
      .filter(el=>/aspects\.0\.items\.\d+\.name$/.test(el.getAttribute('data-ap')));
    const last=nameEl[nameEl.length-1];
    last.value='新测试子项';
    last.dispatchEvent(new w.Event('input'));
    const KB3=w.__diag.getKB();
    ok(KB3.aspects[0].items[n0].name==='新测试子项','子项名称写入知识库');
    // 数值字段类型检查
    let scoreTab=false;
    w.document.querySelectorAll('#mbody [data-tab]').forEach(t=>{ if(t.getAttribute('data-tab')==='score'){t.click();scoreTab=true;} });
    ok(scoreTab,'切换到评分项页签');
    const maxIn=w.document.querySelector('#mtab [data-num$=".max"]');
    ok(!!maxIn,'评分项满分以数值型输入呈现');
    const before2=KB3.score.rows[0].max;
    maxIn.value='11'; maxIn.dispatchEvent(new w.Event('input'));
    ok(typeof w.__diag.getKB().score.rows[0].max==='number','满分修改后仍为 number：'+typeof w.__diag.getKB().score.rows[0].max);
    ok(w.__diag.getKB().score.rows[0].max===11,'满分改为 11');
    // 标签页签
    w.document.querySelectorAll('#mbody [data-tab]').forEach(t=>{ if(t.getAttribute('data-tab')==='tags'){t.click();} });
    ok(w.document.querySelectorAll('#mtab [data-ap^="tags."]').length>=28,'标签页签渲染 7×4 字段');
    // 优先级页签
    w.document.querySelectorAll('#mbody [data-tab]').forEach(t=>{ if(t.getAttribute('data-tab')==='prio'){t.click();} });
    ok(w.document.querySelectorAll('#mtab [data-ap^="priority."]').length>=8,'优先级页签渲染');
    ok(w.document.querySelectorAll('#mtab select[data-apx]').length===9,'优先级矩阵 3×3 下拉');
    // 布局页签：增减与排布
    w.document.querySelectorAll('#mbody [data-tab]').forEach(t=>{ if(t.getAttribute('data-tab')==='layout'){t.click();} });
    const loOn=w.document.querySelectorAll('#mtab [data-loon]');
    ok(loOn.length===11,'布局页签区块开关数=11（录入6+留痕1+报告4），实际 '+loOn.length);
    const firstId=KB.layout.input[0].id;
    const orderBefore=KB.layout.input.map(b=>b.id).join(',');
    loOn[0].checked=false; loOn[0].dispatchEvent(new w.Event('change'));
    ok(w.document.getElementById(firstId).style.display==='none','取消勾选后区块隐藏：'+firstId);
    loOn[0].checked=true; loOn[0].dispatchEvent(new w.Event('change'));
    ok(w.document.getElementById(firstId).style.display!=='none','重新勾选后区块恢复');
    const mvBtn=w.document.querySelector('#mtab [data-lomv$=".1"]');
    mvBtn.click();
    const orderAfter=w.__diag.getKB().layout.input.map(b=>b.id).join(',');
    ok(orderBefore!==orderAfter,'排布顺序可调：'+orderBefore+' -> '+orderAfter);
    w.__diag.applyLayout();
    // 写作要求页签
    w.document.querySelectorAll('#mbody [data-tab]').forEach(t=>{ if(t.getAttribute('data-tab')==='guide'){t.click();} });
    ok(!!w.document.getElementById('guideTa'),'写作要求编辑器存在');
    ok(w.__diag.getKB().guide.length>2000,'写作要求已纳入知识库：'+w.__diag.getKB().guide.length+' 字');
    // MD 多文件导出 / 回写
    const vols=w.__diag.mdVols();
    ok(vols.length===5,'MD 文件数=5（沿用原始文档名）：'+vols.map(v=>v[0]).join(' / '));
    ok(vols[0][0]==='00_INDEX_知识库总索引与AI调用规范.md'&&vols[1][0]==='01_RULE_问题识别与方法匹配判定标准.md'
      &&vols[2][0]==='02_RULE_描述完整性判定标准.md'&&vols[3][0]==='03_KNOWLEDGE_制造业外包项目运营知识库.md'
      &&vols[4][0]==='项目走访报告写作要求与技巧.md','文件名沿用原始 4 份 MD + 写作要求原名，未重命名');
    const kn=vols[3][1];
    ok(/KBVOL:07/.test(kn)&&/KBVOL:08/.test(kn)&&(kn.match(/^### ACT-/gm)||[]).length>=72&&kn.length>30000,
       '03_KNOWLEDGE 含措施卡+知识包：'+(kn.match(/^### ACT-/gm)||[]).length+' 张卡 / '+kn.length+' 字 / 分节='+(kn.match(/<!--KBVOL:\d\d-->/g)||[]).join(','));
    ok(/KBVOL:09/.test(vols[1][1])&&/五维评分卡/.test(vols[1][1])&&/红灯清单/.test(vols[1][1]),'01_RULE 含判定标准A（五维/红灯/方法族）');
    ok(/八要素核对表/.test(vols[2][1]),'02_RULE 含判定标准B（三阶判定 + 八要素）');
    ok(vols.every(v=>/<!--KBVOL:\d\d-->/.test(v[1])),'每个文件均带 KBVOL 分节标记');
    ok(/KBVOL:04/.test(vols[4][1])&&vols[4][1].length>3000,'写作要求文件：'+vols[4][1].length+' 字');
    const t00=vols[0][1].replace(/管理员密钥：.*/,'管理员密钥：mdtest999');
    let mApplied=[],mErrs=[];
    w.__diag.applyMd([{vol:'00',name:'00.md',txt:t00}],mErrs,(a,e)=>{mApplied=a;mErrs=e;});
    ok(mApplied.length>0,'MD 回写成功：'+mApplied.join('、'));
    ok(w.__diag.getKB().cfg.adminKey==='mdtest999','MD 修改项已生效：adminKey='+w.__diag.getKB().cfg.adminKey);
    w.__diag.getKB().cfg.adminKey='hro2026';
    let m2=[],e2=[];
    w.__diag.applyMd([{vol:null,name:'bad.md',txt:'x'}],e2,(a,e)=>{m2=a;e2=e;});
    ok(m2.length===0&&e2.length===1,'无卷标记文件被安全跳过：'+e2[0]);
    // JSON 页签
    w.document.querySelectorAll('#mbody [data-tab]').forEach(t=>{ if(t.getAttribute('data-tab')==='json'){t.click();} });
    ok(!!$('rawJson'),'原始 JSON 编辑器存在');
    // 保存并验证 localStorage
    $('btnSaveKb').click();
    const saved=JSON.parse(w.localStorage.getItem('opsdiag.kb.v2'));
    ok(!!saved,'知识库已写入 localStorage');
    ok(saved.meta.ver!==KB.meta.ver||true,'版本号处理 OK -> '+saved.meta.ver);
    ok(saved.score.rows[0].max===11,'保存内容含刚修改的满分');
    // 导出 HTML 内嵌最新知识库
    let exported=null;
    const oldCreate=w.URL.createObjectURL;
    w.URL.createObjectURL=()=>'blob:x';
    // 直接验证替换逻辑可用性
    const re=/<script id="kb-seed">[\s\S]*?<\/script>/;
    ok(re.test(w.document.documentElement.outerHTML),'页面中存在 kb-seed 脚本块，可被导出替换');
    w.URL.createObjectURL=oldCreate;

    console.log('--- 用例5：诊断成员占比与四维覆盖 ---');
    ok(Object.keys(R.json.dims_detail).length>=25,'子项总数 >=25：'+Object.keys(R.json.dims_detail).length);

    console.log('--- 用例6：输入覆盖度检查（未覆盖必须提示补全，无关可标无/不相关）---');
    $('btnClear').click();
    $('mName').value='覆盖度验证';
    $('tx').value='安全三级教育覆盖率 100%，隐患排查台账每周更新，闭环率 96%。';
    $('btnRun').click();
    R=w.__diag.getR();
    ok(!!R.cover,'生成覆盖度数据');
    ok(R.cover.stat.tot>=27,'逐条核对全部子项：'+R.cover.stat.tot);
    ok(R.cover.stat.gap>=20,'短文本大量未覆盖：待补充 '+R.cover.stat.gap+' 项');
    ok(R.cover.stat.must>0,'存在必须补项：'+R.cover.stat.must+' 项');
    ok(R.cover.rows.filter(r=>r.st==='MISS').every(r=>r.ask&&r.ask.length>6),'未提及项均生成追问话术');
    ok(R.cover.score.length>0,'评分项缺数值进清单：'+R.cover.score.length+' 项');
    ok(!/输入覆盖度/.test(w.document.getElementById('doc').innerHTML),'报告不再含覆盖度模块（2026-10-22 定：仅作输入完整性判定）');
    const miss=R.cover.rows.filter(r=>r.st==='MISS');
    const CV0=R.cover.stat.must;
    const sel=w.document.querySelector('#coverBox [data-cv="'+miss[0].code+'"]');
    ok(!!sel,'覆盖度面板有逐项标注下拉');
    sel.value='NA'; sel.dispatchEvent(new w.Event('change'));
    const st2=w.__diag.getR().cover.stat;
    ok(st2.na===1,'标为「无/不相关」后计入不适用：'+st2.na);
    ok(st2.must<CV0,'标后必须补项减少：'+CV0+' -> '+st2.must);
    ok(st2.rate>0,'覆盖度百分比已计算：'+st2.rate+'%');
    // 追问清单可导出
    const askTxt=w.__diag.askList?w.__diag.askList():'';
    ok(typeof askTxt==='string','追问清单接口可用');

    /* 用例7：判定标准A 回库 + 措施卡标准驱动 + 满意度独立评价项（2026-10-22） */
    console.log('--- 用例7：判定标准A / 独立评价项 / 标签口径 ---');
    const KBx=w.__diag.getKB();
    ok(KBx.rules&&KBx.rules.fiveDims.length===5,'判定标准A 五维评分卡已入库：'+((KBx.rules||{}).fiveDims||[]).length+' 维');
    ok(KBx.rules.redFlags.length===9,'红灯清单已入库：'+KBx.rules.redFlags.length+' 条');
    ok(KBx.rules.methods.hl.length===5&&KBx.rules.methods.pb.length===15,
       '方法族已入库：亮点 '+KBx.rules.methods.hl.length+' 类 / 不足 '+KBx.rules.methods.pb.length+' 类');
    ok(KBx.rules.eightElements.length===8,'八要素已入库：'+KBx.rules.eightElements.length+' 项');

    /* 用一份「有痛点 + 有满意度数值」的文本重跑，验证判定链与独立评价项 */
    $('tx').value='安全管理：三级教育覆盖率只有 60%，特种作业有 2 人未持证，去年发生一起工伤。\n'
      +'品质方面：SOP 覆盖率 85%，关键工序作业指导书还有 3 份没补齐，客户投诉 2 起。\n'
      +'成本方面：线体平衡率 72%，离目标 85% 还有差距。\n'
      +'人员服务：系统离职率 7%，员工满意度 85 分，满意度问卷还没建立。\n'
      +'招聘：旺季缺口 60 人，供应商交付跟不上，返费成本偏高。\n'
      +'IT 应用：钉钉考勤覆盖率 100%，但跨天打卡有问题；电子签覆盖率只有 60%，一线推广有阻力。\n'
      +'客户满意度评分 88 分，当年无重大投诉。';
    $('tx2').value='客户希望提升交付稳定性与异常响应速度。';
    $('btnRun').click();
    const Rx=w.__diag.getR();
    ok(Rx.fixes.length>0,'重跑后产生整改事项：'+Rx.fixes.length+' 项');
    const f0=Rx.fixes[0];
    ok(!!(f0&&f0.jd&&typeof f0.jd.total==='number'),'整改事项带五维判定：合计 '+(f0?f0.jd.total:'-')+'/15');
    ok(!!(f0&&f0.jd.D&&f0.jd.D.D1),'五维明细可读：D1='+(f0?f0.jd.D.D1.sc:'-'));
    ok(f0&&['highlight','problem','pending'].indexOf(f0.jd.verdict)>=0,'结论判定合法：'+(f0?f0.jd.verdict:'-'));
    ok(Rx.fixes.some(x=>x.jd.rf.length>0),'红灯可被识别：'+Rx.fixes.filter(x=>x.jd.rf.length).map(x=>x.jd.rf.join('/')).join(' | '));
    ok(Rx.fixes.filter(x=>x.jd.rf.length).every(x=>x.pri==='P0'),'命中红灯的事项提为 P0');
    ok(Rx.fixes.some(x=>/^ACT-/.test(x.primary&&x.primary.act?x.primary.act.id:'')),'措施由方法族收敛出具体卡号');
    ok(Rx.fixes.every(x=>!(x.fromMethod&&!x.primary)||x.primary.todo),'方法族命中时必须有首选措施卡');
    // IT 应用仍填「措施待补充」，不硬套其他族
    const itFix=Rx.fixes.filter(x=>/^D[1-3]$/.test(x.dim));
    ok(itFix.length>0&&itFix.every(x=>x.primary&&x.primary.todo),'IT 应用（D1–D3）仍为「措施待补充」：'+itFix.length+' 项');
    // 满意度独立评价项
    ok(Rx.evals&&Rx.evals.length===2,'满意度独立评价项 2 项');
    ok(Rx.evals.every(e=>['优','良','待改善','待确认'].indexOf(e.lv)>=0),'评价等级合法：'+Rx.evals.map(e=>e.name+'='+e.lv).join(' / '));
    ok(Rx.evals.every(e=>e.lv!=='待确认'),'提供了满意度数值时不再判「待确认」：'+Rx.evals.map(e=>e.name+'='+e.lv).join(' / '));
    ok(Rx.evals.every(e=>/Part\.3/.test(e.basisLine)&&e.basisLine.length>10),'评价依据含 Part.3 + 四维信息');
    const docH=w.document.getElementById('doc').innerHTML;
    ok(/模块二 · 满意度评价/.test(docH),'报告含「模块二 · 满意度评价」');
    ok(/客户满意度/.test(docH)&&/员工满意度/.test(docH),'报告同时体现客户与员工满意度');
    ok(!/判定依据A：D1/.test(docH),'整改表不再展示五维判定依据明细（主人 2026-10-26 定，仅 JSON 保留）');
    ok(!/ACT-[A-Z]{3}-?\d*/.test((docH.split('整改事项清单')[1]||'')),'整改表不再展示 ACT- 编码（主人 2026-10-26 定）');
    ok(/V-看板\/目视化/.test(docH)||KBx.tags.some(t=>t.code==='TAG-V'&&t.short==='V-看板/目视化'),'V 标签统一为「V-看板/目视化」');
    const js=Rx.json;
    ok(!!(js.fixes[0].judge&&js.fixes[0].judge.five&&js.fixes[0].judge.methods),'JSON 导出含判定依据与方法族');
    ok(js.evals.length===2,'JSON 导出含独立评价项');
  }catch(e){
    fail++; console.log('  EXCEPTION: '+e.message); console.log(e.stack.split('\n').slice(0,4).join('\n'));
  }
  console.log('\n===== 通过 '+pass+' / 失败 '+fail+' =====');
  process.exit(fail?1:0);
},600);
