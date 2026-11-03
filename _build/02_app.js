/* ============================================================
   ops-diagnosis-agent  v2.0  应用引擎
   ① 四维子项审查 ② 100 分制评分 + K 折算 ③ 客户需求/痛点/亮点提取
   ④ 措施收敛 ⑤ 优先级排序 ⑥ 严格按走访报告模板渲染 ⑦ 管理员知识库后台
   ============================================================ */
(function(){
'use strict';

/* ---------------- 基础工具 ---------------- */
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function deep(o){return JSON.parse(JSON.stringify(o));}
function clone(o){return deep(o);}
function pad(n){return n<10?'0'+n:''+n;}
function ymd(d){var x=d?new Date(d):new Date();return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());}
function addDays(base,n){var d=base?new Date(base):new Date();d.setDate(d.getDate()+n);return ymd(d);}
function round1(n){return Math.round(n*10)/10;}
function uniq(a){var o={},r=[];a.forEach(function(x){if(!o[x]){o[x]=1;r.push(x);}});return r;}
function splitList(s){return String(s||'').split(/[、,，;；\n\r]+/).map(function(x){return x.trim();}).filter(Boolean);}
function inArr(a,b){for(var i=0;i<b.length;i++){if(a.indexOf(b[i])>=0)return b[i];}return null;}
function toast(m){var t=$('toast');if(!t)return;t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove('on');},2200);}

/* ---------------- 知识库装载 ---------------- */
var KBKEY='opsdiag.kb.v2', LOGS='opsdiag.kb.log';
var KB=null, KBDirty=false;
function loadKB(){
  try{
    var s=localStorage.getItem(KBKEY);
    if(s){
      var o=JSON.parse(s);
      if(o&&o.meta&&o.score&&o.aspects){
        /* 旧版本知识库补齐新增节点（判定标准 / 独立评价项 / 覆盖度判定 / 布局 / 写作要求 / 管理员密钥） */
        var seed=window.__KB_SEED__||{};
        ['cover','layout','guide','rules','evals','files','mdState','hints'].forEach(function(k){ if(o[k]==null&&seed[k]!=null) o[k]=deep(seed[k]); });
        if(seed.cfg){ for(var c in seed.cfg){ if(o.cfg&&o.cfg[c]===undefined) o.cfg[c]=seed.cfg[c]; } }
        /* 布局迁移（2026-10-22）：覆盖度移出报告，满意度评价块入报告 */
        if(o.layout&&o.layout.report){
          o.layout.report=o.layout.report.filter(function(b){return b.id!=='secCover';});
          var hasEv=o.layout.report.some(function(b){return b.id==='secEval';});
          if(!hasEv){
            var evDef=(seed.layout&&seed.layout.report||[]).filter(function(b){return b.id==='secEval';})[0]||{id:'secEval',name:'模块二 · 满意度评价（客户 / 员工独立评价项）',on:true};
            var at=1; o.layout.report.splice(at,0,deep(evDef));
          }
        }
        return o;
      }
    }
  }catch(e){}
  return deep(window.__KB_SEED__);
}
function saveKB(silent){
  try{
    localStorage.setItem(KBKEY,JSON.stringify(KB));
    try{
      var lg=JSON.parse(localStorage.getItem(LOGS)||'[]');
      lg.unshift({t:ymd(),v:KB.meta.ver,n:(KB.log&&KB.log[0]&&KB.log[0].m)||'后台更新'});
      localStorage.setItem(LOGS,JSON.stringify(lg.slice(0,50)));
    }catch(e){}
    KBDirty=false; if(!silent) toast('知识库已保存到本机（v'+KB.meta.ver+'）');
    paintVer(); return true;
  }catch(e){ toast('保存失败：'+e.message); return false; }
}
function bumpVer(){
  var p=String(KB.meta.ver||'2.0.0').split('.');
  p[2]=(parseInt(p[2]||0,10)+1);
  KB.meta.ver=p.join('.');
  KB.meta.updated=ymd();
}
function paintVer(){
  var v=$('kbVer'); if(v) v.textContent='知识库 v'+(KB&&KB.meta.ver)+' · '+(KB&&KB.meta.updated);
  try{
    var lg=JSON.parse(localStorage.getItem(LOGS)||'[]');
    if(lg.length&&KB){ /* history kept */ }
  }catch(e){}
}

/* ---------------- 索引 ---------------- */
var IDX={dims:{}, rows:{}, acts:[], kp:null};
function buildIndex(){
  IDX.dims={}; IDX.rows={};
  (KB.aspects||[]).forEach(function(a){
    (a.items||[]).forEach(function(it){ IDX.dims[it.code]={item:it,aspect:a}; });
  });
  (KB.score.rows||[]).forEach(function(r){ IDX.rows[r.id]=r; });
  IDX.acts=[];
  /* 措施卡来源优先级：知识库内 acts（MD 回写） > 旧版 ACT 常量 */
  if(KB.acts&&KB.acts.length){
    KB.acts.forEach(function(x){ if(x&&x.id&&x.act) IDX.acts.push({id:x.id,act:x.act}); });
  }else if(typeof ACT==='object'){
    for(var k in ACT){ var a=ACT[k]; IDX.acts.push({id:k,act:a}); }
  }
  IDX.kp=(KB.kp&&Object.keys(KB.kp).length)?KB.kp:((typeof KP==='object')?KP:null);
}
function dimsOf(aspect){
  var out=[];
  (KB.aspects||[]).forEach(function(a){ if(a.code===aspect) out=a.items||[]; });
  return out;
}
function aspectOf(code){
  var r=null;
  (KB.aspects||[]).forEach(function(a){ (a.items||[]).forEach(function(it){ if(it.code===code) r=a; }); });
  return r;
}
function tagShort(code){
  for(var i=0;i<KB.tags.length;i++) if(KB.tags[i].code===code) return KB.tags[i].short;
  return code;
}

/* ---------------- 文本处理 ---------------- */
var RE_SPLIT=/[\n\r。！？；;!?]+/;
function sentences(t){ return String(t||'').split(RE_SPLIT).map(function(s){return s.trim();}).filter(function(s){return s.length>1;}); }
function listNums(s){
  var out=[],re=/(\d+(?:\.\d+)?)\s*(%|‰|分|万元|万|元|天|日|人|起|次|件|个|ppm|PPM)?/g,m;
  while((m=re.exec(String(s||'')))){ out.push({v:parseFloat(m[1]),unit:m[2]||'',pos:m.index,end:m.index+m[0].length}); }
  return out;
}
function inArr(a,b){for(var i=0;i<b.length;i++){if(a.indexOf(b[i])>=0)return b[i];}return null;}
function hasAny(s,arr){ return inArr(s,arr); }
/* 已闭环/已消除表述不作为负面判定（沿用 v1 RF_DONE 思路，避免误伤） */
var NEG_DONE=/未发生|零事故|零投诉|0事故|无事故|无投诉|已消除|已闭环|已整改|归零|降至\s*0|降到\s*0|已解决|历史曾/;
function isNeg(s){ if(NEG_DONE.test(s)) return null; return inArr(s,KB.extract.pain.neg); }
/* 解决「指标串台」：取紧贴指标名之后的第一个数 */
function bindMetric(text,pats){
  var T=String(text||''),best=null;
  (pats||[]).forEach(function(p){
    var i=T.indexOf(p);
    while(i>=0){
      var seg=T.slice(i,Math.min(T.length,i+p.length+30));
      var nums=listNums(seg);
      var pick=null;
      var ai=seg.indexOf('实际');
      if(ai>=0){
        for(var j=0;j<nums.length;j++){ if(nums[j].pos>ai){pick=nums[j];break;} }
      }
      if(!pick){
        for(var k=0;k<nums.length;k++){
          var n=nums[k];
          if(n.pos>=p.length && n.pos-p.length<26 && (n.unit==='%'||n.unit==='分'||n.unit==='')){ pick=n; break; }
        }
      }
      if(pick && (!best || pick.pos<best.pos)) best={v:pick.v,unit:pick.unit,pos:pick.pos+i};
      i=T.indexOf(p,i+1);
    }
  });
  return best?best.v:null;
}
/* 共用指標抗串台：同名指标（如三条「推进计划达成率」）必须同时命中本方面上下文词才取值 */
function bindCtx(T,row){
  var pats=row.pat||[];
  /* 2026-10-26 修复：MD 往返会把「上下文约束：—」解析成空数组 []，
     而种子里该字段是 undefined；两者语义同为「不做上下文限定」，必须走 bindMetric 全文取值，
     否则句子级过滤永远命中不了 → 指标取不到值（曾导致总分 55 掉到 18）。 */
  if(!row.ctx||!row.ctx.length) return bindMetric(T,pats);
  var ss=sentences(T), scoped='';
  ss.forEach(function(s){
    if(inArr(s,pats) && inArr(s,row.ctx)) scoped+=s+'\n';
  });
  if(!scoped.trim()) return null;
  return bindMetric(scoped,pats);
}
/* 「系统 X%，实际 Y%」双值取值与展示 */
function bindDual(text,pats){
  var T=String(text||''), hit=null;
  (pats||[]).forEach(function(p){
    var i=T.indexOf(p);
    if(i>=0 && (!hit||i<hit)) hit=i;
  });
  if(hit==null) return null;
  var seg=T.slice(hit,Math.min(T.length,hit+40));
  var sm=seg.match(/系统[^\d]{0,3}([\d.]+)\s*%/), am=seg.match(/实际[^\d]{0,3}([\d.]+)\s*%/);
  if(sm&&am) return {sys:parseFloat(sm[1]),act:parseFloat(am[1]),v:parseFloat(am[1]),txt:'系统'+sm[1]+'%，实际'+am[1]+'%'};
  return null;
}

/* ---------------- 档位求值 ---------------- */
function evalRow(row,x){
  var t=row.type;
  if(t==='band'){
    /* 取「所有成立档位中的最高分」——兼容两类写法：
       互斥式（X＜90 / 90≤X＜100 / 100≤X）与累计式（X>80 / X>85 / X>90）均可正确取值 */
    var best=null, hit=false;
    for(var i=0;i<row.bands.length;i++){
      var b=row.bands[i]; if(!b.e) continue;
      var tf=false;
      try{ tf=!!Function('X','return ('+b.e+')')(x); }catch(e){ tf=false; }
      if(tf){ hit=true; var bv=(b.v==null?0:b.v); if(best==null||bv>best) best=bv; }
    }
    return hit?(best||0):0;
  }
  if(t==='ladder_up'){
    var L=row.ladder;
    if(x>=L.cap) return L.capScore;
    if(L.zero!=null && x===0) return L.zero;
    var s=Math.floor(x/L.step)*L.per;
    return Math.max(L.zero||0,Math.min(L.capScore,s));
  }
  if(t==='ladder_down'){
    var D=row.ladder;
    if(x>=D.zeroAt) return 0;
    if(x<D.capLow) return D.capScore;
    return Math.max(0,Math.min(D.capScore,Math.floor((D.zeroAt-x)/D.step)*D.per));
  }
  if(t==='full100'){ return x>=100?row.max:0; }
  if(t==='qual'||t==='qual3'){ return bandV(row,x); }
  return 0;
}
function bandV(row,lv){
  for(var i=0;i<row.bands.length;i++){ if(row.bands[i].e===String(lv)) return row.bands[i].v; }
  return row.bands.length?row.bands[row.bands.length-1].v:0;
}

/* ---------------- 流程日志 ---------------- */
var STEPS=[
 {k:'S1',n:'文本归一'},
 {k:'S2',n:'四维命中'},
 {k:'S3',n:'指标抽取'},
 {k:'S4',n:'信息提取'},
 {k:'S5',n:'评分赋分'},
 {k:'S6',n:'措施与排序'}
];
var pstate=[];
function paintRail(cur){
  var r=$('rail'),rn=$('railNames');
  if(!r) return;
  r.innerHTML=STEPS.map(function(s,i){ return '<i class="'+(i<cur?'done':(i===cur?'act':''))+'"></i>'; }).join('');
  if(rn) rn.innerHTML=STEPS.map(function(s){return '<span>'+s.k+' '+s.n+'</span>';}).join('');
}
function pLog(tag,txt,cls){
  pstate.push({tag:tag,txt:txt});
  var w=$('plog'); if(!w) return;
  var el=document.createElement('div');
  el.className='pitem'+(cls?' '+cls:'');
  el.innerHTML='<span class="k">'+esc(tag)+'</span><span class="v">'+txt+'</span>';
  w.appendChild(el);
}
function pReset(){
  pstate=[]; var w=$('plog'); if(w) w.innerHTML='';
  var ia=$('idleArt'); if(ia) ia.style.display='none';
  paintRail(-1);
}
function pNow(txt){ var n=$('jNow'); if(n) n.textContent=txt; }
function setPill(txt){ var p=$('pillText'); if(p) p.textContent=txt; }

/* ---------------- KPI 面板 ---------------- */
var KPIV={};   // rowId -> {v:'', na:false, manual:false}
function kpiRows(){
  return (KB.score.rows||[]).filter(function(r){
    return (r.part==='P1') || (r.part==='P2'&&r.type!=='qual') || (r.part==='P3'&&r.type==='band');
  });
}
function renderKpi(){
  var box=$('kpiBox'); if(!box) return;
  var rows=kpiRows();
  box.innerHTML=rows.map(function(r){
    var st=KPIV[r.id]||{};
    var unit=(r.target||'').indexOf('%')>=0?'%':((r.target||'').indexOf('分')>=0?'分':'');
    return '<div class="row" data-rid="'+r.id+'">'
      +'<div class="nm" title="'+esc(r.hint||'')+'">'+esc((r.aspect?r.aspect+'·':'')+r.name)+'<span style="color:#8aa; font-size:11px"> 满分'+r.max+'</span></div>'
      +'<input data-k="v" value="'+esc(st.v==null?'':st.v)+'" placeholder="实际" />'
      +'<div style="font-size:12px;color:#8fd3d0;text-align:center" data-k="s">—</div>'
      +'<label class="na"><input type="checkbox" data-k="na" '+(st.na?'checked':'')+' />不适用</label>'
      +'</div>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('.row'),function(row){
    var rid=row.getAttribute('data-rid');
    row.querySelector('[data-k=v]').addEventListener('input',function(){
      KPIV[rid]=KPIV[rid]||{}; KPIV[rid].v=this.value; KPIV[rid].manual=true;
      if(String(this.value).trim()!=='') KPIV[rid].na=false, row.querySelector('[data-k=na]').checked=false;
      try{
        var n=parseFloat(String(this.value).replace(/[^0-9.\-]/g,''));
        var rr=IDX.rows[rid];
        row.querySelector('[data-k=s]').textContent = isNaN(n)?'—':evalRow(rr,n);
      }catch(e){}
    });
    row.querySelector('[data-k=na]').addEventListener('change',function(){
      KPIV[rid]=KPIV[rid]||{}; KPIV[rid].na=this.checked;
      if(this.checked){ KPIV[rid].v=''; row.querySelector('[data-k=v]').value=''; }
      row.querySelector('[data-k=s]').textContent=this.checked?'N/A':'—';
    });
  });
}
function grab(){
  var T=($('tx')?$('tx').value:'')+'\n'+($('tx2')?$('tx2').value:'');
  var n=0;
  kpiRows().forEach(function(r){
    if(KPIV[r.id]&&KPIV[r.id].manual) return;
    var d=null;
    if(r.part==='P1'||r.part==='P3') d=bindDual(T,r.pat);
    var v=d?d.v:bindCtx(T,r);
    if(v==null && (r.type==='full100')){
      if(/全覆盖|100%覆盖|全部.*覆盖/.test(T)) v=100;
      else if(/未覆盖|没有钉钉|纸质|未上/.test(T)) v=0;
    }
    if(v!=null){
      KPIV[r.id]=KPIV[r.id]||{};
      KPIV[r.id].v=String(v); KPIV[r.id].na=false; KPIV[r.id]._txt=d?d.txt:null;
      n++;
    }
  });
  renderKpi();
  toast(n?('抓取到 '+n+' 项数值，可人工修正'):'未从文本中抓到可用数值，可手工填写');
}

/* ---------------- Step 2：四维子项命中 ---------------- */
var POSMK=['成册','可追溯','留痕','100%','全覆盖','闭环','达标','表彰','验收','标准化','制度完善','体系完整','获奖','被采纳','借鉴','稽核通过','已量化','台账完整','0事故','零事故','零投诉','日报','周报'];
var MECMK=['建立','成立','已','有','开展','实施','每周','每日','每月','机制','制度','台账','记录','流程','管控','面试','辅导','月度','季度','上线','导入'];
function analyzeDims(T){
  var ss=sentences(T), neg=KB.extract.pain.neg, out={}, present=[];
  (KB.aspects||[]).forEach(function(a){
    (a.items||[]).forEach(function(it){
      var kws=it.kw||[], sents=[], pos=0, mec=0, ng=0, kwHit=[];
      ss.forEach(function(s){
        var hit=false,hk=null;
        for(var i=0;i<kws.length;i++){ if(s.indexOf(kws[i])>=0){hit=true;hk=kws[i];break;} }
        if(!hit) return;
        sents.push(s); kwHit.push(hk);
        if(hasAny(s,POSMK)) pos++;
        else if(hasAny(s,MECMK)) mec++;
        if(isNeg(s)) ng++;
      });
      var lv=0;
      if(sents.length){ lv = pos>0?3 : (mec>0?2 : 1); }
      out[it.code]={code:it.code,name:it.name,aspect:a.code,aspectName:a.name,
        reviews:it.reviews,signals:it.signals,tags:it.tags||[],families:it.families||[],
        hits:sents.length,pos:pos,mec:mec,neg:ng,lv:lv,sents:sents,kw:uniq(kwHit)};
      if(sents.length) present.push(it.code);
    });
  });
  return {map:out,present:present};
}

/* ---------------- Step 2.5：判定标准A（五维 + 红灯 + 结论） ----------------
   来源：01_RULE_问题识别与方法匹配判定标准.md v1.1。五维各 0–3 分、满分 15；
   结论：≥12 且 D3≥2 且无红灯且证据≥2 → 亮点；≤8 或命中红灯 → 不足；其余 → 待确认。
   注：这里的分数是「按文本证据估算」，用于定性并驱动措施族选择；不等于走访评分表的分值。 */
var NUMRE=/\d+(\.\d+)?\s*(%|％|个点|人|件|万元|元|万|小时|分钟|天|次|条|台|月|年)/;
function judge(it,sents){
  var txt=Array.isArray(sents)?sents.join('。'):String(sents||'');
  var R=KB.rules||{}, dims={};
  (R.fiveDims||[]).forEach(function(d){
    var hits=[];
    (d.signals||[]).forEach(function(w){ if(w&&txt.indexOf(w)>=0) hits.push(w); });
    var sc;
    if(d.code==='D1'){
      /* 覆盖率用「审查要点被文本覆盖的比例」估，比关键词计数更贴近原义 */
      var rv=(it&&it.reviews)||[], cov=0;
      rv.forEach(function(r){
        var seg=String(r).split(/[\/、,，;；\s]+/).filter(function(x){return x.length>=2;});
        for(var i=0;i<seg.length;i++){ if(txt.indexOf(seg[i])>=0){cov++;break;} }
      });
      if(rv.length){ var rt=cov/rv.length; sc = rt>=0.9?3:(rt>=0.5?2:(cov>0?1:0)); }
      else { sc = hits.length>=3?3:(hits.length===2?2:(hits.length?1:0)); }
    }else if(d.code==='D3'){
      sc = NUMRE.test(txt) ? (hits.length>=2?3:2) : (hits.length>=2?2:(hits.length?1:0));
    }else{
      sc = hits.length>=3?3:(hits.length===2?2:(hits.length?1:0));
    }
    dims[d.code]={sc:sc,hits:hits.slice(0,4)};
  });
  var total=0; for(var k in dims) total+=dims[k].sc;
  /* 红灯扫描：命中即否决；已闭环/已整改的句子不算（isNeg 识别「已完成/已闭环」类表述） */
  var rf=[];
  (R.redFlags||[]).forEach(function(f){
    (f.signals||[]).forEach(function(w){
      if(!w||txt.indexOf(w)<0) return;
      var ss=txt.split(/[。；;\n]/), bad=false;
      for(var i=0;i<ss.length;i++){ if(ss[i].indexOf(w)>=0 && !isNeg(ss[i])){ bad=true; break; } }
      if(bad && rf.indexOf(f.code)<0) rf.push(f.code);
    });
  });
  var ev=Array.isArray(sents)?sents.filter(Boolean).length:0;
  var V=R.verdict||{}, verdict='pending';
  if(rf.length) verdict='problem';
  else if(total>=(V.highlight&&V.highlight.min||12) && dims.D3.sc>=(V.highlight&&V.highlight.d3||2) && ev>=(V.highlight&&V.highlight.ev||2)) verdict='highlight';
  else if(total<=(V.problem&&V.problem.max||8)) verdict='problem';
  /* 置信度护栏：证据太少一律降级待确认 */
  var conf=Math.max(0.3,Math.min(0.95,0.45+0.08*ev+0.015*total));
  if(conf<0.60) verdict='pending';
  var weak=[];
  ['D1','D2','D3','D4','D5'].forEach(function(c){ if(dims[c]&&dims[c].sc<=1) weak.push(c); });
  weak.sort(function(a,b){return dims[a].sc-dims[b].sc;});
  return {D:dims,total:total,rf:rf,ev:ev,verdict:verdict,weak:weak,conf:Math.round(conf*100)/100};
}
/* 弱维 / 红灯 → 方法族 → 措施卡ID 池（判定标准A §5.3 优先序） */
function methodsFor(jd){
  var R=KB.rules||{}, mb=(R.methods&&R.methods.pb)||[], out=[], human=false;
  function add(code){ if(out.indexOf(code)<0) out.push(code); }
  function famOf(code){ for(var i=0;i<mb.length;i++){ if(mb[i].code===code) return mb[i]; } return null; }
  /* 1) 红灯优先 */
  var rfFams=[];
  var has=function(list){ for(var i=0;i<list.length;i++){ if(jd.rf.indexOf(list[i])>=0) return true; } return false; };
  if(has(['RF-01','RF-04','RF-05'])){ add('M-POK'); add('M-RCA'); rfFams=['M-POK','M-RCA']; }
  if(has(['RF-02','RF-08'])){ add('M-RSK'); add('M-POK'); rfFams=rfFams.concat(['M-RSK','M-POK']); }
  if(has(['RF-07'])){ add('M-DAT'); add('M-STD'); rfFams=rfFams.concat(['M-DAT','M-STD']); }
  if(has(['RF-09'])) human=true;
  /* 2) 弱维（严格按判定标准A §5.3 的优先序，不按方法卡自带的 dims 扩展，避免全库落到同一张卡） */
  var order=[['D1',['M-SOP']],['D4',['M-DAT','M-STD']],['D5',['M-DAT','M-STD']],['D2',['M-TRN','M-AUD']],['D3',['M-RCA','M-IE']]];
  order.forEach(function(p){
    if(jd.weak.indexOf(p[0])<0) return;
    p[1].forEach(add);
  });
  var byFamily={}, acts=[];
  out.forEach(function(c){
    var m=famOf(c)||(R.methods&&R.methods.hl||[]).filter(function(x){return x.code===c;})[0];
    byFamily[c]=(m&&m.acts)?m.acts.slice():[];
    byFamily[c].forEach(function(a){ if(acts.indexOf(a)<0) acts.push(a); });
  });
  return {codes:out,byFamily:byFamily,acts:acts,rfFams:rfFams,human:human};
}
function pickActIds(ids,s,fams){
  if(!ids||!ids.length) return null;
  var pool=IDX.acts.filter(function(x){return ids.indexOf(x.id)>=0;});
  if(!pool.length) return null;
  /* 同分时优先子项自身措施族（保证措施与本子项语义一致），再按卡号稳定排序 */
  pool=pool.slice().sort(function(a,b){
    var ia=fams?fams.indexOf(a.act.f):-1, ib=fams?fams.indexOf(b.act.f):-1;
    if(ia<0) ia=99; if(ib<0) ib=99;
    return (ia-ib)||(a.id<b.id?-1:1);
  });
  var best=pool[0],bs=-1;
  pool.forEach(function(x){
    var sc=0;
    String(x.act.tr||'').split(/[、,，;；\s]+/).forEach(function(w){ if(w.length>1 && s.indexOf(w)>=0) sc+=2; });
    if(fams&&fams.indexOf(x.act.f)>=0) sc+=1;
    if(sc>bs){bs=sc;best=x;}
  });
  return {act:best,score:bs};
}

/* ---------------- Step 3/5：评分 ---------------- */
function aspectLevel(aspect,dmap){
  var ds=dimsOf(aspect).filter(function(d){return d.code!=='E1'&&d.code!=='E2';});
  var tot=0,sum=0,hitn=0,posn=0;
  ds.forEach(function(d){ var m=dmap[d.code]; tot+=3; sum+=(m?m.lv:0); if(m&&m.hits){hitn++; if(m.pos>0)posn++;} });
  if(hitn===0) return {lv:0,ratio:0,hitn:hitn,posn:posn,tot:ds.length};
  var ratio=sum/tot;
  var lv = ratio>=0.55?3 : (ratio>=0.28?2 : 1);
  return {lv:lv,ratio:ratio,hitn:hitn,posn:posn,tot:ds.length};
}
function buildScore(T,dmap){
  var rowsOut=[], parts={P1:0,P2:0,P3:0,P4:0}, naSum=0, pend=[];
  (KB.score.rows||[]).forEach(function(r){
    var st=KPIV[r.id]||{}, got=null, state='TBD', actual='', sugg='', lv=null, basis=r.bands.map(function(b){return b.d;});
    var srcAuto='';
    if(r.part==='P4'){
      // 加分项由亮点驱动，见 R.hlBonus
      rowsOut.push({row:r,got:0,state:'BONUS',actual:'',sugg:'',src:''});
      return;
    }
    if(r.type==='qual'){
      var A=aspectLevel(r.aspect,dmap);
      lv=A.lv;
      if(lv===0){ state='TBD'; got=0; actual='未提及'; sugg='本次输入未涉及「'+r.aspect+'」方面，建议补充现场查验描述'; }
      else{
        state='OK'; got=bandV(r,lv);
        var names=dimsOf(r.aspect).filter(function(d){return dmap[d.code]&&dmap[d.code].hits;}).map(function(d){return d.name;});
        actual=(lv===3?'体系成熟，':(lv===2?'基本无盲区，':'存在明显盲区，'))+(names.slice(0,4).join('、')||'—');
        srcAuto='（'+r.aspect+' 方面 '+A.hitn+'/'+A.tot+' 子项有描述，其中 '+A.posn+' 项有正向记录）';
        if(lv<3) sugg=r.aspect+' 方面 '+(A.tot-A.hitn)+' 个子项未涉及，建议补充后复核';
      }
      rowsOut.push({row:r,got:got,state:state,actual:actual,sugg:sugg,src:srcAuto,lv:lv});
      return;
    }
    if(r.type==='sat3'){
      var honor=/表彰|表扬信|奖状|奖杯/.test(T), comp=/投诉|客诉|索赔|异常升级/.test(T);
      var cs=bindMetric(T,['客户满意度','满意度评分']);
      if(honor && cs!=null && cs>90){
        got=bandV(r,3); state='OK'; actual='满意度'+cs+'，且获客户表彰'; srcAuto='（文本抓取：表彰 + 满意度评分）';
      }else if(!comp && cs!=null && cs>90){
        got=bandV(r,2); state='OK'; actual='无投诉/升级，满意度评分 '+cs; srcAuto='（文本抓取）';
      }else if(!comp && (honor||cs!=null)){
        got=bandV(r,1); state='OK'; actual='当年无客户投诉、异常升级等问题'; srcAuto='（文本抓取）';
        sugg='满意度评分未达 >90 档（当前 '+cs+'），建议取得客户书面评价佐证';
      }else if(comp){
        got=bandV(r,1); state='OK'; actual='当期存在客户投诉/异常升级，按最低档计分'; srcAuto='（文本抓取）';
        sugg='存在投诉/索赔记录，需先闭环并取得客户复评后再议能否上调档位';
      }else{
        got=0; state='TBD'; actual='无客户评价依据'; sugg='缺客户满意度评分与投诉记录，建议补充客户书面评价';
      }
      rowsOut.push({row:r,got:got,state:state,actual:actual,sugg:sugg,src:srcAuto});
      return;
    }
    var manual=(st.v!=null&&String(st.v).trim()!=='');
    var v=manual?parseFloat(String(st.v).replace(/[^0-9.\-]/g,'')):null;
    if(st._txt) actual=st._txt;
    if(!manual){
      var d=bindDual(T,r.pat); if(d){ v=d.v; actual=d.txt; }
      else{ var bv=bindCtx(T,r); if(bv!=null){ v=bv; actual=bv+(r.part==='P1'?'%':''); } }
      if(v==null && r.type==='full100'){
        if(/全覆盖|100%覆盖|全部覆盖/.test(T)) { v=100; actual='全覆盖'; }
        else if(/未覆盖|没有钉钉|纸质签到|未上钉钉|手工签到/.test(T)) { v=0; actual='未使用 / 手工台账'; }
      }
    }
    if(st.na){ state='NA'; got=0; actual=actual||'——'; naSum+=r.max; }
    else if(v!=null&&!isNaN(v)){
      state='OK'; got=evalRow(r,v);
      if(!actual) actual=v+(r.part==='P1'&&String(r.target).indexOf('%')>=0?'%':'');
    }else{
      state='TBD'; got=0; actual='无量化数据';
      sugg='缺「'+r.name+(r.part==='P2'?('（'+(aspectNameOf(r.aspect)||r.aspect)+'）'):'')+'」依据数据，建议补充系统口径与实际口径两个数值';
      pend.push(r.name+(r.part==='P2'&&r.name==='推进计划达成率'?('（'+(aspectNameOf(r.aspect)||r.aspect)+'方面）'):''));
    }
    rowsOut.push({row:r,got:got,state:state,actual:actual,sugg:sugg,src:(st.manual?'（人工录入）':'（文本抓取）'),v:v});
  });
  // Part 汇总
  rowsOut.forEach(function(o){
    if(o.state==='BONUS') return;
    if(o.row.part==='P4') return;
    parts[o.row.part]+=(o.got||0);
  });
  return {rows:rowsOut,parts:parts,naSum:naSum,pend:pend};
}

/* ---------------- Step 4：信息提取 ---------------- */
function extractInfo(T,tx2){
  var needPats=KB.extract.need.pat, neg=KB.extract.pain.neg, pos=KB.extract.hl.pos;
  var ss=sentences(T), s2=sentences(tx2||'');
  var needs=[],pains=[],hls=[];
  ss.concat(s2.map(function(s){return '[补充] '+s;})).forEach(function(s){
    if(hasAny(s,needPats)) needs.push({t:s,src:s.indexOf('[补充]')===0?'项目经理补充':'走访口述'});
  });
  var SUS=['每周','每日','常态化','固化','持续','稳定运行','机制化','定期','月度','连续'],
      SHOW=['看板','案例','成册','展示','墙','报表','标准化','制度','宣传'],
      HONOR=['表彰','表扬信','奖状','奖杯','获奖','获客户'],
      ADOPT=['借鉴','推广','复制','已在','上线','采纳'];
  ss.concat(s2.map(function(s){return '[补充] '+s;})).forEach(function(s){
    var isSup=s.indexOf('[补充]')===0;
    var n=listNums(s);
    var nk=isNeg(s), pk=hasAny(s,pos);
    var isNeed=hasAny(s,needPats);
    if(nk){
      pains.push({t:s,neg:nk,src:isSup?'项目经理补充':'走访口述'});
    }else if(pk && !isNeed){
      // 客户需求/要求句不属于「已有成果」，不进亮点候选
      hls.push({t:s,pos:pk,num:n.length?n[0]:null,
        sus:!!hasAny(s,SUS),show:!!hasAny(s,SHOW),src:isSup?'项目经理补充':'走访口述'});
    }
  });
  // 亮点门槛（02 册 §5.2）：证据 ≥2 条可观测线索 → 亮点；1 条 → 阶段性成效；0 条 → 待确认
  hls.forEach(function(h){
    var ev=0, why=[];
    if(h.num){ ev++; why.push('有量化结果'); }
    if(h.sus){ ev++; why.push('有持续机制'); }
    if(h.show){ ev++; why.push('可对外展示'); }
    if(hasAny(h.t,HONOR)){ ev+=2; why.push('获客户表彰'); }
    if(hasAny(h.t,ADOPT)){ ev++; why.push('可被复制/采纳'); }
    h.gate=ev; h.why=why;
    h.level = ev>=2 ? '亮点' : (ev===1 ? '阶段性成效' : '待确认');
  });
  return {needs:needs,pains:pains,hls:hls};
}

/* ---------------- Step 6：痛点归类 + 措施收敛 + 优先级 ---------------- */
function mapDim(s){
  var best=null,bn=0;
  (KB.aspects||[]).forEach(function(a){
    (a.items||[]).forEach(function(it){
      var n=0; (it.kw||[]).forEach(function(k){ if(s.indexOf(k)>=0) n++; });
      if(n>bn){bn=n;best={it:it,a:a};}
    });
  });
  return best;
}
function pickAct(fams,s){
  var pool=IDX.acts.filter(function(x){return fams.indexOf(x.act.f)>=0;});
  if(!pool.length) return null;
  var best=pool[0],bs=-1;
  pool.forEach(function(x){
    var sc=0;
    var tr=String(x.act.tr||'');
    // 触发词按「、/，/ 」切分后与句子比对
    tr.split(/[、,，;；\s]+/).forEach(function(w){
      if(w.length>1 && s.indexOf(w)>=0) sc+=2;
    });
    if(s.indexOf(x.act.f)>=0) sc+=1;
    if(sc>bs){bs=sc;best=x;}
  });
  return {act:best,score:bs};
}
function stars(s){
  var st=KB.priority.stars;
  for(var i=5;i>=1;i--){
    var arr=st[String(i)]; if(!arr) continue;
    if(hasAny(s,arr)) return i;
  }
  return 3;
}
function urgency(s,k){
  var u=KB.priority.urgency;
  ['高','中','低'].forEach(function(lv){
    if(hasAny(s,u[lv]||[])) { if(k.rank==null) k.rank=lv; }
  });
  return k.rank||'低';
}
/* 归并粒度：同一子维度内，若命中不同「审查要点」则拆成不同事项（如品质维度的客诉 vs SOP 缺口） */
function subKey(it,s){
  var revs=it.reviews||[];
  for(var i=0;i<revs.length;i++){
    var seg=revs[i].split(/[\/、,，;；\s]+/).filter(function(x){return x.length>=2;});
    for(var j=0;j<seg.length;j++){ if(s.indexOf(seg[j])>=0) return it.code+'#'+i; }
  }
  return it.code+'#x';
}
function sim(a,b){ // 二元组 Jaccard 相似度
  var A={},B={},i;
  for(i=0;i<a.length-1;i++) A[a.substr(i,2)]=1;
  for(i=0;i<b.length-1;i++) B[b.substr(i,2)]=1;
  var inter=0,uni=0,k;
  for(k in A){ if(B[k]) inter++; uni++; }
  for(k in B){ if(!A[k]) uni++; }
  return uni?inter/uni:0;
}
function common3(a,b){ // 共同三字片段数量
  var A={},i,c=0;
  for(i=0;i<a.length-2;i++) A[a.substr(i,3)]=1;
  for(i=0;i<b.length-2;i++) if(A[b.substr(i,3)]){ A[b.substr(i,3)]=0; c++; }
  return c;
}
function sameTopic(a,b){ return common3(a,b)>=1 || sim(a,b)>=0.22; }
function urgRank(u){ return u==='高'?0:(u==='中'?1:2); }
/* 同一子维度可能命中多条痛点：取「最重要最紧急」的一条作代表，其余留作佐证 */
function makeFix(gm,list0){
  var p=list0[0], it=gm.it, fams=it.families||[];
  /* 判定标准A：先按五维+红灯定性，再由红灯/弱维选方法族，最后在方法族给定的措施池里收敛。
     择优规则：候选方法族中，选「措施卡与本子项措施族重叠最多」的那一族（红灯命中时红灯族直通）。 */
  var jd=judge(it,list0.map(function(x){return x.t;}));
  var M=methodsFor(jd);
  var famOfAct={};
  IDX.acts.forEach(function(x){ famOfAct[x.id]=x.act.f; });
  function interOf(ids){ return (ids||[]).filter(function(id){ return fams.indexOf(famOfAct[id])>=0; }); }
  var ids=[], chosen=null, fromMethod=false, note='';
  if(!fams.length){
    note='该子项未绑定措施族';                      /* IT 应用 D1–D3 / C6：措施待补充，不硬套其他族 */
  }else if(jd.rf.length && M.rfFams.length){
    chosen=M.rfFams[0]; fromMethod=true;
    ids=interOf(M.byFamily[chosen]||[]);
    if(!ids.length){ ids=(M.byFamily[chosen]||[]).slice(); }
  }else{
    var best=null,bestN=-1;
    (M.codes||[]).forEach(function(c){
      var n=interOf(M.byFamily[c]||[]).length;
      if(n>bestN){ bestN=n; best=c; }
    });
    if(bestN>0){ chosen=best; fromMethod=true; ids=interOf(M.byFamily[best]||[]); }
    else { note='方法族与本子项措施族无交集，按子项措施族选'; }
  }
  var primary=null, alts=[];
  if(fromMethod){
    var Pp=pickActIds(ids,p.t,fams);
    if(Pp) primary={act:Pp.act,score:Pp.score,weak:(Pp.score<=1)};   /* ≤1 表示只靠措施族命中、无触发词支撑 */
    poolTopIds(ids,p.t,fams).forEach(function(x){ alts.push(x); });
  }else if(fams.length){
    var P2=pickAct(fams,p.t);
    if(P2) primary={act:P2.act,score:P2.score,weak:(P2.score===0)};
    poolTop(fams,p.t).forEach(function(x){ alts.push(x); });
  }else{
    primary={todo:true};   /* 措施待补充 */
  }
  var s=stars(p.t), u=urgency(p.t,{});
  if(jd.rf.length){ s=5; u='高'; }             /* 命中红灯：一票提级为最高优先 */
  var bucket = s>=4?'高' : (s===3?'中':'低');
  var pri=(KB.priority.matrix[u]||{})[bucket]||'P2';
  if(jd.rf.length) pri='P0';
  return {dim:it.code,dimName:it.name,aspect:gm.a.code,aspectName:gm.a.name,
    tags:it.tags||[],families:fams,jd:jd,methods:M.codes,methodUsed:chosen,
    fromMethod:fromMethod,pickNote:note,
    evidence:list0.map(function(x){return x.t;}),
    neg:p.neg,src:p.src,stars:s,urg:u,pri:pri,primary:primary,alts:alts,
    thing:p.t,reviews:it.reviews};
}
function poolTopIds(ids,s,fams){
  return IDX.acts.filter(function(x){return ids.indexOf(x.id)>=0;})
    .map(function(x){
      var sc=0; String(x.act.tr||'').split(/[、,，;；\s]+/).forEach(function(w){ if(w.length>1&&s.indexOf(w)>=0) sc+=2; });
      if(fams&&fams.indexOf(x.act.f)>=0) sc+=1;
      return {act:x.act,score:sc,id:x.id};
    }).sort(function(a,b){return b.score-a.score;}).slice(0,3);
}
function buildFixes(pains,dmap){
  /* 归并规则：同一子维度默认合并为一条（取「最重要最紧急」的表述作代表）。
     若同一维度内另有表述与代表句毫无共词片段、且重要度达 ★★★，说明是另一议题，单列一条。 */
  var groups=[], idx={};
  pains.forEach(function(p){
    var m=mapDim(p.t);
    if(!m) return;
    var c=m.it.code;
    if(idx[c]===undefined){ idx[c]=groups.length; groups.push({code:c,m:m,list:[]}); }
    groups[idx[c]].list.push(p);
  });
  var list=[];
  groups.forEach(function(g){
    g.list.sort(function(a,b){
      var sa=stars(a.t), sb=stars(b.t);
      if(sa!==sb) return sb-sa;
      return urgRank(urgency(a.t,{}))-urgRank(urgency(b.t,{}));
    });
    var chunks=[[g.list[0]]];
    for(var i=1;i<g.list.length;i++){
      var put=false;
      for(var j=0;j<chunks.length;j++){
        if(sameTopic(chunks[j][0].t,g.list[i].t)){ chunks[j].push(g.list[i]); put=true; break; }
      }
      if(!put){
        if(stars(g.list[i].t)>=3 || urgency(g.list[i].t,{})!=='低') chunks.push([g.list[i]]);
        else chunks[0].push(g.list[i]);
      }
    }
    chunks.forEach(function(list0){
      list.push(makeFix(g.m,list0));
    });
  });
  // 同一优先级内：星级降序 → 建议交期升序
  list.sort(function(a,b){
    if(a.pri!==b.pri) return a.pri<b.pri?-1:1;
    if(a.stars!==b.stars) return b.stars-a.stars;
    return 0;
  });
  return list;
}
function poolTop(fams,s){
  return IDX.acts.filter(function(x){return fams.indexOf(x.act.f)>=0;})
    .map(function(x){
      var sc=0; String(x.act.tr||'').split(/[、,，;；\s]+/).forEach(function(w){ if(w.length>1&&s.indexOf(w)>=0) sc+=2; });
      return {act:x.act,score:sc,id:x.id};
    }).sort(function(a,b){return b.score-a.score;}).slice(0,3);
}

/* ---------------- 总结模块收敛（模块级函数，供 run/buildEvals 共用）----------------
   优势 ≤6 条、不足 ≤6 条、重点提升/打造事项 1~4 条（不足时用真实亮点补「优势深化」，不编造） */
function briefTxt(s){
  s=String(s).replace(/^\[补充\]\s*/,'').replace(/^项目亮点[：:]\s*/,'')
    .replace(/^\d+[\.、．]\s*/,'').replace(/^[^A-Za-z0-9\u4e00-\u9fa5]+/,'').trim();
  return s.length>72? s.slice(0,72)+'…' : s;
}
function topHl(hls,n){
  var groups=[];
  hls.forEach(function(h){
    var m=mapDim(h.t);
    var key=m?m.it.code:'ZZ';
    var g=null;
    groups.forEach(function(x){ if(x.key===key) g=x; });
    if(!g){ g={key:key,dim:m?(m.a.name+'·'+m.it.name):'综合运营',items:[]}; groups.push(g); }
    g.items.push(h);
  });
  groups.forEach(function(g){ g.items.sort(function(a,b){return b.gate-a.gate;}); });
  groups.sort(function(a,b){return (b.items[0]?b.items[0].gate:0)-(a.items[0]?a.items[0].gate:0);});
  var out=[];
  groups.slice(0,n).forEach(function(g){
    var h=g.items[0];
    out.push((h.level==='阶段性成效'?'［成效］':'')+'【'+g.dim+'】'+briefTxt(h.t));
  });
  return out;
}
function focusTop(F,hls,n){
  var rank={P0:0,P1:1,P2:2,P3:3};
  var fs=F.slice().sort(function(a,b){return (rank[a.pri]-rank[b.pri])||(b.stars-a.stars);});
  var out=fs.slice(0,n).map(function(f){return '['+f.pri+'] '+f.thing;});
  if(out.length<n && hls.length){
    hls.slice(0,n-out.length).forEach(function(h){
      out.push('［优势深化］将「'+briefTxt(h.t).slice(0,40)+'」经验固化为标准做法并沉淀案例');
    });
  }
  return out;
}

/* 红灯扫描（判定标准A §3.1）：对全量输入文本扫描，不依赖痛点词是否命中 */
function scanRedFlags(T){
  var out=[], ss=String(T||'').split(/[。；;\n]/);
  ((KB.rules&&KB.rules.redFlags)||[]).forEach(function(f){
    var hit=null;
    (f.signals||[]).forEach(function(w){
      if(hit||!w) return;
      for(var i=0;i<ss.length;i++){
        if(ss[i].indexOf(w)>=0 && !isNeg(ss[i])){ hit=ss[i].trim(); break; }
      }
    });
    if(hit) out.push({code:f.code,name:f.name,sent:hit});
  });
  return out;
}

/* ---------------- 独立评价项：客户满意度 / 员工满意度 ----------------
   主人 2026-10-22 定：两项独立于四大审查维度，须结合四维判定结果 + 使用者输入 + Part.3 评分，
   在诊断报告中体现；只出等级与建议，不重复计分。 */
function evalMaxOf(id){
  var ev=(KB.evals||[]).filter(function(x){return x.id===id;})[0];
  if(!ev) return 0;
  var m=0;
  (ev.scoreItems||[]).forEach(function(sid){
    (KB.score.rows||[]).forEach(function(r){ if(r.id===sid) m+=r.max; });
  });
  return m;
}
function buildEvals(R,T){
  var out=[], txt=String(T||'');
  var comp=/投诉|客诉|索赔|考核扣分|异常升级/.test(txt);
  var honor=/表彰|表扬信|奖状|好评|书面认可|客户书面/.test(txt);
  var survey=/问卷|满意度调查|员工调查/.test(txt);
  var dispute=/争议|仲裁|讨薪|欠薪|工时争议|劳资纠纷|集体/.test(txt);
  (KB.evals||[]).forEach(function(ev){
    var dims=[];
    (ev.dims||[]).forEach(function(c){
      var m=R.dims.map[c]; if(!m||!m.hits) return;
      dims.push({code:c,name:m.name,hits:m.hits,pos:m.pos||0,neg:m.neg||0});
    });
    /* 主人 2026-10-26 定：关键观察按与满意度相关的原文表述客观引用，不再罗列四维泛化句子 */
    var relRe=ev.id==='EV-CS'?/客户满意度|客户评价|客户评分|客户 KPI|客诉|投诉|索赔|表彰|表扬|好评|书面认可/:/员工满意度|问卷|调查|关怀|离职|争议|仲裁|欠薪|访谈/;
    var relSents=[];
    sentences(txt).forEach(function(s){ if(relRe.test(s)&&relSents.indexOf(s)<0) relSents.push(s); });
    relSents=relSents.slice(0,2);
    var got=0,max=0,pend=[];
    (ev.scoreItems||[]).forEach(function(sid){
      (R.score.rows||[]).forEach(function(o){
        if(o.row.id!==sid) return;
        max+=o.row.max;
        if(o.state==='OK') got+=(o.got||0); else pend.push(o.row.name||o.row.l1||sid);
      });
    });
    var val=bindMetric(txt, ev.id==='EV-CS'?['客户满意度','客户评分','满意度评分']:['员工满意度','员工满意度评分','满意度评分']);
    var lv='待确认', why=[];
    if(ev.id==='EV-CS'){
      if(comp){ lv='待改善'; why.push('输入中出现投诉 / 索赔 / 考核扣分类表述'); }
      else if(val!=null&&val>90&&honor){ lv='优'; why.push('满意度 '+val+' 分，且有客户表彰 / 书面好评'); }
      else if(val!=null&&val>=86){ lv='良'; why.push('满意度 '+val+' 分，无投诉索赔'); }
      else if(val!=null){ lv='待改善'; why.push('满意度 '+val+' 分，未达 86 分档'); }
      else if(honor){ lv='良'; why.push('无满意度数值，但有客户表彰 / 书面好评佐证'); }
      else { lv='待确认'; why.push('未提供客户满意度数值，也未见投诉或表彰表述'); }
    }else{
      if(dispute){ lv='待改善'; why.push('输入中出现薪酬 / 考勤 / 劳资争议类表述'); }
      else if(val!=null&&val>90&&survey){ lv='优'; why.push('员工满意度 '+val+' 分，且问卷已落地'); }
      else if(val!=null&&val>=81){ lv='良'; why.push('员工满意度 '+val+' 分，未达 90 分档'); }
      else if(val!=null){ lv='待改善'; why.push('员工满意度 '+val+' 分，未达 81 分档'); }
      else { lv='待确认'; why.push(survey?'有问卷调查表述但未提供评分结果':'未提供员工满意度数值与问卷结果'); }
    }
    /* 依据行：Part.3 得分 + 四维相关子项 + 输入数值 */
    var names=(ev.scoreItems||[]).map(function(sid){
      var nm=sid; (KB.score.rows||[]).forEach(function(r){ if(r.id===sid) nm=(r.l1||'')+(r.name?'·'+r.name:''); }); return nm;
    }).join('、');
    var basisLine='Part.3 '+names+'：'+(max?got+'/'+max:'—')+(pend.length?'（'+pend.join('、')+'待确认）':'')
      +'；四维相关子项 '+dims.length+' 项有描述'+(dims.length?'（'+dims.map(function(d){return d.code;}).join('/')+'）':'')
      +'；输入中'+(val!=null?'满意度 '+val+' 分':(ev.id==='EV-CS'?'未见客户满意度数值':'未见员工满意度数值'))
      +(comp&&ev.id==='EV-CS'?'；存在投诉 / 索赔表述':'')
      +(honor&&ev.id==='EV-CS'?'；有客户表彰 / 书面好评':'')
      +(survey&&ev.id==='EV-ES'?'；有问卷类表述':'');
    var SUG={
      '优':{'EV-CS':'保持现有响应与交付水准，把客户评价固化为季度书面动作并留档，纳入项目看板。',
            'EV-ES':'保持现有关怀与沟通机制，问卷按季度复测并公示改善项，防止满意度回落。'},
      '良':{'EV-CS':'补齐客户书面评价佐证（评价表 / 表扬信），并把客诉响应时效纳入月度看板。',
            'EV-ES':'补足问卷覆盖面并公开改善承诺兑现情况，重点稳岗对象做一对一访谈。'},
      '待改善':{'EV-CS':'先闭环投诉 / 索赔事项并取得客户复评，同步排查 A2 品质与 A4 交付子项的证据链。',
               'EV-ES':'先闭环薪酬 / 考勤争议，同步核查 B4 薪酬公示、B5 关怀分层、B7 沟通渠道三项机制。'},
      '待确认':{'EV-CS':'尚未取得客户满意度数据，请补充客户书面评价或最近一次考核得分后重跑。',
               'EV-ES':'尚未取得员工满意度数据，请落地一次问卷（覆盖率 100%）并回填评分后重跑。'}
    };
    out.push({id:ev.id,name:ev.name,lv:lv,levels:ev.levels||[],note:ev.note||'',
      basisLine:basisLine,obs:why.concat(relSents.map(function(s){return '原文：'+briefTxt(s).slice(0,60);})).slice(0,4),
      sugg:(SUG[lv]||{})[ev.id]||'', got:got, max:max, dims:dims, val:val});
  });
  return out;
}

/* ---------------- 报告渲染 ---------------- */
var R=null;
function renderReport(){
  var d=$('doc'); if(!d) return;
  var meta=R.meta, S=R.score, P=R.parts, base=P.P1+P.P2+P.P3, K=R.K, total=R.total;
  var T=[];
  T.push('<div class="doc-in">');
  T.push('<div class="rh"><div><h3>'+esc('核心竞争力打造评分表')+'</h3><div style="font-size:12px;color:#5a6875;margin-top:3px">'+esc(meta.name||'')+'　'+esc(KB.cfg.simTag)+'</div></div>'
    +'<div class="who">项目名称：'+esc(meta.name||'—')+'<br/>管理形态：'+esc(meta.type||'—')+'<br/>评分日期：'+esc(meta.date||'—')
    +'<br/>项目人数：'+esc(meta.head||'—')+'<br/>管理配置：'+esc(meta.conf||'—')+'</div></div>');

  /* ---- 模块一：项目评分 ---- */
  var S1=[],S2=[],S3=[],S4=[];
S1.push('<div class="sec" id="secScore"><h4>模块一 · 项目评分</h4>');

  S1.push('<div style="font-size:11.5px;color:#5a6875;line-height:1.8;margin-bottom:8px">注意事项：① 所有评分条款均需出具相应佐证，依据客观事实评价赋分；② 项目有不涉及的条款不予评价，按既定分值比例赋分至总得分。</div>');

  (KB.score.parts||[]).forEach(function(pt){
    if(pt.part==='P4'){
      S1.push('<div style="margin-top:12px;font-weight:600;font-size:13px;color:#0f1720">'+esc(pt.title)+'</div>');
      S1.push('<table><thead><tr><th>'+esc(pt.colL1)+'</th><th>收益情况</th><th>可复制性</th><th>标准化程度</th><th>主要内容</th><th>达成情况</th><th class="num">得分</th><th>建议</th></tr></thead><tbody>');
      (S.rows.filter(function(o){return o.row.part==='P4';})).forEach(function(o){
        var b=(R.bonus[o.row.id]||{content:'',got:0,state:'达成'});
        S1.push('<tr'+(o.state==='BONUS'&&!b.got?' class="tbd"':'')+'>'
          +'<td>'+esc(o.row.l1)+'</td><td>—</td><td>—</td><td>—</td>'
          +'<td>'+esc(b.content||'')+'</td><td>'+esc(b.state||'')+'</td><td class="num">'+(b.got||0)+'</td>'
          +'<td>'+esc(b.sugg||'')+'</td></tr>');
      });
      S1.push('</tbody></table>');
      return;
    }
    var isP3=(pt.part==='P3');
    S1.push('<div style="margin-top:12px;font-weight:600;font-size:13px;color:#0f1720">'+esc(pt.title)+'</div>');
    S1.push('<table><thead><tr><th>'+esc(pt.colL1)+'</th>'+(isP3?'':'<th>'+esc(pt.colL2)+'</th>')
      +'<th colspan="3" style="text-align:center">'+esc(pt.colBasis)+'</th><th>目标</th><th>实际</th><th>达成情况</th><th class="num">得分</th><th>建议</th></tr></thead><tbody>');
    S.rows.filter(function(o){return o.row.part===pt.part;}).forEach(function(o){
      var cls = o.state==='NA'?' class="na"':(o.state==='TBD'?' class="tbd"':'');
      var reach = o.state==='NA'?'——':(o.state==='TBD'?'待确认':(o.got>=o.row.max?'达标':(o.got>0?'部分达成':'未达成')));
      S1.push('<tr'+cls+'>'
        +'<td>'+esc(o.row.l1||'')+'</td>'
        +(isP3?'':'<td>'+esc(o.row.name||'')+'</td>')
        +o.row.bands.map(function(b){return '<td style="font-size:11.5px;color:#5a6875">'+esc(b.d)+'<div style="color:#b98f3f;font-weight:600;margin-top:2px">'+(b.v==null?'——':b.v)+'</div></td>';}).join('')
        +'<td>'+esc(o.row.target||'—')+'</td>'
        +'<td>'+esc(o.actual||'')+(o.src?'<span style="font-size:10.5px;color:#8b96a3">'+esc(o.src)+'</span>':'')+'</td>'
        +'<td>'+esc(reach)+'</td>'
        +'<td class="num">'+(o.state==='NA'?'——':o.got)+'</td>'
        +'<td>'+esc(o.sugg||'')+'</td></tr>');
    });
    S1.push('</tbody></table>');
  });

  S1.push('<div class="totalbox">'
    +'<div class="big">总得分：'+total+'</div>'
    +'<div class="fm">'+esc(KB.cfg.totalFormula)+'　|　'+esc(KB.cfg.kFormula)+'<br/>'
    +'Part.1 '+P.P1+' + Part.2 '+P.P2+' + Part.3 '+P.P3+' = '+base+'　×　K='+K+'　+　加分 '+P.P4+'　=　'+total+'<br/>'
    +'不适用项满分合计 = '+S.naSum+'（占 K 折算）；待确认项 '+S.pend.length+' 项（按模板注意事项①不赋分）'
    +'</div></div>');
  if(S.pend.length){
    S1.push('<div class="warnbox"><b>数据缺口：</b>'+esc(S.pend.join('、'))+' 无佐证数据，已标「待确认」且不赋分。请补齐后重跑，或由负责人在「不适用」列显式勾选后参与 K 折算。</div>');
  }
  S1.push('</div>');

  /* ---- 模块二：总结 ---- */
  S2.push('<div class="sec" id="secSummary"><h4>模块三 · 总结（项目综合评估）</h4>');

  S2.push('<table><thead><tr><th style="width:26%">项目现状总结（核心竞争力&amp;精益）</th><th style="width:24%">核心竞争力优势</th><th style="width:24%">核心竞争力不足</th><th style="width:26%">重点提升/打造事项</th></tr></thead><tbody><tr>');
  S2.push('<td><b>项目概述：</b>'+esc(R.sum.overview||'—')+'<br/><b>核心竞争力方面：</b>'+esc(R.sum.aspect||'—')
    +'<br/><b>客户需求：</b>'+(R.sum.needs.length?esc(R.sum.needs.join('；')):'（本次输入未识别到明确的客户需求表述）')+'</td>');
  S2.push('<td>'+(R.sum.hl.length?R.sum.hl.map(function(x,i){return (i+1)+'. '+esc(x);}).join('<br/>'):'—')+'</td>');
  S2.push('<td>'+(R.sum.pain.length?R.sum.pain.map(function(x,i){return (i+1)+'. '+esc(x);}).join('<br/>'):'—')+'</td>');
  S2.push('<td>'+(R.sum.focus.length?R.sum.focus.map(function(x,i){return (i+1)+'. '+esc(x);}).join('<br/>'):'—')+'</td>');
  S2.push('</tr></tbody></table>');

  S2.push('<div style="margin-top:14px;font-weight:600;font-size:13px;color:#0f1720">整改事项清单（按最紧急、最重要优先）</div>');
  S2.push('<table><thead><tr><th style="width:8%">维度</th><th style="width:22%">事项</th><th style="width:27%">建议行动项</th><th style="width:8%">重要程度</th><th style="width:9%">责任人</th><th style="width:12%">交期</th><th style="width:7%">附图/附件</th><th style="width:7%">重要提示</th></tr></thead><tbody>');
  if(!R.fixes.length){
    S2.push('<tr><td colspan="8">本次输入未识别到明确的负面事项，建议在「项目经理补充信息」中录入项目痛点后重跑。</td></tr>');
  }
  R.fixes.forEach(function(f,i){
    var JD=f.jd||{D:{},total:0,rf:[],verdict:'problem',weak:[],conf:0};
    S2.push('<tr data-fx="'+i+'"'+(f.primary&&f.primary.todo?' class="tbd"':'')+'>');
    S2.push('<td><span class="tag'+(f.tags.length?'':' g')+'">'+esc(f.tags.length?tagShort(f.tags[0]):f.aspect+'·'+f.dim)+'</span><div style="font-size:10.5px;color:#8b96a3;margin-top:3px">'+esc(f.dim+' '+f.dimName)+'</div></td>');
    /* 主人 2026-10-26 定：判定依据明细（五维分/红灯/弱维/方法族）不在报告展示，仅在 JSON 数据里保留 */
    S2.push('<td>'+esc(f.thing)
      +(f.evidence.length>1?'<div style="font-size:10.5px;color:#8b96a3;margin-top:3px">另有 '+(f.evidence.length-1)+' 条同类表述</div>':'')
      +'<div style="font-size:10.5px;color:#8b96a3;margin-top:3px">来源：'+esc(f.src)+'</div>'
      +'</td>');
    if(f.primary&&f.primary.todo){
      S2.push('<td><b style="color:#9a6512">措施待补充</b><div style="font-size:11px;color:#8b96a3;margin-top:3px">'+esc(KB.cfg.pendingITNote)+'</div></td>');
    }else if(f.primary&&f.primary.act){
      var a=f.primary.act.act;
      /* 主人 2026-10-26 定：ACT- 编码不在报告展示（编码仅在 JSON / MD 层保留） */
      /* 主人 2026-10-27 定：建议项标注出处——知识库命中的措施带「知识库」标签；AI 融合后由大模型结果原位替换并标「大模型」 */
      S2.push('<td><span class="srcTag kb">知识库</span><b>'+esc(a.n)+'</b>'
        +(f.primary.weak?'<span class="tag r" style="margin-left:6px">弱匹配·附参考建议</span>':'')
        +'<div style="font-size:11.5px;color:#5a6875;margin-top:3px">'+esc(a.st||'')+'</div>'
        +(a.kf?'<div style="font-size:11.5px;color:#9a6512;margin-top:3px">关键：'+esc(a.kf)+'</div>':'')
        +(a.ac?'<div style="font-size:11.5px;color:#5a6875;margin-top:3px">验收：'+esc(a.ac)+'</div>':'')
        +((f.primary.weak&&f.alts&&f.alts.length>1)
           ?'<div style="font-size:11px;color:#8b6412;margin-top:4px;background:rgba(232,197,132,.14);border-radius:6px;padding:4px 7px">参考建议（知识库内近似措施，供比对采用）：'+esc(f.alts.slice(1,3).map(function(x){return x.act.n;}).join('；'))+'</div>'
           :(f.primary.weak?'<div style="font-size:11px;color:#8b96a3;margin-top:4px">知识库内暂无更贴近的备选措施，建议人工确认改善方向</div>':''))
        +(f.alts&&f.alts.length>1&&!f.primary.weak?'<div style="font-size:11px;color:#8b96a3;margin-top:4px">备选：'+esc(f.alts.slice(1,3).map(function(x){return x.act.n;}).join(' / '))+'</div>':'')
        +'</td>');
    }else{
      S2.push('<td>—</td>');
    }
    S2.push('<td>'+'★'.repeat(f.stars)+'☆'.repeat(5-f.stars)+'</td>');
    S2.push('<td>'+esc(f.owner||'待指定')+'</td>');
    S2.push('<td>'+esc(f.due)+'<div style="font-size:10.5px;color:#8b96a3;margin-top:2px">'+esc(KB.priority.leadLabel[f.pri]||'')+'</div></td>');
    S2.push('<td>'+esc(f.att||'需图文作证')+'</td>');
    S2.push('<td>'+esc(f.tip||'')+'</td>');
    S2.push('</tr>');
  });
  S2.push('</tbody></table>');
  S2.push('<div class="warnbox"><b>优先级说明：</b>紧急度（'+esc(R.stat.uHigh+' 项高')+'）× 重要度（星级）映射为 P0–P3，逐行降序排列；P0 立即处理 / P1 本周启动 / P2 本月排期 / P3 季度规划。</div>');
  var VV=(KB.rules&&KB.rules.verdict)||{};
  S2.push('<div class="warnbox" style="margin-top:8px"><b>判定标准A（好坏标尺）：</b>'
    +'五维评分卡 D1 覆盖率 / D2 符合性 / D3 有效性 / D4 持续性 / D5 闭环性，各 0–3 分（满分 15）。'
    +esc((VV.highlight&&VV.highlight.txt)||'总分≥12且D3≥2且无红灯且证据≥2条')+' → 亮点；'
    +esc((VV.problem&&VV.problem.txt)||'总分≤8或命中红灯')+' → 不足；其余 → 待确认。'
    +'红灯 RF-01~09 命中即一票否决，并直接提为 P0。<br/>'
    +'<b>措施触发链：</b>红灯 / 弱维 → 方法族（15 族 M-xx）→ 族内措施池 → 触发词收敛 1 主 + ≤2 备；子项自带措施族仅在方法族缺位时兜底。'
    +'五维分为「按文本证据估算」，用于定性与选方法，不等于本页评分表的分值。</div>');
  /* AI 归纳总结补充容器（开启 AI 增强后由大模型回填，主人 2026-10-27 定：直接融入报告） */
  S2.push('<div id="aiSumBox"></div>');
  S2.push('</div>');

  /* ---- 模块二：满意度评价（独立评价项）----
     主人 2026-10-22 定：客户满意度 / 员工满意度独立于四大审查维度，结合四维判定结果 + 输入信息判定，在报告中体现。
     只出「等级 + 依据 + 建议」，不与 Part.3 评分表的 20 分重复计分。 */
  var S5=[];
  S5.push('<div class="sec" id="secEval"><h4>模块二 · 满意度评价（客户 / 员工 · 独立评价项）</h4>');
  S5.push('<div style="font-size:12px;color:#111;line-height:1.8;margin-bottom:8px">'
    +'本模块两项评价<b>独立于四大审查维度</b>（A 现场管理 / B 人员服务 / C 招聘能力 / D IT 应用），按「四大维度判定结果 + 使用者录入信息 + Part.3 满意度评分」综合判定，'
    +'只出评价结论与建议，<b>不重复计分</b>（客户满意度已计入 Part.3 的 '+(evalMaxOf('EV-CS'))+' 分、员工满意度已计入 Part.3 的 '+(evalMaxOf('EV-ES'))+' 分）。</div>');
  S5.push('<table><thead><tr><th style="width:11%">评价项</th><th style="width:9%">等级</th><th style="width:34%">判定依据（四维 + 输入 + Part.3）</th><th style="width:24%">关键观察</th><th style="width:22%">建议</th></tr></thead><tbody>');
  (R.evals||[]).forEach(function(ev){
    var lcls=ev.lv==='优'?' tag g':(ev.lv==='良'?' tag b':(ev.lv==='待改善'?' tag r':' tag p'));
    S5.push('<tr'+(ev.lv==='待确认'?' class="tbd"':'')+'>'
      +'<td><b>'+esc(ev.name)+'</b><div style="font-size:10.5px;color:#8b96a3;margin-top:2px">独立评价项</div></td>'
      +'<td><span class="'+lcls.trim()+'">'+esc(ev.lv)+'</span></td>'
      +'<td style="font-size:11.5px;color:#243040">'+esc(ev.basisLine||'—')+'</td>'
      +'<td style="font-size:11.5px;color:#243040">'+(ev.obs.length?ev.obs.map(function(o){return '· '+esc(o);}).join('<br/>'):'—')+'</td>'
      +'<td style="font-size:11.5px">'+esc(ev.sugg||'—')+'</td></tr>');
  });
  S5.push('</tbody></table>');
  S5.push('<div class="warnbox" style="margin-top:8px"><b>判定口径：</b>'
    +(R.evals||[]).map(function(ev){
        return '<b>'+esc(ev.name)+'</b>：'+esc((ev.levels||[]).map(function(x){return x.lv+'＝'+x.cond;}).join('；'));
      }).join('<br/>')
    +'</div>');
  S5.push('</div>');

  /* ---- 依据与落位 ---- */
  S3.push('<div class="sec" id="secDims"><h4>审查依据（四维子项命中情况）</h4>');

  (KB.aspects||[]).forEach(function(a){
    if(a.code==='E') return;
    S3.push('<table><thead><tr><th style="width:12%">'+esc(a.code+' '+a.name)+'</th><th style="width:16%">子项</th><th style="width:30%">审查要点</th><th style="width:16%">整改标签 / 措施族</th><th style="width:26%">本次命中的表述</th></tr></thead><tbody>');
    (a.items||[]).forEach(function(it){
      var m=R.dims.map[it.code]||{hits:0,sents:[],lv:0};
      var lvtx=['未提及','有描述无机制','有机制无记录','有记录且可追溯'][m.lv]||'';
      S3.push('<tr'+(m.hits?'':' class="na"')+'>'
        +'<td class="id">'+esc(it.code)+'</td>'
        +'<td><b>'+esc(it.name)+'</b><div style="font-size:10.5px;color:#8b96a3;margin-top:2px">'+esc(lvtx)+'</div></td>'
        +'<td style="font-size:11.5px;color:#5a6875">'+esc((it.reviews||[]).join('、'))+'</td>'
        +'<td style="font-size:11.5px">'+esc((it.tags||[]).map(tagShort).join(' / ')||'—')+'<div style="font-size:10.5px;color:#8b96a3;margin-top:2px">'+esc((it.families||[]).join(' / ')||'—')+'</div></td>'
        +'<td style="font-size:11.5px;color:#243040">'+(m.sents.length?m.sents.slice(0,2).map(function(s){return '· '+esc(s.slice(0,60));}).join('<br/>'):'—')+'</td>'
        +'</tr>');
    });
    S3.push('</tbody></table>');
  });
  S3.push('</div>');

    /* 按 KB.layout.report 配置的顺序与开关装配报告模块（管理员可增减排布） */
  var secMap={secScore:S1.join(''),secEval:S5.join(''),secSummary:S2.join(''),secDims:S3.join('')};
  ((KB.layout&&KB.layout.report)||[]).forEach(function(b){ if(b.on!==false&&secMap[b.id]!=null) T.push(secMap[b.id]); });

T.push('<div class="srcbox">'
    +'数据来源：走访口述 '+R.stat.c1+' 字 / 项目经理补充 '+R.stat.c2+' 字；知识库 '+esc(KB.meta.ver)+'（更新于 '+esc(KB.meta.updated)+'）。<br/>'
    +'本表评分依据客观证据自动生成，'+esc(KB.cfg.simTag)+'。<br/>'
    +'共识别待整改事项 '+R.fixes.length+' 项，提取客户需求 '+R.sum.needs.length+' 条、项目亮点 '+R.hl.length+' 条。'
    +'</div>');

  T.push('</div>');
  d.innerHTML=T.join('').replace(/color:#(5a6875|8b96a3|7a8593|b98f3f)/g,'color:#111');
  $('jsonPre').textContent=JSON.stringify(R.json,null,2);
}

/* ---------------- 主流程 ---------------- */
function run(){
  pReset();
  var meta={
    name:($('mName').value||'').trim()||'未命名项目',
    type:$('mType').value, date:$('mDate').value||ymd(),
    head:($('mHead').value||'').trim()||'—',
    conf:($('mConf').value||'').trim()||'—'
  };
  var T1=($('tx').value||'').trim(), T2=($('tx2').value||'').trim(), T=T1+'\n'+T2;
  if(!T1 && !T2){ toast('请先录入走访口述或项目经理补充信息'); return; }

  pNow('S1 文本归一…'); paintRail(0);
  pLog('S1','输入文本 '+T.length+' 字：走访口述 '+T1.length+' 字，项目经理补充 '+T2.length+' 字。', 'ok');

  paintRail(1); pNow('S2 四维子项命中扫描…');
  var D=analyzeDims(T);
  var pers=D.present;
  pLog('S2','四维 '+pers.length+' 个子项命中：'+pers.map(function(c){return c;}).join('、')+ (pers.length?'':'（未识别到子维度关键词）'), pers.length?'ok':'warn');

  paintRail(2); pNow('S3 关键指标抽取…');
  renderKpi();
  pLog('S3','按 12 项可量化评分项扫描数值；已存在的手工录入优先保留。','ok');

  paintRail(3); pNow('S4 信息提取（需求/痛点/亮点）…');
  var E=extractInfo(T1,T2);
  pLog('S4','客户需求 '+E.needs.length+' 条 / 项目痛点 '+E.pains.length+' 条 / 亮点候选 '+E.hls.length+' 条（门槛判定后入报告）。', E.needs.length||E.pains.length?'ok':'warn');

  paintRail(4); pNow('S5 评分赋分（100 分制 + K 折算）…');
  var S=buildScore(T,D.map);
  pLog('S5','Part.1 '+S.parts.P1+' / Part.2 '+S.parts.P2+' / Part.3 '+S.parts.P3+'；不适用满分合计 '+S.naSum+'；待确认 '+S.pend.length+' 项。','ok');

  paintRail(5); pNow('S6 痛点归类、措施收敛与优先级排序…');
  var F=buildFixes(E.pains,D.map);

  /* 红灯补录：全量文本扫描命中、但痛点提取没抓到的红灯，直接落一条 P0 整改 */
  var RFH=scanRedFlags(T);
  var rfAdded=0;
  RFH.forEach(function(r){
    var dup=F.some(function(f){
      if(f.jd.rf.indexOf(r.code)>=0) return true;
      /* 只按「同一句已被收录」去重，避免 sameTopic 把不同维度的句子误并 */
      return (f.evidence||[]).some(function(e){ return e.indexOf(r.sent)>=0 || r.sent.indexOf(e)>=0; });
    });
    if(dup) return;
    var m=mapDim(r.sent); if(!m) return;
    var nf=makeFix(m,[{t:r.sent,neg:false,src:'红灯扫描'}]);
    nf.jd=deep(nf.jd); nf.jd.rf=[r.code]; nf.jd.verdict='problem';
    nf.pri='P0'; nf.stars=5; nf.urg='高';
    nf.thing='【红灯 '+r.code+' '+r.name+'】'+r.sent;
    F.push(nf); rfAdded++;
  });
  if(rfAdded){
    F.sort(function(a,b){
      if(a.pri!==b.pri) return a.pri<b.pri?-1:1;
      if(a.stars!==b.stars) return b.stars-a.stars;
      return 0;
    });
  }
  pLog('S6','判定标准A：红灯扫描命中 '+RFH.length+' 条'+(rfAdded?'（其中 '+rfAdded+' 条由全量扫描补录为 P0）':'')+'；整改事项 '+F.length+' 项。', RFH.length?'warn':'ok');

  // 亮点 → Part.4 加分项
  var hlAll=E.hls.filter(function(h){return h.level==='亮点'||h.level==='阶段性成效';})
                 .sort(function(a,b){return b.gate-a.gate;});
  // Part.4 加分项按「项目创新 / 风险预防」两类分别落位（严格对应模板两行）
  var INNOV=['创新','首创','改善','标杆','推广','借鉴','自动化','减员','库位','目视化','精益'],
      RISK=['风险','预防','隐患','预案','规避','安全','稽核','审计','合规','闭环'];
  function pickBonus(kw){
    var hit=hlAll.filter(function(h){return hasAny(h.t,kw);});
    return hit.length?hit[0]:null;
  }
  var bInnov=pickBonus(INNOV), bRisk=pickBonus(RISK);
  function clean(s){ return String(s).replace(/^\[补充\]\s*/,'').replace(/^项目亮点[：:]\s*/,''); }
  var bonus={}, focus=[];
  bonus['SC-P4-01']= bInnov?{content:clean(bInnov.t),got:bInnov.show?5:3,state:bInnov.show?'达成':'部分达成',
      sugg:'依据：'+bInnov.why.join(' / ')}:{content:'',got:0,state:'',sugg:'未见可计入的项目创新事项'};
  bonus['SC-P4-02']= bRisk?{content:clean(bRisk.t),got:bRisk.show?5:3,state:bRisk.show?'达成':'部分达成',
      sugg:'依据：'+bRisk.why.join(' / ')}:{content:'',got:0,state:'',sugg:'未见可计入的风险预防事项'};
  if(bInnov&&bRisk&&clean(bInnov.t)===clean(bRisk.t)) bonus['SC-P4-02']={content:'',got:0,state:'',sugg:'未单独识别到风险预防类事项'};
  var P4=0; for(var bk in bonus) P4+=bonus[bk].got||0;

  var base=S.parts.P1+S.parts.P2+S.parts.P3;
  var K=(1+S.naSum/100);
  var total=round1(round1(base*K)+P4);

  var uHigh=F.filter(function(f){return f.urg==='高';}).length;
  var due=KB.priority.lead;
  F.forEach(function(f){ f.due=addDays(meta.date,due[f.pri]||30); f.owner=ownerOf(f.thing); f.att=f.primary&&f.primary.todo?'':'需图文作证'; f.tip=tipOf(f); });

  // 项目概述：按《项目走访报告写作要求与技巧》§四 三段式模板（90–120 字，只写结论）
  var p1=IDX.rows['SC-P1-01'];
  var profitTxt='利润达成情况待补充';
  (function(){
    for(var i=0;i<S.rows.length;i++){ var o=S.rows[i];
      if(o.row.id==='SC-P1-01'&&o.state==='OK'){ profitTxt='累计利润达成率 '+o.actual+(o.got>=o.row.max?'（达标）':'（'+o.got+'/'+o.row.max+' 分）'); break; } }
  })();
  var advBrief=hlAll.length?briefTxt(hlAll[0].t).slice(0,40):'四维管理体系总体运行平稳';
  var shortBrief=F.length?('短板集中于 '+uniq(F.slice(0,3).map(function(f){return f.dimName;})).join('、')):'未识别突出短板';
  var leanTxt=(D.map['A6']&&D.map['A6'].hits)?('精益改善已有 '+D.map['A6'].hits+' 项相关表述，成果待案例化沉淀'):'精益改善成果待系统梳理与沉淀';
  var overview=((meta.name||'本项目')+'（'+meta.head+'，'+meta.type+'），'+profitTxt+'。'
    +'核心竞争力方面：'+advBrief.replace(/^项目亮点[：:]/,'')+'，'+shortBrief+'。'
    +'精益运营方面：'+leanTxt+'。');
  var aspLine=(KB.aspects||[]).filter(function(a){return a.code!=='E';}).map(function(a){
    var n=D.present.filter(function(c){return (D.map[c]||{}).aspect===a.code;}).length;
    var tot=dimsOf(a.code).length;
    return a.name+' '+n+'/'+tot+' 子项有描述';
  }).join('；');



  R={
    meta:meta, dims:D, score:S, parts:{P1:S.parts.P1,P2:S.parts.P2,P3:S.parts.P3,P4:P4},
    K:Math.round(K*100)/100, total:total, bonus:bonus, fixes:F, hl:hlAll,
    stat:{c1:T1.length,c2:T2.length,uHigh:uHigh,dimHit:pers.length},
    sum:{
      overview:overview, aspect:('现场管理/人员服务/招聘能力/IT应用 四维覆盖情况：'+aspLine+'。'),
      needs:E.needs.map(function(x){return x.t;}),
      hl:topHl(hlAll,6),
      pain:uniq(F.map(function(f){return f.thing;})).slice(0,6),
      /* 主人 2026-10-22 定：重点提升/打造事项 1~4 条均可，按优先级取 P0→P3；不足时用真实亮点补「优势深化」 */
      focus:focusTop(F,hlAll,4),
      pains:E.pains, needsRaw:E.needs
    }
  };
  /* 独立评价项：客户满意度 / 员工满意度（结合四维结果 + 输入 + Part.3 判定） */
  R.evals=buildEvals(R,T);

  R.json={
    project:meta, kb:{ver:KB.meta.ver,updated:KB.meta.updated},
    input:{oral:T1.length,supp:T2.length},
    dims_hit:pers, dims_detail:D.map,
    scores:{rows:S.rows.map(function(o){return {id:o.row.id,name:o.row.name,target:o.row.target,actual:o.actual,state:o.state,got:o.got,max:o.row.max,suggest:o.sugg};}),
            parts:{P1:S.parts.P1,P2:S.parts.P2,P3:S.parts.P3,P4:P4},base:base,K:Math.round(K*100)/100,total:total,na_sum:S.naSum,pending:S.pend},
    extraction:{needs:E.needs,pains:E.pains.length,highlights:hlAll.map(function(h){return {t:h.t,level:h.level,gate:h.gate,why:h.why};})},
    fixes:F.map(function(f){return {pri:f.pri,dim:f.dim,dim_name:f.dimName,tags:f.tags.map(tagShort),stars:f.stars,urgency:f.urg,
      thing:f.thing, action:(f.primary&&f.primary.todo)?'措施待补充':((f.primary&&f.primary.act)?f.primary.act.id:'—'),
      judge:{five:{D1:f.jd.D.D1.sc,D2:f.jd.D.D2.sc,D3:f.jd.D.D3.sc,D4:f.jd.D.D4.sc,D5:f.jd.D.D5.sc},total:f.jd.total,
             red_flags:f.jd.rf,verdict:f.jd.verdict,weak:f.jd.weak,confidence:f.jd.conf,methods:f.methods,from_method:f.fromMethod},
      owner:f.owner,due:f.due};}),
    evals:(R.evals||[]).map(function(e){return {id:e.id,name:e.name,level:e.lv,basis:e.basisLine,suggest:e.sugg,part3:{got:e.got,max:e.max}};}),
    rules_ver:(KB.rules&&KB.rules.src)?KB.rules.src.join(' / '):'',
    note:KB.cfg.simTag
  };

  /* 覆盖度检查：逐条核对子项是否被输入覆盖，未覆盖项生成追问话术 */
  LAST.D=D; LAST.S=S;
  R.cover=buildCover(D,S); CV=R.cover;
  renderReport();
  renderCover();
  pLog('COVER','覆盖度 '+CV.stat.rate+'%：已覆盖 '+CV.stat.full+' / 待补充 '+CV.stat.gap+'（必须补 '+CV.stat.must+'）/ 不适用 '+CV.stat.na+' / 评分缺数 '+CV.stat.score, CV.stat.must?'warn':'ok');
  paintRail(6); pNow('完成');
  setPill('已生成');
  pLog('S6','整改事项 '+F.length+' 项，其中 P0 '+F.filter(function(f){return f.pri==='P0';}).length+' / P1 '+F.filter(function(f){return f.pri==='P1';}).length+' 项；IT 类 '+F.filter(function(f){return f.primary&&f.primary.todo;}).length+' 项标记为「措施待补充」。','ok');
  pLog('TOTAL','Part 合计 '+base+' × K='+(Math.round(K*100)/100)+' + 加分 '+P4+' = '+total+' 分（'+KB.cfg.simTag+'）','ok');
  var rt=$('rptTag'); if(rt) rt.textContent=total+' 分 · '+F.length+' 项待整改';
  window.scrollTo({top:($('doc').getBoundingClientRect().top+window.scrollY-70),behavior:'smooth'});
  /* 主人 2026-10-27 定：AI 开关开启时，报告生成后自动执行 AI 辅助诊断（不再放散落小按钮） */
  if(window.__llm&&window.__llm.maybeAuto) window.__llm.maybeAuto();
}
function ownerOf(s){
  var m=String(s).match(/([\u4e00-\u9fa5]{2,4})(?:负责|牵头|跟进|落实)/);
  if(m) return m[1];
  var m2=String(s).match(/责任人[：: ]*([\u4e00-\u9fa5]{2,4})/);
  if(m2) return m2[1];
  return '待指定';
}
function tipOf(f){
  if(f.urg==='高' && /限期|截止|要求/.test(f.thing)) return '客户已提出明确时限，须优先闭环';
  if(f.tags.indexOf('TAG-DT')>=0) return '需同步核对系统口径与实际口径';
  if(f.tags.indexOf('TAG-V')>=0) return '整改后须留存图文作证，便于看板展示';
  return '';
}

/* ---------------- 导出 ---------------- */
function csvOf(){
  var rows=[['Part','一级维度','名称','目标','实际','达成情况','得分','满分','建议']];
  (KB.score.parts||[]).forEach(function(pt){
    R.score.rows.filter(function(o){return o.row.part===pt.part;}).forEach(function(o){
      var reach=o.state==='NA'?'不适用':(o.state==='TBD'?'待确认':(o.got>=o.row.max?'达标':(o.got>0?'部分达成':'未达成')));
      rows.push([pt.title,o.row.l1||'',o.row.name||'',o.row.target||'',String(o.actual||'').replace(/\s+/g,' '),reach,o.state==='NA'?'N/A':o.got,o.row.max,o.sugg||'']);
    });
  });
  rows.push([]);
  rows.push(['小计','Part.1='+R.parts.P1,'Part.2='+R.parts.P2,'Part.3='+R.parts.P3,'Part.4='+R.parts.P4,'基准='+(R.parts.P1+R.parts.P2+R.parts.P3),'K='+R.K,'总得分='+R.total]);
  rows.push([]);
  rows.push(['优先级','维度','子项','标签','星级','事项','建议行动项','责任人','交期']);
  R.fixes.forEach(function(f){
    rows.push([f.pri,f.dim+' '+f.dimName,f.dimName,f.tags.map(tagShort).join('/'),'★'.repeat(f.stars),
      f.thing.replace(/\s+/g,' '),
      (f.primary&&f.primary.todo)?'措施待补充':((f.primary&&f.primary.act)?f.primary.act.act.n:'—'),
      f.owner,f.due]);
  });
  return rows.map(function(r){return r.map(function(c){return '"'+String(c==null?'':c).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
}
function dl(name,txt,type){
  var b=new Blob([txt],{type:type||'text/plain;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove();},400);
}
function reportHtml(){
  var css=Array.prototype.slice.call(document.styleSheets).length;
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>'+esc(R.meta.name)+' 项目运营诊断报告</title>'
   +'<style>body{font-family:"Microsoft YaHei",system-ui,sans-serif;background:#f3efe6;margin:0;padding:24px;color:#1b2430}'
   +'.wrap{max-width:1100px;margin:0 auto;background:#fffdf7;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.08)}'
   +'h4{font-size:13.5px;border-left:4px solid #b98f3f;padding-left:9px;margin:18px 0 8px}'
   +'table{width:100%;border-collapse:collapse;font-size:12.3px}th,td{border:1px solid #ddd4c0;padding:7px 9px;text-align:left;vertical-align:top}'
   +'th{background:#f0e9da}td.num{text-align:center}tr.na td{color:#8b96a3;background:#f6f3ec}tr.tbd td{background:#fdf6e8}'
   +'.totalbox{border:1px solid #b98f3f;border-radius:12px;padding:12px;margin-top:10px}.big{font-size:22px;font-weight:700}'
   +'.fm{font-size:12px;color:#5a6875;margin-top:4px;font-family:Consolas,monospace}'
   +'.warnbox{border-left:4px solid #d79a3c;background:#fff8ec;padding:9px 12px;font-size:12.3px;margin-top:8px;color:#6b4e14}'
   +'.tag{font-size:10.5px;padding:2px 7px;border-radius:99px;background:#f0e9da;color:#6d5a2c}'
   +'.rh{border-bottom:2px solid #1b2430;padding:20px 24px 10px}.who{font-size:12.5px;color:#5a6875;line-height:1.7}'
   +'.srcbox{font-size:11.5px;color:#7a8593;border-top:1px dashed #ddd4c0;margin:16px 24px 0;padding:12px 0 24px;line-height:1.8}'
   +'.in{padding:0 24px 8px}@media print{body{background:#fff;padding:0}.wrap{box-shadow:none}}</style></head><body><div class="wrap">'
   +$('doc').innerHTML.replace(/<button class="aifix"[\s\S]*?<\/button>/g,'')+'</div></body></html>';
}

/* ---------------- 页面布局（管理员可增减与排布） ---------------- */
function applyLayout(){
  try{
    [['input','cardIn'],['proc','cardProc']].forEach(function(pair){
      var arr=(KB.layout&&KB.layout[pair[0]])||[], parent=document.getElementById(pair[1]);
      if(!parent) return;
      arr.forEach(function(b){
        var el=document.getElementById(b.id); if(!el) return;
        el.style.display=(b.on===false)?'none':'';
        parent.appendChild(el); /* 按 配置顺序 重排 DOM */
      });
      var anyOn=arr.some(function(b){return b.on!==false;});
      parent.style.display=anyOn?'':'none';
    });
  }catch(e){}
}

/* ---------------- 管理员密钥验证 ---------------- */
var adminOK=false;
function adminOpen(){
  $('modal').classList.add('on');
  if(!adminOK){ renderLock(); return; }
  $('adminState').textContent='当前 v'+KB.meta.ver+' · 更新于 '+KB.meta.updated+(KBDirty?' · 有未保存改动':'');
  adminRender();
}
function renderLock(){
  var h=$('mhead');
  if(h) Array.prototype.forEach.call(h.querySelectorAll('button'),function(b){ if(b.id!=='btnClose') b.style.display='none'; });
  $('adminState').textContent='🔒 管理员验证';
  $('mbody').innerHTML='<div class="actcard" style="max-width:420px;margin:30px auto"><div class="t">请输入管理员密钥</div>'
   +'<div class="field" style="margin-top:12px"><label>密钥</label><input id="adminKeyIn" type="password" placeholder="管理员密钥" /></div>'
   +'<div style="margin-top:10px;display:flex;gap:8px"><button class="btn teal sm" id="btnKeyGo" type="button">验证进入</button>'
   +'<button class="btn ghost sm" id="btnKeyCancel" type="button">取消</button></div>'
   +'<div style="font-size:11.5px;color:#8aa;margin-top:10px">密钥可在进入后台后于「概览与总控」页签修改。</div></div>';
  $('btnKeyGo').addEventListener('click',tryKey);
  $('btnKeyCancel').addEventListener('click',function(){ $('modal').classList.remove('on'); });
  $('adminKeyIn').addEventListener('keydown',function(e){ if(e.key==='Enter') tryKey(); });
  setTimeout(function(){ try{ $('adminKeyIn').focus(); }catch(e){} },60);
}
function tryKey(){
  var v=($('adminKeyIn').value||'').trim();
  if(v && v===String(KB.cfg.adminKey||'')){
    adminOK=true;
    var h=$('mhead'); if(h) Array.prototype.forEach.call(h.querySelectorAll('button'),function(b){ b.style.display=''; });
    $('adminState').textContent='当前 v'+KB.meta.ver+' · 更新于 '+KB.meta.updated;
    adminRender(); toast('管理员验证通过');
  }else{ toast('密钥不正确，无法进入后台'); }
}

/* ---------------- 知识库 MD 分卷导出 / 导入 ---------------- */
function mdVols(){
  var J=function(o){return JSON.stringify(o);};
  var SEC={};   /* 分节：id → markdown（每个分节自带 <!--KBVOL:NN--> 卷标记） */
  var vstamp='导出时间：'+ymd()+'　版本：v'+KB.meta.ver;
  /* 00 总控与标签 */
  var s0='<!--KBVOL:00-->\n# 外包项目运营诊断知识库 · 00 总控与标签\n> '+vstamp+'（可编辑后导入回写）\n\n'
   +'## 元信息\n'
  +'- 名称：'+KB.meta.name+'\n- 版本：'+KB.meta.ver+'\n- 更新日期：'+KB.meta.updated+'\n'
  +'- 免责声明：'+KB.cfg.simTag+'\n- 总分公式：'+KB.cfg.totalFormula+'\n- K折算公式：'+KB.cfg.kFormula+'\n'
  +'- 成熟度分级：'+(KB.cfg.grading?'开启':'关闭')+'\n- IT措施缺口说明：'+KB.cfg.pendingITNote+'\n'
  +'- 管理员密钥：'+KB.cfg.adminKey+'\n\n'
   +'## 整改标签（8 分类，严格使用，不可自定义）\n| 代码 | 简写 | 名称 | 颜色 |\n|---|---|---|---|\n';
  KB.tags.forEach(function(t){ s0+='| '+t.code+' | '+t.short+' | '+t.name+' | '+t.color+' |\n'; });
  SEC['00']=s0;
  /* 01 四维审查维度表 */
  var s1='<!--KBVOL:01-->\n# 外包项目运营诊断知识库 · 01 四维审查维度表\n> '+vstamp+'\n\n';
  KB.aspects.forEach(function(a){
    s1+='## '+a.code+' '+a.name+' ｜ '+(a.slogan||'')+'\n\n';
    (a.items||[]).forEach(function(it){
      s1+='### '+it.code+' '+it.name+'\n'
       +'- 审查要点：'+(it.reviews||[]).join('、')+'\n'
       +'- 证据信号：'+(it.signals||[]).join('、')+'\n'
       +'- 整改标签：'+(it.tags||[]).join('、')+'\n'
       +'- 措施族：'+(it.families||[]).join('、')+'\n'
       +'- 关键词：'+(it.kw||[]).join('、')+'\n\n';
    });
  });
  SEC['01']=s1;
  /* 02 判定与排序规则 */
  var ex=KB.extract, pr=KB.priority;
  var s2='<!--KBVOL:02-->\n# 外包项目运营诊断知识库 · 02 判定与排序规则\n> '+vstamp+'\n\n'
   +'## 客户需求提取信号\n- 信号词：'+ex.need.pat.join('、')+'\n- 落位：'+ex.need.place+'\n\n'
   +'## 项目痛点负面信号\n- 信号词：'+ex.pain.neg.join('、')+'\n- 落位：'+ex.pain.place+'\n\n'
   +'## 项目亮点成果信号\n- 信号词：'+ex.hl.pos.join('、')+'\n- 落位：'+ex.hl.place+'\n- 亮点门槛：证据≥2条（量化结果/持续机制/可展示/客户表彰）\n\n';
  ['高','中','低'].forEach(function(k){
    s2+='### 紧急度·'+k+'\n- 信号词：'+(pr.urgency[k]||[]).join('、')+'\n\n';
  });
  [5,4,3,2].forEach(function(k){
    s2+='### 重要度★'+k+'\n- 信号词：'+(pr.stars[String(k)]||[]).join('、')+'\n\n';
  });
  s2+='## 优先级矩阵（行=紧急度，列=重要度档）\n| 紧急度＼重要度 | 高 | 中 | 低 |\n|---|---|---|---|\n';
  ['高','中','低'].forEach(function(u){
    s2+='| '+u+' | '+(pr.matrix[u].高)+' | '+(pr.matrix[u].中)+' | '+(pr.matrix[u].低)+' |\n';
  });
  s2+='\n## 建议交期\n';
  ['P0','P1','P2','P3'].forEach(function(p){
    s2+='- '+p+'：'+pr.lead[p]+' 天 ｜ '+(pr.leadLabel[p]||'')+'\n';
  });
  SEC['02']=s2;
  /* 03 评分规则 */
  var s3='<!--KBVOL:03-->\n# 外包项目运营诊断知识库 · 03 评分规则\n> '+vstamp+'\n\n'
   +'## Part 定义\n';
  KB.score.parts.forEach(function(pt){
    s3+='- '+pt.part+' ｜ '+pt.title+' ｜ 满分 '+pt.max+' ｜ 一级列：'+(pt.colL1||'—')+' ｜ 依据列：'+(pt.colBasis||'—')+'\n';
  });
  s3+='\n## 评分项\n\n';
  KB.score.rows.forEach(function(r){
    s3+='### '+r.id+' '+(r.name||r.l1||'')+'\n'
     +'- 所属Part：'+r.part+'\n- 方面：'+(r.aspect||'')+'\n- 一级维度：'+(r.l1||'')+'\n'
     +'- 满分：'+r.max+'\n- 类型：'+r.type+'\n- 目标：'+(r.target||'')+'\n'
     +'- 取值关键词：'+(r.pat||[]).join('、')+'\n'
     +'- 上下文约束：'+((r.ctx||[]).join('、')||'—')+'\n'
     +'- 取证：'+(r.evidence===false?'否':'是')+'\n'
     +'- 备注：'+(r.hint||'—')+'\n'
     +((r.ladder)?('- 参数：'+J(r.ladder)+'\n'):'');
    (r.bands||[]).forEach(function(b,i){
      s3+='- 档位'+(i+1)+'：'+b.d+' ｜ 表达式 '+(b.e||'—')+' ｜ '+(b.v==null?'——':b.v)+'\n';
    });
    s3+='\n';
  });
  SEC['03']=s3;
  /* 04 写作要求 */
  SEC['04']='<!--KBVOL:04-->\n# 外包项目运营诊断知识库 · 04 写作要求与技巧\n> '+vstamp+'\n\n'+(KB.guide||'（空）')+'\n';
  /* 05 变更日志 */
  var s5='<!--KBVOL:05-->\n# 外包项目运营诊断知识库 · 05 变更日志\n> '+vstamp+'\n\n| 版本 | 日期 | 说明 |\n|---|---|---|\n';
  (KB.log||[]).forEach(function(l){ s5+='| '+l.v+' | '+l.d+' | '+l.m+' |\n'; });
  SEC['05']=s5;
  /* 06 覆盖度判定标准 */
  var cv=KB.cover||{};
  var s6='<!--KBVOL:06-->\n# 外包项目运营诊断知识库 · 06 判定标准B · 描述完整性（含输入覆盖度）\n> '+vstamp+'\n\n'
   +'## 判定规则\n- '+String(cv.rule||'').replace(/\n/g,'\n- ')+'\n\n'
   +'## 状态定义\n| 代码 | 名称 | 自动判定等级 lv | 是否必须补 | 说明 |\n|---|---|---|---|---|\n';
  (cv.states||[]).forEach(function(s){
    s6+='| '+s.code+' | '+s.name+' | '+(s.lv==null?'—':s.lv)+' | '+(s.must?'是':'否')+' | '+(s.note||'')+' |\n';
  });
  s6+='\n## 追问话术模板\n';
  ['MISS','DESC','MEC','FULL','NA'].forEach(function(k){
    s6+='- '+k+'：'+((cv.asks||{})[k]||'（空）')+'\n';
  });
  s6+='\n## 评分项缺数值话术\n- '+String(cv.scoreAsk||'')+'\n';
  s6+='\n## 三阶判定流程\n'
   +'1. 阶段一 适用性判定：Q1 是否属本项目业务范围？Q2 本阶段是否应开展？Q3 是否有对应标准/制度/客户要求？任一为「否」→ 输出「无」（不适用），终止。\n'
   +'2. 阶段二 执行证据判定：Q4 是否有可观测的执行证据（记录/照片/台账/系统数据）？为「否」→ 输出「未执行」，终止。\n'
   +'3. 阶段三 八要素完整性判定：逐项核对下表，缺任一项 → 「不足应补充」并列出 missing_fields；八项齐全 → 「完整」。\n'
   +'4. 安全出口：文本自相矛盾 / 关键字段无法还原 → 「证据不足，待确认」。\n'
   +'\n> 铁律：状态码与措辞一一绑定，「无」≠「未执行」；判「未执行」前必须先确认 Q3 为「是」。\n\n'
   +'## 八要素核对表\n| 要素码 | 要素名 | 缺失时的补充追问 |\n|---|---|---|\n';
  ((KB.rules&&KB.rules.eightElements)||[]).forEach(function(e){
    s6+='| '+e.code+' | '+e.name+' | '+(e.ask||'')+' |\n';
  });
  SEC['06']=s6;
  /* 07 措施卡库 */
  var s7='<!--KBVOL:07-->\n# 外包项目运营诊断知识库 · 07 措施卡库（ACT）\n> '+vstamp+'　共 '+IDX.acts.length+' 张\n\n'
   +'| 字段 | 含义 |\n|---|---|\n| 名称 | 措施卡标题 |\n| 措施族 | 与维度子项 families 对应 |\n| 分组 | 卡片分组 |\n| 周期/难度 | 预计落地周期与实施难度 |\n| 前置 | 需先完成的措施卡 |\n| 触发条件 | 什么场景用这张卡 |\n| 实施步骤 | 落地动作 |\n| 关键 | 实施关键点 |\n| 验收 | 验收标准 |\n| 不适用 | 什么情况不用 |\n\n';
  IDX.acts.forEach(function(x){
    var a=x.act;
    s7+='### '+x.id+' '+a.n+'\n'
     +'- 措施族：'+(a.f||'')+'\n- 分组：'+(a.grp||'—')+'\n- 周期：'+(a.cy||'—')+'\n- 难度：'+(a.df||'—')+'\n'
     +'- 前置：'+((a.pre&&a.pre.length)?a.pre.join('、'):'—')+'\n'
     +'- 触发条件：'+(a.tr||'—')+'\n- 实施步骤：'+(a.st||'—')+'\n- 关键：'+(a.kf||'—')+'\n'
     +'- 验收：'+(a.ac||'—')+'\n- 不适用：'+(a.na||'—')+'\n\n';
  });
  SEC['07']=s7;
  /* 09 判定标准A（好坏判定与措施匹配） */
  var RU=KB.rules||{};
  var s9='<!--KBVOL:09-->\n# 外包项目运营诊断知识库 · 09 判定标准A · 问题识别与方法匹配\n> '+vstamp
   +'　来源：'+((RU.src||[]).join(' / ')||'01_RULE / 02_RULE')+'\n\n'
   +'> 这是「一个事项是好还是坏」的标尺，也是措施卡的触发依据：五维打分 → 红灯扫描 → 结论阈值 → 方法族 → 措施卡。\n\n'
   +'## 五维评分卡（每维 0–3 分，满分 15；用于定性，不等于评分表分值）\n'
   +'| 维度码 | 维度名 | 0 分 | 1 分 | 2 分 | 3 分 | 证据信号词 |\n|---|---|---|---|---|---|---|\n';
  (RU.fiveDims||[]).forEach(function(d){
    var a=d.anchors||[];
    s9+='| '+d.code+' | '+d.name+' | '+(a[0]||'')+' | '+(a[1]||'')+' | '+(a[2]||'')+' | '+(a[3]||'')+' | '+((d.signals||[]).join('、'))+' |\n';
  });
  s9+='\n## 红灯清单（命中即一票否决，并直接提为 P0）\n| 红灯码 | 红灯项 | 典型证据信号 |\n|---|---|---|\n';
  (RU.redFlags||[]).forEach(function(f){ s9+='| '+f.code+' | '+f.name+' | '+((f.signals||[]).join('、'))+' |\n'; });
  var V=RU.verdict||{};
  s9+='\n## 结论判定规则\n| 结论 | 触发条件 | 输出动作 |\n|---|---|---|\n'
   +'| 亮点 highlight | '+((V.highlight&&V.highlight.txt)||'')+' | 输出优势结论 + 固化/复制方法 |\n'
   +'| 不足 problem | '+((V.problem&&V.problem.txt)||'')+' | 输出整改事项 + 改善/根因方法 |\n'
   +'| 待确认 pending | '+((V.pending&&V.pending.txt)||'')+' | 标「待确认」，不赋分、不出方法，转人工补证 |\n'
   +'\n> 边界护栏：'+((V.guard)||'')+'\n\n';
  s9+='## 亮点 → 固化 / 复制方法（5 类）\n| 方法码 | 方法名 | 适用判定特征 | 默认措施 | 验收指标 |\n|---|---|---|---|---|\n';
  ((RU.methods&&RU.methods.hl)||[]).forEach(function(m){
    s9+='| '+m.code+' | '+m.name+' | '+(m.when||'')+' | '+((m.acts||[]).join(' '))+' | '+(m.kpi||'')+' |\n';
  });
  s9+='\n## 不足 → 改善 / 根因方法（15 类 · 措施卡触发入口）\n| 方法码 | 方法名 | 触发信号 | 默认措施 | 验收指标 |\n|---|---|---|---|---|\n';
  ((RU.methods&&RU.methods.pb)||[]).forEach(function(m){
    s9+='| '+m.code+' | '+m.name+' | '+(m.when||'')+' | '+((m.acts||[]).join(' '))+' | '+(m.kpi||'')+' |\n';
  });
  s9+='\n## 方法匹配优先序\n| 命中情形 | 优先方法 |\n|---|---|\n';
  (RU.pickOrder||[]).forEach(function(o){
    s9+='| '+o.when+' | '+(((o.go||[]).join(' + '))||'强制转人工，只出「待确认」')+' |\n';
  });
  s9+='\n## 措施触发链（引擎实现口径）\n'
   +'1. 对每条痛点按其所在子项的文本证据打五维分；\n'
   +'2. 命中红灯 → 该事项直接判「不足」并提为 P0，方法族取红灯对应族；\n'
   +'3. 未命中红灯 → 取最低分维度（弱维）按上表优先序映射到方法族；\n'
   +'4. 候选方法族中，选「默认措施与本子项措施族重叠最多」的一族作为主选；\n'
   +'5. 在该族默认措施池内按触发词收敛为「首选 1 张 + 备选 ≤2 张」；\n'
   +'6. 子项未绑定措施族（如 D1–D3 IT 应用、C6）→ 填「措施待补充」，禁止硬套其他族。\n';
  SEC['09']=s9;

  /* 08 知识包（问题—根因—措施） */
  var s8='<!--KBVOL:08-->\n# 外包项目运营诊断知识库 · 08 知识包（KP：问题—根因—措施）\n> '+vstamp+'　共 '+(IDX.kp?Object.keys(IDX.kp).length:0)+' 条\n\n';
  if(IDX.kp) Object.keys(IDX.kp).forEach(function(k){
    var o=IDX.kp[k];
    s8+='### '+k+' '+o.t+'\n'
     +'- 行业：'+(o.ind||'通用')+'\n- 一级维度：'+(o.d1||'')+'\n- 二级维度：'+(o.d2||'')+'\n- 域：'+(o.dom||'')+'\n'
     +'- 问题场景：'+(o.scene||'—')+'\n- 根因：'+(o.root||'—')+'\n'
     +'- 措施组合：'+((o.acts||[]).join('、')||'—')+'\n- 关键词：'+((o.kw||[]).join('、')||'—')+'\n\n';
  });
  SEC['08']=s8;

  /* 11 独立评价项（客户 / 员工满意度） */
  var s11='<!--KBVOL:11-->\n# 外包项目运营诊断知识库 · 11 独立评价项（客户 / 员工满意度）\n> '+vstamp+'\n\n';
  (KB.evals||[]).forEach(function(e){
    s11+='## '+e.id+' '+e.name+'\n'
     +'- 依据评分项：'+((e.scoreItems||[]).join('、')||'—')+'\n'
     +'- 关联子项：'+((e.dims||[]).join('、')||'—')+'\n'
     +'- 判定口径：'+(e.basis||'—')+'\n'
     +'- 备注：'+(e.note||'—')+'\n\n'
     +'| 等级 | 判定条件 |\n|---|---|\n';
    (e.levels||[]).forEach(function(l){ s11+='| '+l.lv+' | '+l.cond+' |\n'; });
    s11+='\n';
  });
  SEC['11']=s11;

  /* ---------------- 按「原始文档名」归组（主人 2026-10-22 定：名称不换，仅迭代内容） ----------------
     一个原始文档可含多个分节，分节仍以 <!--KBVOL:NN--> 标记，导入时按标记切分回写。
     文件清单 = 内置 5 个原始文档 + 使用者上传登记的自定义文件；停用的文件不再导出。 */
  var vols=[];
  mdFiles().forEach(function(f){
    var head='<!--KBFILE:'+f.name+'-->\n> 外包项目运营诊断知识库 · 原始文档：**'+f.name+'**\n'
      +'> '+vstamp+'　本文件含 '+f.vols.length+' 个分节：'+f.vols.join(' / ')+'\n'
      +'> 说明：文件名沿用原始知识库文档名，只迭代内容、不重命名；分节之间以 <!--KBVOL:NN--> 标记，可整卷导入回写。\n\n';
    var body=f.vols.map(function(id){ return SEC[id]||''; }).join('\n\n');
    vols.push([f.name, head+body]);
  });
  return vols;
}
var VOLSRC={ /* 分节 → 知识库节点（后台「MD 文件库」展示来源用） */
 '00':'meta / cfg / tags（总控与整改标签）','01':'aspects（四维 27 子项）','02':'priority / extract（排序与信号词）',
 '03':'score（17 评分项）','04':'guide（写作要求）','05':'log（变更日志）','06':'cover / 八要素（判定标准B）',
 '07':'acts（72 措施卡）','08':'kp（34 知识包）','09':'rules（判定标准A）','11':'evals（独立评价项）'
};
function mdFiles(){
  var BUILTIN=[
   {name:'00_INDEX_知识库总索引与AI调用规范.md', vols:['00','05'], builtin:true},
   {name:'01_RULE_问题识别与方法匹配判定标准.md', vols:['09','02','11'], builtin:true},
   {name:'02_RULE_描述完整性判定标准.md', vols:['06'], builtin:true},
   {name:'03_KNOWLEDGE_制造业外包项目运营知识库.md', vols:['01','03','07','08'], builtin:true},
   {name:'项目走访报告写作要求与技巧.md', vols:['04'], builtin:true}
  ];
  var st=KB.mdState||{};
  var list=BUILTIN.concat((KB.files||[]).map(function(f){ return {name:f.name,vols:f.vols||[],builtin:false,note:f.note||''}; }));
  return list.filter(function(f){ return !st[f.name]||st[f.name].on!==false; });
}
function mdFilesAll(){
  var BUILTIN=[
   {name:'00_INDEX_知识库总索引与AI调用规范.md', vols:['00','05'], builtin:true},
   {name:'01_RULE_问题识别与方法匹配判定标准.md', vols:['09','02','11'], builtin:true},
   {name:'02_RULE_描述完整性判定标准.md', vols:['06'], builtin:true},
   {name:'03_KNOWLEDGE_制造业外包项目运营知识库.md', vols:['01','03','07','08'], builtin:true},
   {name:'项目走访报告写作要求与技巧.md', vols:['04'], builtin:true}
  ];
  return BUILTIN.concat((KB.files||[]).map(function(f){ return {name:f.name,vols:f.vols||[],builtin:false,note:f.note||''}; }));
}
function exportMd(){
  var vols=mdVols();
  var i=0;
  (function next(){
    if(i>=vols.length){ toast('已导出 '+vols.length+' 个知识库 MD 文件'); return; }
    dl('KB_'+vols[i][0],vols[i][1],'text/markdown;charset=utf-8');
    i++; setTimeout(next,350);
  })();
}
function li1(line){ /* "- key：value" → [key,value] */
  var m=line.match(/^-\s*(.+?)：([\s\S]*)$/); return m?[m[1].trim(),m[2].trim()]:null;
}
function splitV(s){ return splitList(s); }
function parseMdVols(files,done){
  var jobs=[],pend=files.length,errs=[];
  Array.prototype.forEach.call(files,function(f){
    var fr=new FileReader();
    fr.onload=function(){
      var txt=String(fr.result||'');
      var hm=txt.match(/<!--KBFILE:([^>]+)-->/);
      var kbname=hm?String(hm[1]).trim():String(f.name).replace(/^KB_/,'');
      /* 一个文件可能含多个分节（如 03_KNOWLEDGE 含 01/03/07/08），按卷标记切分 */
      var segs=txt.split(/(?=<!--KBVOL:\d\d-->)/), found=false;
      segs.forEach(function(seg){
        var m=seg.match(/<!--KBVOL:(\d\d)-->/);
        if(m){ jobs.push({vol:m[1],name:f.name,file:kbname,txt:seg}); found=true; }
      });
      if(!found) jobs.push({vol:null,name:f.name,txt:txt});
      if(--pend===0) applyMd(jobs,errs,done);
    };
    fr.onerror=function(){ errs.push(f.name+' 读取失败'); if(--pend===0) applyMd(jobs,errs,done); };
    fr.readAsText(f);
  });
}
function applyMd(jobs,errs,done){
  var applied=[];
  jobs.forEach(function(j){
    try{
      if(!j.vol){ errs.push(j.name+'：缺少卷标记 <!--KBVOL:NN-->，已跳过'); return; }
      var t=j.txt;
      if(j.vol==='00'){
        var g=function(k){ var mm=t.match(new RegExp('-\\s*'+k+'：([\\s\\S]*)')); return mm?mm[1].split('\n')[0].trim():null; };
        if(g('名称')) KB.meta.name=g('名称');
        if(g('免责声明')) KB.cfg.simTag=g('免责声明');
        if(g('总分公式')) KB.cfg.totalFormula=g('总分公式');
        if(g('K折算公式')) KB.cfg.kFormula=g('K折算公式');
        if(g('成熟度分级')) KB.cfg.grading=/开启/.test(g('成熟度分级'));
        if(g('IT措施缺口说明')) KB.cfg.pendingITNote=g('IT措施缺口说明');
        if(g('管理员密钥')) KB.cfg.adminKey=g('管理员密钥');
        var tb=t.match(/## 整改标签[\s\S]*?\n\|---\|[\s\S]*?\n([\s\S]*?)(?:\n\n|$)/);
        if(tb){
          var tags=[];
          tb[1].trim().split('\n').forEach(function(r){
            var c=r.split('|').map(function(x){return x.trim();}).filter(Boolean);
            if(c.length>=4&&/^TAG-/.test(c[0])) tags.push({code:c[0],short:c[1],name:c[2],color:c[3]});
          });
          if(tags.length){ KB.tags=tags; applied.push('00 标签×'+tags.length); }
        }
        applied.push('00 总控');
      }
      if(j.vol==='01'){
        var items=[],cur=null,curIt=null;
        t.split('\n').forEach(function(line){
          var m;
          if((m=line.match(/^## ([A-E]) (.+?) ｜ (.*)$/))){ cur={code:m[1],name:m[2].trim(),slogan:m[3].trim(),items:[]}; items.push(cur); return; }
          if((m=line.match(/^### ([A-E]\d+) (.+)$/))){
            if(cur){ curIt={code:m[1],name:m[2].trim(),reviews:[],signals:[],tags:[],families:[],kw:[]}; cur.items.push(curIt); }
            return;
          }
          var kv=line.match(/^-\s*(审查要点|证据信号|整改标签|措施族|关键词)：(.*)$/);
          if(kv&&curIt){
            var v=splitV(kv[2]);
            if(kv[1]==='审查要点') curIt.reviews=v;
            else if(kv[1]==='证据信号') curIt.signals=v;
            else if(kv[1]==='整改标签') curIt.tags=v;
            else if(kv[1]==='措施族') curIt.families=v;
            else curIt.kw=v;
          }
        });
        if(items.length&&items.every(function(a){return a.items.length;})){
          KB.aspects=items; applied.push('01 四维（'+items.map(function(a){return a.code+':'+a.items.length;}).join(' ')+'）');
        }else errs.push(j.name+'：维度表解析不完整，未回写');
      }
      if(j.vol==='02'){
        var grabList=function(title){
          var mm=t.match(new RegExp('## '+title+'[\\s\\S]*?-\\s*信号词：(.*)'));
          return mm?splitV(mm[1].split('\n')[0]):null;
        };
        var needPat=grabList('客户需求提取信号'); if(needPat) KB.extract.need.pat=needPat;
        var painPat=grabList('项目痛点负面信号'); if(painPat) KB.extract.pain.neg=painPat;
        var hlPat=grabList('项目亮点成果信号'); if(hlPat) KB.extract.hl.pos=hlPat;
        ['高','中','低'].forEach(function(k){
          var mm=t.match(new RegExp('### 紧急度·'+k+'[\\s\\S]*?-\\s*信号词：(.*)'));
          if(mm) KB.priority.urgency[k]=splitV(mm[1].split('\n')[0]);
        });
        [5,4,3,2].forEach(function(k){
          var mm=t.match(new RegExp('### 重要度★'+k+'[\\s\\S]*?-\\s*信号词：(.*)'));
          if(mm) KB.priority.stars[String(k)]=splitV(mm[1].split('\n')[0]);
        });
        var mtx=t.match(/## 优先级矩阵[\s\S]*?\n\|---\|[\s\S]*?\n([\s\S]*?)(?:\n\n|$)/);
        if(mtx){
          mtx[1].trim().split('\n').forEach(function(r){
            var c=r.split('|').map(function(x){return x.trim();}).filter(Boolean);
            if(c.length===4&&KB.priority.matrix[c[0]]) KB.priority.matrix[c[0]]={高:c[1],中:c[2],低:c[3]};
          });
        }
        ['P0','P1','P2','P3'].forEach(function(p){
          var mm=t.match(new RegExp('-\\s*'+p+'：\\s*(\\d+)\\s*天\\s*｜\\s*(.*)'));
          if(mm){ KB.priority.lead[p]=parseInt(mm[1],10); KB.priority.leadLabel[p]=mm[2].trim(); }
        });
        applied.push('02 判定与排序');
      }
      if(j.vol==='03'){
        var rows=[],cur=null,parts=[];
        var pm=t.match(/## Part 定义\n([\s\S]*?)\n\n/);
        if(pm){ pm[1].trim().split('\n').forEach(function(line){
          var c=line.replace(/^-\s*/,'').split('｜').map(function(x){return x.trim();});
          if(c.length>=5) parts.push({part:c[0],title:c[1],max:parseFloat(c[2])||0,colL1:c[3]==='—'?'':c[3],colBasis:c[4]==='—'?'':c[4],colL2:''});
        }); }
        t.split('\n').forEach(function(line){
          var mh=line.match(/^### ((?:SC|P)-[A-Za-z0-9\-]+) ?(.*)$/);
          if(mh){ cur={id:mh[1],name:mh[2].trim(),part:'',aspect:'',l1:'',max:0,type:'band',target:'',pat:[],ctx:[],bands:[],hint:'',ladder:null}; rows.push(cur); return; }
          var kv=line.match(/^-\s*(.+?)：([\s\S]*)$/);
          if(kv&&cur){
            var k=kv[1].trim(), v=kv[2].trim();
            if(k==='所属Part') cur.part=v;
            else if(k==='方面') cur.aspect=v;
            else if(k==='一级维度') cur.l1=v;
            else if(k==='满分') cur.max=parseFloat(v)||0;
            else if(k==='类型') cur.type=v;
            else if(k==='目标') cur.target=v;
            else if(k==='取值关键词') cur.pat=splitV(v);
            else if(k==='上下文约束') cur.ctx=(v==='—'?[]:splitV(v));
            else if(k==='取证') cur.evidence=(v!=='否');
            else if(k==='备注') cur.hint=(v==='—'?'':v);
            else if(k==='参数'){ try{ cur.ladder=JSON.parse(v); }catch(e){} }
            else if(/^档位\d+/.test(k)){
              var bm=v.split('｜').map(function(x){return x.trim();});
              if(bm.length>=3){
                var vv=bm[2]==='——'?null:(parseFloat(bm[2])||0);
                var ee=bm[1].replace(/^表达式\s*/,'');
                cur.bands.push({d:bm[0],e:ee==='—'?'':ee,v:vv});
              }
            }
          }
        });
        if(rows.length&&parts.length){
          KB.score.parts=parts; KB.score.rows=rows;
          applied.push('03 评分（'+parts.length+' Part / '+rows.length+' 项）');
        }else errs.push(j.name+'：评分规则解析不完整，未回写');
      }
      if(j.vol==='04'){
        /* 宽容解析：优先认标准卷头，认不出时去掉卷标记与首个标题行整段入库（外部编辑过也能回写） */
        var g4=t.match(/# 外包项目运营诊断知识库 · 04 写作要求与技巧\n>[^\n]*\n\n([\s\S]*)$/)
             || t.match(/# 项目走访报告写作要求与技巧\n>[^\n]*\n\n([\s\S]*)$/);
        if(g4){ KB.guide=g4[1].trim(); applied.push('04 写作要求'); }
        else{
          var g4b=String(t).replace(/<!--KBVOL:04-->/,'').replace(/^[\s\S]*?#[^\n]*\n(>[^\n]*\n)?\n?/,'');
          if(g4b.trim().length>50){ KB.guide=g4b.trim(); applied.push('04 写作要求（宽容解析）'); }
          else errs.push(j.name+'：04 写作要求内容过短，未回写');
        }
      }
      if(j.vol==='06'){
        var cv={states:[],asks:{}};
        var rm=t.match(/-\s*规则[:：]?([\s\S]*?)(?:\n\n|$)/);
        var gr=t.match(/## 判定规则\n([\s\S]*?)\n\n/); if(gr) cv.rule=gr[1].replace(/^-\s*/gm,'').trim();
        var sst=t.match(/## 状态定义[\s\S]*?\n\|---\|[\s\S]*?\n([\s\S]*?)(?:\n\n|$)/);
        if(sst){
          sst[1].trim().split('\n').forEach(function(r){
            var c=r.split('|').map(function(x){return x.trim();}).filter(Boolean);
            if(c.length>=5) cv.states.push({code:c[0],name:c[1],lv:(c[2]==='—'?null:parseInt(c[2],10)),must:(c[3]==='是'),note:c[4]});
          });
        }
        ['MISS','DESC','MEC','FULL','NA'].forEach(function(k){
          var mm=t.match(new RegExp('-\\s*'+k+'：([^\\n]*)'));
          if(mm) cv.asks[k]=mm[1].trim();
        });
        var sm=t.match(/-\s*(「[^」]*」[^\n]*)/); if(sm) cv.scoreAsk=sm[1].trim();
        var eeSec=t.match(/## 八要素核对表[\s\S]*?\n\|---\|[\s\S]*?\n([\s\S]*?)(?:\n\n|$)/);
        if(eeSec){
          var ee=[];
          eeSec[1].trim().split('\n').forEach(function(r){
            var c=r.split('|').map(function(x){return x.trim();}).filter(Boolean);
            if(c.length>=2&&/^E-/.test(c[0])) ee.push({code:c[0],name:c[1],ask:c[2]||''});
          });
          if(ee.length){ KB.rules=KB.rules||{}; KB.rules.eightElements=ee; applied.push('06 八要素（'+ee.length+'）'); }
        }
        if(cv.states.length){ KB.cover=cv; applied.push('06 覆盖度判定（'+cv.states.length+' 状态）'); }
        else errs.push(j.name+'：覆盖度判定解析不完整，未回写');
      }
      if(j.vol==='09'){
        var RU=deep(KB.rules||{});
        function secOf(a,b){ var i=t.indexOf(a); if(i<0) return ''; var k=b?t.indexOf(b,i+1):-1; return t.slice(i,k<0?t.length:k); }
        function rowsOf(sec){
          var out=[];
          sec.split('\n').forEach(function(l){
            if(l.indexOf('|')!==0) return;
            var c=l.split('|').slice(1,-1).map(function(x){return x.trim();});
            if(c.length<2) return;
            if(/^[-: ]+$/.test(c[0])) return;
            if(['维度码','红灯码','方法码','命中情形','结论'].indexOf(c[0])>=0) return;
            out.push(c);
          });
          return out;
        }
        var lst=function(s){ return String(s||'').split(/[\s、,，]+/).map(function(x){return x.trim();}).filter(Boolean); };
        var fv=rowsOf(secOf('## 五维评分卡','## 红灯清单'));
        if(fv.length) RU.fiveDims=fv.map(function(c){ return {code:c[0],name:c[1],anchors:[c[2]||'',c[3]||'',c[4]||'',c[5]||''],signals:lst(c[6])}; });
        var rfw=rowsOf(secOf('## 红灯清单','## 结论判定规则'));
        if(rfw.length) RU.redFlags=rfw.map(function(c){ return {code:c[0],name:c[1],signals:lst(c[2])}; });
        var mh=rowsOf(secOf('## 亮点 → 固化','## 不足 → 改善'));
        var mbw=rowsOf(secOf('## 不足 → 改善','## 方法匹配优先序'));
        RU.methods=RU.methods||{hl:[],pb:[]};
        if(mh.length) RU.methods.hl=mh.map(function(c){ return {code:c[0],name:c[1],when:c[2]||'',acts:lst(c[3]),kpi:c[4]||''}; });
        if(mbw.length) RU.methods.pb=mbw.map(function(c){ return {code:c[0],name:c[1],when:c[2]||'',acts:lst(c[3]),kpi:c[4]||''}; });
        var po=rowsOf(secOf('## 方法匹配优先序','## 措施触发链'));
        if(po.length) RU.pickOrder=po.map(function(c){ return {when:c[0],go:(/强制转人工/.test(c[1]||'')?[]:lst(c[1])),human:/强制转人工/.test(c[1]||'')}; });
        if(fv.length||rfw.length){ KB.rules=RU; applied.push('09 判定标准A（五维 '+(RU.fiveDims||[]).length+' / 红灯 '+(RU.redFlags||[]).length+' / 方法 '+(RU.methods.hl.length+RU.methods.pb.length)+'）'); }
        else errs.push(j.name+'：判定标准A 解析不完整，未回写');
      }
      if(j.vol==='07'){
        var acts=[],cur=null;
        t.split('\n').forEach(function(line){
          var mh=line.match(/^###\s+(ACT-[A-Za-z0-9\-]+)\s*(.*)$/);
          if(mh){ cur={id:mh[1],act:{n:mh[2].trim(),f:'',grp:'',cy:'',df:'',pre:[],tr:'',st:'',kf:'',ac:'',na:''}}; acts.push(cur); return; }
          if(!cur) return;
          var mm=line.match(/^-\s*(措施族|分组|周期|难度|前置|触发条件|实施步骤|关键|验收|不适用)：(.*)$/);
          if(!mm) return;
          var k=mm[1], v=mm[2].trim();
          if(k==='措施族') cur.act.f=v;
          else if(k==='分组') cur.act.grp=(v==='—'?'':v);
          else if(k==='周期') cur.act.cy=(v==='—'?'':v);
          else if(k==='难度') cur.act.df=(v==='—'?'':v);
          else if(k==='前置') cur.act.pre=(v==='—'?[]:splitV(v));
          else if(k==='触发条件') cur.act.tr=(v==='—'?'':v);
          else if(k==='实施步骤') cur.act.st=(v==='—'?'':v);
          else if(k==='关键') cur.act.kf=(v==='—'?'':v);
          else if(k==='验收') cur.act.ac=(v==='—'?'':v);
          else if(k==='不适用') cur.act.na=(v==='—'?'':v);
        });
        if(acts.length>=20){ KB.acts=acts; applied.push('07 措施卡×'+acts.length); }
        else errs.push(j.name+'：措施卡解析不完整（'+acts.length+' 张），未回写');
      }
      if(j.vol==='08'){
        var kp={},ck=null;
        t.split('\n').forEach(function(line){
          var mh=line.match(/^###\s+(KP-[A-Za-z0-9\-]+)\s*(.*)$/);
          if(mh){ ck=mh[1]; kp[ck]={t:mh[2].trim(),ind:'',d1:'',d2:'',dom:'',scene:'',root:'',acts:[],kw:[]}; return; }
          if(!ck) return;
          var mm=line.match(/^-\s*(行业|一级维度|二级维度|域|问题场景|根因|措施组合|关键词)：(.*)$/);
          if(!mm) return;
          var k=mm[1], v=mm[2].trim();
          if(k==='行业') kp[ck].ind=v;
          else if(k==='一级维度') kp[ck].d1=v;
          else if(k==='二级维度') kp[ck].d2=v;
          else if(k==='域') kp[ck].dom=v;
          else if(k==='问题场景') kp[ck].scene=(v==='—'?'':v);
          else if(k==='根因') kp[ck].root=(v==='—'?'':v);
          else if(k==='措施组合') kp[ck].acts=(v==='—'?[]:splitV(v));
          else if(k==='关键词') kp[ck].kw=(v==='—'?[]:splitV(v));
        });
        var nk=Object.keys(kp).length;
        if(nk>=10){ KB.kp=kp; applied.push('08 知识包×'+nk); }
        else errs.push(j.name+'：知识包解析不完整（'+nk+' 条），未回写');
      }
      if(j.vol==='05'){
        var lg=[];
        var tb5=t.match(/\|---\|[\s\S]*?\n([\s\S]*)$/);
        if(tb5){ tb5[1].trim().split('\n').forEach(function(r){
          var c=r.split('|').map(function(x){return x.trim();}).filter(Boolean);
          if(c.length>=3) lg.push({v:c[0],d:c[1],m:c[2]});
        }); }
        if(lg.length){ KB.log=lg; applied.push('05 日志×'+lg.length); }
      }
      if(j.vol==='11'){
        var EV=deep(KB.evals||[]);
        var blks=t.split(/(?=##\s+EV-)/);
        var n11=0;
        blks.forEach(function(blk){
          var hm=blk.match(/^##\s+(EV-[A-Z]+)\s+([^\n]*)/); if(!hm) return;
          var tgt=null; EV.forEach(function(e){ if(e.id===hm[1]) tgt=e; });
          if(!tgt) return;
          var kv={}; blk.split('\n').forEach(function(l){
            var mm=l.match(/^-\s*(.+?)[:：]([\s\S]*)$/); if(mm) kv[mm[1].trim()]=mm[2].trim();
          });
          if(kv['依据评分项']) tgt.scoreItems=String(kv['依据评分项']).split(/[、,，]/).map(function(x){return x.trim();}).filter(Boolean);
          if(kv['关联子项']) tgt.dims=String(kv['关联子项']).split(/[、,，]/).map(function(x){return x.trim();}).filter(Boolean);
          if(kv['判定口径']) tgt.basis=kv['判定口径'];
          if(kv['备注']) tgt.note=kv['备注'];
          var lt=blk.match(/\|---\|[\s\S]*?\n([\s\S]*?)(?:\n\n|$)/);
          if(lt){
            var lv=[];
            lt[1].trim().split('\n').forEach(function(r){
              var c=r.split('|').map(function(x){return x.trim();}).filter(Boolean);
              if(c.length>=2) lv.push({lv:c[0],cond:c[1]});
            });
            if(lv.length) tgt.levels=lv;
          }
          n11++;
        });
        if(n11){ KB.evals=EV; applied.push('11 独立评价项×'+n11); }
        else errs.push(j.name+'：独立评价项解析不完整，未回写');
      }
    }catch(e){ errs.push(j.name+'：'+e.message); }
  });
  if(applied.length){
    buildIndex(); renderKpi(); KBDirty=true; bumpVer();
    KB.log=KB.log||[]; KB.log.unshift({v:KB.meta.ver,d:KB.meta.updated,m:'MD 导入回写：'+applied.join('；')});
    applyLayout();
  }
  done(applied,errs,jobs);
}

/* ---------------- 输入覆盖度检查（主人 2026-10-19 定）----------------
   按知识库四维子项 + 判定规则（KB.cover）逐条核对输入是否覆盖：
   未提及 / 有描述无机制 → 必须补充；有机制无记录 → 建议补充；已覆盖 → 无需补；
   确认与本项目无关的，可显式标「无 / 不相关」，不计入缺口。 */
var COVERV={}, COVERX={}, CV=null, LAST={D:null,S:null}, CVSHOWALL=false;
function coverDef(){ return (KB.cover)||{}; }
function stateName(code){
  var s=(coverDef().states||[]).filter(function(x){return x.code===code;})[0];
  return s?s.name:code;
}
function stateNote(code){
  var s=(coverDef().states||[]).filter(function(x){return x.code===code;})[0];
  return s?(s.note||''):'';
}
function autoState(m){
  if(!m||!m.hits) return 'MISS';
  return m.lv===3?'FULL':(m.lv===2?'MEC':'DESC');
}
function askOf(it,st){
  var A=coverDef().asks||{};
  var tpl=A[st]; if(!tpl) return '';
  return tpl.replace('{子项}',it.name||'')
            .replace('{要点}',(it.reviews||[]).join('、'))
            .replace('{信号}',(it.signals||[]).join('、'));
}
function buildCover(D,S){
  var rows=[];
  (KB.aspects||[]).forEach(function(a){
    (a.items||[]).forEach(function(it){
      var m=(D&&D.map)?(D.map[it.code]||{hits:0,sents:[],lv:0}):{hits:0,sents:[],lv:0};
      var auto=autoState(m);
      var st=COVERV[it.code]||auto;
      rows.push({code:it.code,name:it.name,aspect:a.code,aspectName:a.name,
        auto:auto,st:st,hits:m.hits||0,lv:m.lv||0,sents:(m.sents||[]).slice(0,2),
        ask:askOf(it,st)||askOf(it,auto)||''});
    });
  });
  var srows=[];
  if(S&&S.rows) S.rows.forEach(function(o){
    if(o.state==='OK'||o.state==='NA') return;
    if(o.row.part==='P4') return; /* 加分项非必填数值，不进缺数清单 */
    var tpl=coverDef().scoreAsk||'「{name}」未提供数值，请补充实际值（目标口径：{target}）';
    srows.push({id:o.row.id,name:o.row.name,part:o.row.part,max:o.row.max,target:o.row.target||'—',l1:o.row.l1||'',
      ask:String(tpl).replace('{name}',o.row.name||'').replace('{target}',o.row.target||'—')});
  });
  return {rows:rows,score:srows,stat:coverStat(rows,srows)};
}
function coverStat(rows,srows){
  var tot=rows.length,full=0,na=0,miss=0,desc=0,mec=0;
  rows.forEach(function(r){
    if(r.st==='NA') na++;
    else if(r.st==='FULL') full++;
    else if(r.st==='MISS') miss++;
    else if(r.st==='DESC') desc++;
    else mec++;
  });
  var must=rows.filter(function(r){return r.st==='MISS'||r.st==='DESC';}).length;
  var gap=rows.filter(function(r){return r.st!=='FULL'&&r.st!=='NA';}).length;
  return {tot:tot,full:full,na:na,miss:miss,desc:desc,mec:mec,gap:gap,must:must,
    score:(srows||[]).length, rate:tot?Math.round((full+na)/tot*100):0};
}
function saveCoverV(){ try{ localStorage.setItem('opsdiag.coverv',JSON.stringify(COVERV)); }catch(e){} }
function loadCoverV(){ try{ COVERV=JSON.parse(localStorage.getItem('opsdiag.coverv')||'{}')||{}; }catch(e){ COVERV={}; } }
/* 补充信息暂存：code/SC-id -> 使用者直接输入的文字，可一键并入输入框重跑诊断 */
function saveCoverX(){ try{ localStorage.setItem('opsdiag.coverx',JSON.stringify(COVERX)); }catch(e){} }
function loadCoverX(){ try{ COVERX=JSON.parse(localStorage.getItem('opsdiag.coverx')||'{}')||{}; }catch(e){ COVERX={}; } }
function supLabel(k){
  if(String(k).indexOf('SC-')===0){
    var r=(KB.score.rows||[]).filter(function(x){return x.id===k;})[0];
    if(!r) return k;
    var an=aspectNameOf(r.aspect);
    return k+' '+(r.name||r.l1||'')+(an?'（'+an+'）':'');
  }
  var it=null;
  (KB.aspects||[]).forEach(function(a){ (a.items||[]).forEach(function(x){ if(x.code===k) it=x; }); });
  return it?(k+' '+(it.name||'')):k;
}
function aspectNameOf(code){
  var a=(KB.aspects||[]).filter(function(x){return x.code===code;})[0];
  return a?(a.name||a.slogan||''):'';
}
function mergeSupplements(){
  var add=[],done=[];
  Object.keys(COVERX).forEach(function(k){
    var v=String(COVERX[k]||'').trim(); if(!v) return;
    if(String(k).indexOf('SC-')===0){
      /* 评分项补充：解析数值直接灌入人工速填通道，评分表立即可读 */
      var m=v.match(/实际[^\d]{0,4}([\d.]+)/)||v.match(/([\d.]+)\s*%/)||v.match(/[-+]?\d+(?:\.\d+)?/);
      if(m){
        var num=parseFloat(String(m[0]).replace(/[^0-9.\-]/g,''));
        if(!isNaN(num)){
          KPIV[k]=KPIV[k]||{};
          KPIV[k].v=String(num); KPIV[k].manual=true; KPIV[k].na=false; KPIV[k]._txt=null;
        }
      }
    }
    add.push('【'+supLabel(k)+'】'+v); done.push(k);
  });
  if(!add.length){ toast('请先在待补充项下方输入补充信息'); return; }
  var ta=$('tx2');
  ta.value=(ta.value&&ta.value.trim()?ta.value.replace(/\s+$/,'')+'\n':'')+add.join('\n');
  done.forEach(function(k){ delete COVERX[k]; delete COVERV[k]; }); /* 补充后交回自动判定 */
  saveCoverX(); saveCoverV();
  if(typeof renderKpi==='function') renderKpi();
  toast('已并入 '+done.length+' 条补充信息，正在重新诊断…');
  run();
}
function recomputeCover(){
  CV=buildCover(LAST.D,LAST.S);
  if(R){ R.cover=CV; renderReport(); }
  renderCover();
}
function askList(){
  if(!CV) return '';
  var L=['【待补充清单】共 '+CV.stat.gap+' 个子项未覆盖、'+CV.stat.score+' 个评分项缺数值（必须补 '+CV.stat.must+' 项）：'];
  CV.rows.filter(function(r){return r.st!=='FULL'&&r.st!=='NA';}).forEach(function(r,i){
    L.push((i+1)+'. '+r.code+' '+r.name+'（'+stateName(r.st)+'）：'+r.ask);
  });
  if(CV.score.length){
    L.push('');L.push('【评分项缺数值】');
    CV.score.forEach(function(s,i){
      L.push((i+1)+'. ['+s.id+']'+(s.l1?'（'+s.l1+'）':'')+s.ask);
    });
  }
  return L.join('\n');
}
function renderCover(){
  var box=$('coverBox'); if(!box) return;
  if(!CV){
    /* 介绍文字由「页面备注」hintCover 提供（渲染在 bCover 区块顶部），这里只放按钮 */
    box.innerHTML='<div style="margin-top:8px"><button class="btn teal sm" id="btnCoverOnly" type="button">仅检查覆盖度</button></div>';
    $('btnCoverOnly').addEventListener('click',runCoverOnly);
    return;
  }
  var st=CV.stat;
  var h='<div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11.5px;align-items:center">'
   +'<b style="font-size:13px">覆盖度 '+st.rate+'%</b>'
   +'<span class="tag g">已覆盖 '+st.full+'</span>'
   +'<span class="tag r">未提及 '+st.miss+'</span>'
   +'<span class="tag p">有描述无机制 '+st.desc+'</span>'
   +'<span class="tag b">有机制无记录 '+st.mec+'</span>'
   +'<span class="tag">无/不相关 '+st.na+'</span>'
   +'<span class="tag">评分缺数 '+st.score+'</span>'
   +'<label style="margin-left:auto;display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--muted)">'
   +'<input type="checkbox" id="cvShowAll" '+(CVSHOWALL?'checked':'')+' />显示全部 '+CV.rows.length+' 项</label>'
   +'</div>'
   +'<div style="height:6px;border-radius:99px;background:rgba(255,255,255,.09);margin:8px 0 10px;overflow:hidden">'
   +'<div style="height:100%;width:'+st.rate+'%;background:linear-gradient(90deg,#4fd0b8,#e8c584)"></div></div>';
  var list=CV.rows.filter(function(r){return r.st!=='FULL'&&r.st!=='NA';});
  if(CVSHOWALL) list=CV.rows.slice(); /* 主人 2026-10-26 定：可展开查看全部子项（含已覆盖） */
  h+='<div style="font-size:12px;font-weight:600;margin-bottom:6px">待补充 '+(list.length+st.score)+' 项'
   +(st.must?'（其中 <span style="color:#ff8fa3">'+st.must+' 项必须补</span>）':'')+'</div>';
  if(!list.length&&!st.score) h+='<div style="font-size:12px;color:#7fe0c8">✅ 输入已覆盖全部子项，无需补充。</div>';
  list.forEach(function(r){
    h+='<div style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:7px">'
     +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
     +'<span class="tag'+(r.st==='MISS'?' r':(r.st==='DESC'?' p':' b'))+'">'+esc(stateName(r.st))+'</span>'
     +'<b style="font-size:12.5px">'+esc(r.code+' '+r.name)+'</b>'
     +'<span style="font-size:11px;color:var(--muted)">'+esc(r.aspectName)+'</span>'
     +'<select data-cv="'+esc(r.code)+'" style="margin-left:auto;max-width:140px;font-size:12px">'
       +['MISS','DESC','MEC','FULL','NA'].map(function(s){
         return '<option value="'+s+'"'+(r.st===s?' selected':'')+'>'+esc(stateName(s))+'</option>'; }).join('')
     +'</select></div>'
     +'<div style="font-size:11.5px;color:#9fb0c2;margin-top:5px;line-height:1.6">'
     +((function(){
        /* 主人 2026-10-27 定：追问建议标注出处——AI 补检后显示大模型版（原知识库追问保留在提示文字中） */
        var aiA=(window.__llm&&window.__llm.aiGapFor)?window.__llm.aiGapFor(r.code):null;
        if(aiA&&aiA.ask) return '<span class="cvTag ai">大模型</span>'+esc(aiA.ask)
          +(r.ask?'<span style="color:#6f829a">（知识库原追问：'+esc(r.ask)+'）</span>':'');
        return '<span class="cvTag kb">知识库</span>'+esc(r.ask||'—');
      })())
     +'</div>'
     +'<input data-cvx="'+esc(r.code)+'" value="'+esc(COVERX[r.code]||'')+'" placeholder="直接输入补充信息（事实 / 数据 / 机制），点「补充信息并入重跑」生效"'
       +' style="width:100%;box-sizing:border-box;margin-top:6px;font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--text);outline:none"/>'
     +(r.hits?'<div style="font-size:11px;color:var(--muted);margin-top:3px">已命中 '+r.hits+' 句：'+esc((r.sents[0]||'').slice(0,40))+'</div>':'')
     +'</div>';
  });
  if(CV.score.length){
    h+='<div style="font-size:12px;font-weight:600;margin:10px 0 6px">评分项缺数值 '+CV.score.length+' 项</div>';
    CV.score.forEach(function(s){
      var an=(s.l1&&s.l1!==s.name)?'（'+s.l1+'）':'';
      h+='<div style="font-size:11.5px;color:#9fb0c2;line-height:1.6;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.08)">'
       +esc(s.id+' '+(s.name||'')+an)+'：'+esc(s.ask)+'</div>'
       +'<div style="display:flex;gap:6px;align-items:center;margin:5px 0 8px">'
       +'<input data-cvx="'+esc(s.id)+'" value="'+esc(COVERX[s.id]||'')+'" placeholder="直接输入实际值（如：实际 98%，10 月达成）"'
       +' style="flex:1;min-width:0;font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--text);outline:none"/>'
       +'<select data-kna="'+esc(s.id)+'" style="max-width:118px;font-size:11.5px">'
       +'<option value="">标注…</option><option value="NA">无 / 不适用</option><option value="CLR">清除标注</option></select>'
       +'</div>';
    });
  }
  h+='<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
   +'<button class="btn teal sm" id="btnMergeSup" type="button">补充信息并入重跑</button>'
   +'<button class="btn teal sm" id="btnCopyAsk" type="button">复制追问清单</button>'
   +'<button class="btn ghost sm" id="btnNaMiss" type="button">未提及项标为「无/不相关」</button>'
   +'<button class="btn ghost sm" id="btnCoverReset" type="button">重置标注</button></div>';
  box.innerHTML=h;
  var sa=box.querySelector('#cvShowAll');
  if(sa) sa.addEventListener('change',function(){ CVSHOWALL=this.checked; renderCover(); });
  Array.prototype.forEach.call(box.querySelectorAll('[data-cv]'),function(el){
    el.addEventListener('change',function(){
      COVERV[this.getAttribute('data-cv')]=this.value; saveCoverV(); recomputeCover();
    });
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-cvx]'),function(el){
    el.addEventListener('change',function(){
      var k=this.getAttribute('data-cvx'), v=String(this.value||'').trim();
      if(v) COVERX[k]=v; else delete COVERX[k];
      saveCoverX();
    });
    el.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); this.blur(); } });
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-kna]'),function(el){
    el.addEventListener('change',function(){
      var id=this.getAttribute('data-kna'), v=this.value;
      this.value='';
      if(v==='NA'){ KPIV[id]={na:true,v:'',manual:false}; toast(id+' 已标「无/不适用」，计入 K 折算'); }
      else if(v==='CLR'){ delete KPIV[id]; toast(id+' 标注已清除，恢复自动判定'); }
      else return;
      if(typeof renderKpi==='function') renderKpi();
      run();
    });
  });
  $('btnMergeSup').addEventListener('click',mergeSupplements);
  $('btnCopyAsk').addEventListener('click',function(){
    var s=askList();
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(s); toast('追问清单已复制'); }
      else{ var ta=document.createElement('textarea'); ta.value=s; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove(); toast('追问清单已复制'); }
    }catch(e){ toast('复制失败，请手动选择'); }
  });
  $('btnNaMiss').addEventListener('click',function(){
    var n=0;
    (CV.rows||[]).forEach(function(r){ if(r.st==='MISS'){ COVERV[r.code]='NA'; n++; } });
    if(!n){ toast('没有未提及项'); return; }
    saveCoverV(); recomputeCover(); toast('已将 '+n+' 项未提及标为「无/不相关」');
  });
  $('btnCoverReset').addEventListener('click',function(){
    COVERV={}; saveCoverV(); recomputeCover(); toast('标注已重置为自动判定结果');
  });
}
function runCoverOnly(){
  var t=($('tx').value||'')+'\n'+($('tx2').value||'');
  if(!t.trim()){ toast('请先输入走访口述或补充信息'); return; }
  LAST.D=analyzeDims(t);
  CV=buildCover(LAST.D,LAST.S);
  if(R) R.cover=CV;
  renderCover();
  pLog('COVER','覆盖度 '+CV.stat.rate+'%：已覆盖 '+CV.stat.full+' / 待补充 '+CV.stat.gap+'（必须补 '+CV.stat.must+'）/ 不适用 '+CV.stat.na, CV.stat.must?'warn':'ok');
}

/* ---------------- 页面备注文字（主人 2026-10-26 定：备注全部后台可增改） ----------------
   KB.hints.items = [{id, slot, text}]。区块类 slot 渲染为该区块顶部的 .hint 段落；
   特殊槽位：tx/tx2 占位语、holdTip 按住说话提示、coverTag 标题小字、bKpi 折叠标题。 */
var HINT_SLOTS={
  bRun:'生成按钮区',bOral:'走访口述区',bSupp:'补充信息区',bCover:'覆盖度检查区',
  tx:'口述框占位语',tx2:'补充框占位语',holdTip:'按住说话提示',coverTag:'覆盖度标题小字',bKpi:'指标速填标题'
};
function applyHints(){
  var items=(KB.hints&&KB.hints.items)||[];
  /* 区块顶部备注容器 */
  Object.keys(HINT_SLOTS).forEach(function(b){
    if(!/^b[A-Z]/.test(b)) return;
    var blk=$(b); if(!blk) return;
    var c=blk.querySelector('.adm-hints');
    if(!c){
      c=document.createElement('div'); c.className='adm-hints'; c.setAttribute('data-slot',b);
      var h2=blk.querySelector('h2');
      if(h2&&h2.parentNode===blk) blk.insertBefore(c,h2.nextSibling); else blk.insertBefore(c,blk.firstChild);
    }
    c.setAttribute('data-slot',b);
  });
  Object.keys(HINT_SLOTS).forEach(function(b){
    if(!/^b[A-Z]/.test(b)) return;
    var c=document.querySelector('.adm-hints[data-slot="'+b+'"]')||(function(){ var blk=$(b); if(!blk) return null; var x=blk.querySelector('.adm-hints'); if(x) x.setAttribute('data-slot',b); return x; })();
    if(c) c.innerHTML='';
  });
  items.forEach(function(it){
    if(!it||!it.slot) return;
    var txt=String(it.text||'');
    if(/^b[A-Z]/.test(it.slot)){
      var c=document.querySelector('.adm-hints[data-slot="'+it.slot+'"]');
      if(c&&txt.trim()){ var d=document.createElement('div'); d.className='hint'; d.textContent=txt; c.appendChild(d); }
      return;
    }
    if(it.slot==='tx'||it.slot==='tx2'){ var e=$(it.slot); if(e) e.placeholder=txt; return; }
    if(it.slot==='holdTip'){ HOLDTIP=txt||'按住说话，松开结束。'; var h=$('holdTip'); if(h&&!recOn) h.textContent=HOLDTIP; return; }
    if(it.slot==='coverTag'){ var s=$('coverTag'); if(s) s.textContent=txt; return; }
    if(it.slot==='bKpi'){ var f=$('kpiFold'); if(f){ var sm=f.querySelector('summary'); if(sm) sm.textContent=txt; } return; }
  });
}
function hintSave(msg){
  bumpVer(); KB.log=KB.log||[]; KB.log.unshift({v:KB.meta.ver,d:KB.meta.updated,m:msg||'页面备注更新'});
  saveKB(true); applyHints(); adminRender();
  toast('备注已保存并生效 · v'+KB.meta.ver);
}

/* ---------------- 管理员后台 ---------------- */
var adminTab='meta';
function adminRender(){
  var b=$('mbody');
  var tabs=[['meta','概览与总控'],['mds','MD 文件库'],['hints','页面备注'],['dims','四维子项'],['score','评分项'],['tags','整改标签'],['prio','优先级'],['rules','判定标准A'],['evals','独立评价项'],['layout','页面布局'],['guide','写作要求'],['json','原始 JSON'],['log','变更日志']];
  var h='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'
    +tabs.map(function(t){return '<button class="btn sm'+(adminTab===t[0]?' teal':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('')
    +'</div><div id="mtab"></div>';
  b.innerHTML=h;
  Array.prototype.forEach.call(b.querySelectorAll('[data-tab]'),function(el){
    el.addEventListener('click',function(){ adminTab=this.getAttribute('data-tab'); adminRender(); });
  });
  var t=$('mtab');
  if(adminTab==='meta') return tabMeta(t);
  if(adminTab==='dims') return tabDims(t);
  if(adminTab==='score') return tabScore(t);
  if(adminTab==='tags') return tabTags(t);
  if(adminTab==='prio') return tabPrio(t);
  if(adminTab==='rules') return tabRules(t);
  if(adminTab==='evals') return tabEvals(t);
  if(adminTab==='mds') return tabMds(t);
  if(adminTab==='hints') return tabHints(t);
  if(adminTab==='layout') return tabLayout(t);
  if(adminTab==='guide') return tabGuide(t);
  if(adminTab==='json') return tabJson(t);
  if(adminTab==='log') return tabLog(t);
}
/* --- 判定标准A：五维评分卡 / 红灯 / 结论阈值 / 方法族 --- */
function tabRules(t){
  var R=KB.rules||{};
  var five=(R.fiveDims||[]).map(function(d){
    return '<tr><td class="id">'+esc(d.code)+'</td><td><b>'+esc(d.name)+'</b></td>'
      +'<td style="font-size:11.5px">'+esc((d.anchors||[]).join(' ／ '))+'</td>'
      +'<td style="font-size:11px;color:#111">'+esc((d.signals||[]).join('、'))+'</td></tr>';
  }).join('');
  var rf=(R.redFlags||[]).map(function(f){
    return '<tr><td class="id">'+esc(f.code)+'</td><td><b>'+esc(f.name)+'</b></td><td style="font-size:11.5px">'+esc((f.signals||[]).join('、'))+'</td></tr>';
  }).join('');
  var mb=(R.methods&&R.methods.pb)||[], mh=(R.methods&&R.methods.hl)||[];
  var mrow=function(m,kind){
    return '<tr><td class="id">'+esc(m.code)+'</td><td><b>'+esc(m.name)+'</b><div style="font-size:10.5px;color:#8b96a3;margin-top:2px">'+esc(kind)+'</div></td>'
      +'<td style="font-size:11.5px">'+esc(m.when||'')+'</td>'
      +'<td style="font-size:11px;color:#111">'+esc((m.acts||[]).join('、'))+'</td>'
      +'<td style="font-size:11px">'+esc(m.kpi||'')+'</td></tr>';
  };
  var h='<div class="actcard"><div class="t">判定标准A · 好坏判定与措施匹配</div>'
   +'<div class="d">来源：<code>'+esc((R.src||[]).join(' / '))+'</code>。这张表就是「一个事项是好还是坏」的标尺，也是措施卡的触发依据：'
   +'<b>五维打分 → 红灯扫描 → 结论阈值 → 方法族 → 措施卡</b>。改这里会直接改变整改表的措施选择。</div></div>';

  h+='<div class="actcard" style="margin-top:10px"><div class="t">五维评分卡（各 0–3 分，满分 15）</div>'
   +'<table><thead><tr><th style="width:8%">码</th><th style="width:12%">维度</th><th style="width:46%">0 / 1 / 2 / 3 档位</th><th style="width:34%">证据信号词</th></tr></thead><tbody>'+five+'</tbody></table></div>';

  h+='<div class="actcard" style="margin-top:10px"><div class="t">红灯清单（命中即一票否决，直接提为 P0）</div>'
   +'<table><thead><tr><th style="width:10%">码</th><th style="width:34%">红灯项</th><th>证据信号词</th></tr></thead><tbody>'+rf+'</tbody></table>'
   +'<div class="d" style="margin-top:8px">结论阈值：<b>亮点</b> '+esc((R.verdict&&R.verdict.highlight&&R.verdict.highlight.txt)||'')+'；'
   +'<b>不足</b> '+esc((R.verdict&&R.verdict.problem&&R.verdict.problem.txt)||'')+'；'
   +'<b>待确认</b> '+esc((R.verdict&&R.verdict.pending&&R.verdict.pending.txt)||'')+'。</div></div>';

  h+='<div class="actcard" style="margin-top:10px"><div class="t">亮点 → 固化 / 复制方法（5 类）</div>'
   +'<table><thead><tr><th style="width:11%">码</th><th style="width:15%">方法</th><th style="width:30%">适用判定特征</th><th style="width:26%">默认措施</th><th style="width:18%">验收指标</th></tr></thead><tbody>'
   +mh.map(function(m){return mrow(m,'正向放大');}).join('')+'</tbody></table></div>';

  h+='<div class="actcard" style="margin-top:10px"><div class="t">不足 → 改善 / 根因方法（15 类 · 措施卡的触发入口）</div>'
   +'<table><thead><tr><th style="width:11%">码</th><th style="width:15%">方法</th><th style="width:30%">触发信号</th><th style="width:26%">默认措施</th><th style="width:18%">验收指标</th></tr></thead><tbody>'
   +mb.map(function(m){return mrow(m,'反向收敛');}).join('')+'</tbody></table></div>';

  h+='<div class="actcard" style="margin-top:10px"><div class="t">方法匹配优先序（判定标准A §5.3）</div>'
   +'<table><thead><tr><th style="width:34%">命中情形</th><th>优先方法</th></tr></thead><tbody>'
   +(R.pickOrder||[]).map(function(o){return '<tr><td>'+esc(o.when)+'</td><td><b>'+esc((o.go||[]).join(' + ')||'强制转人工，只出「待确认」')+'</b></td></tr>';}).join('')
   +'</tbody></table></div>';

  h+='<div class="actcard" style="margin-top:10px"><div class="t">高级编辑（JSON，改完点保存）</div>'
   +'<div class="d" style="margin-bottom:8px">非必要不建议手改。保存后版本号自增，并对之后生成的报告立即生效。</div>'
   +'<textarea id="rulesTa" rows="16" style="width:100%;font-size:11.5px;line-height:1.6;font-family:ui-monospace,Consolas,monospace">'+esc(JSON.stringify(R,null,1))+'</textarea>'
   +'<div style="margin-top:10px"><button class="btn teal sm" id="btnRulesSave" type="button">保存判定标准</button></div></div>';
  t.innerHTML=h;
  $('btnRulesSave').addEventListener('click',function(){
    try{
      var o=JSON.parse($('rulesTa').value);
      if(!o.fiveDims||!o.redFlags){ toast('缺少 fiveDims / redFlags 节点'); return; }
      KB.rules=o; KBDirty=true; bumpVer(); adminRender(); toast('判定标准已更新（v'+KB.meta.ver+'）');
    }catch(e){ toast('JSON 解析失败：'+e.message); }
  });
}
/* --- 独立评价项：客户满意度 / 员工满意度 --- */
function tabEvals(t){
  var evs=KB.evals||[];
  var h='<div class="actcard"><div class="t">独立评价项 · 客户满意度 / 员工满意度</div>'
   +'<div class="d">两项评价<b>独立于四大审查维度</b>，判定时同时看「四维相关子项命中情况 + 使用者输入 + Part.3 评分」，结果作为报告「模块二」输出；'
   +'只出等级与建议，<b>不重复计分</b>。</div></div>';
  evs.forEach(function(ev,i){
    h+='<div class="actcard" style="margin-top:10px"><div class="t">'+esc(ev.name)+'（'+esc(ev.id)+'）</div>'
     +'<div class="d" style="margin-bottom:8px">判定依据：'+esc(ev.basis||'')+'</div>'
     +'<div style="font-size:12px;margin-bottom:6px">关联评分项：<code>'+esc((ev.scoreItems||[]).join('、')||'—')+'</code>　关联子项：<code>'+esc((ev.dims||[]).join('、')||'—')+'</code></div>'
     +'<table><thead><tr><th style="width:14%">等级</th><th>判定条件</th></tr></thead><tbody>'
     +(ev.levels||[]).map(function(l){return '<tr><td><b>'+esc(l.lv)+'</b></td><td style="font-size:11.5px">'+esc(l.cond)+'</td></tr>';}).join('')
     +'</tbody></table>'
     +'<div style="font-size:11.5px;color:#111;margin-top:6px">'+esc(ev.note||'')+'</div>'
     +'<textarea id="evTa'+i+'" rows="8" style="width:100%;margin-top:8px;font-size:11.5px;font-family:ui-monospace,Consolas,monospace">'+esc(JSON.stringify(ev,null,1))+'</textarea>'
     +'<div style="margin-top:8px"><button class="btn teal sm" data-evsave="'+i+'" type="button">保存本项</button></div></div>';
  });
  t.innerHTML=h;
  Array.prototype.forEach.call(t.querySelectorAll('[data-evsave]'),function(b){
    b.addEventListener('click',function(){
      var i=parseInt(this.getAttribute('data-evsave'),10);
      try{
        var o=JSON.parse($('evTa'+i).value);
        if(!o.id||!o.levels){ toast('缺少 id / levels'); return; }
        KB.evals[i]=o; KBDirty=true; bumpVer(); adminRender(); toast('评价项已更新');
      }catch(e){ toast('JSON 解析失败：'+e.message); }
    });
  });
}
/* --- 页面布局：区块增减与排布 --- */
function tabLayout(t){
  var g=function(k){ return (KB.layout&&KB.layout[k])||[]; };
  var h='<div class="actcard"><div class="t">页面布局 · 区块增减与排布</div>'
   +'<div class="d" style="margin-bottom:10px">勾选=显示，取消勾选=隐藏；用 ↑/↓ 调整先后顺序。录入页区块改动即时生效；报告区三个模块在下次生成报告时生效。所有改动随知识库一起保存。</div></div>';
  [['input','录入页 · 左栏区块','cardIn'],['proc','录入页 · 判定过程留痕','cardProc'],['report','诊断报告 · 输出模块','doc']].forEach(function(seg){
    var arr=g(seg[0]);
    h+='<div class="actcard" style="margin-top:10px"><div class="t">'+seg[1]+'（'+arr.length+'）</div><div style="margin-top:8px">';
    arr.forEach(function(b,i){
      h+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed rgba(255,255,255,.08)">'
       +'<input type="checkbox" id="lo_'+seg[0]+'_'+i+'" data-loon="'+seg[0]+'.'+i+'" '+(b.on===false?'':'checked')+' />'
       +'<label for="lo_'+seg[0]+'_'+i+'" style="flex:1;cursor:pointer">'+esc(b.name)+'　<code style="opacity:.5;font-size:11px">'+esc(b.id)+'</code></label>'
       +'<button class="btn ghost sm" data-lomv="'+seg[0]+'.'+i+'.-1" '+(i===0?'disabled':'')+'>↑</button>'
       +'<button class="btn ghost sm" data-lomv="'+seg[0]+'.'+i+'.1" '+(i===arr.length-1?'disabled':'')+'>↓</button>'
       +'</div>';
    });
    h+='</div></div>';
  });
  t.innerHTML=h;
  Array.prototype.forEach.call(t.querySelectorAll('[data-loon]'),function(el){
    el.addEventListener('change',function(){
      var p=this.getAttribute('data-loon').split('.'), arr=g(p[0]);
      arr[parseInt(p[1],10)].on=this.checked; KBDirty=true; applyLayout();
    });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-lomv]'),function(el){
    el.addEventListener('click',function(){
      var p=this.getAttribute('data-lomv').split('.'), arr=g(p[0]), i=parseInt(p[1],10), d=parseInt(p[2],10), j=i+d;
      if(j<0||j>=arr.length) return;
      var tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp; KBDirty=true; applyLayout(); adminRender();
    });
  });
}
/* --- MD 文件库：看到全部调用的 MD，支持下载 / 上传替换 / 停用删除（主人 2026-10-23 定） --- */
function tabMds(t){
  var all=mdFilesAll(), st=KB.mdState||{}, live=mdFiles();
  var V=mdVols(), Vmap={}; V.forEach(function(x){ Vmap[x[0]]=x[1]; });
  var h='<div class="actcard"><div class="t">MD 文件库 · 智能体当前调用的全部知识库文档</div>'
   +'<div class="d" style="margin-bottom:10px">共 <b>'+all.length+'</b> 个文件，启用 <b>'+live.length+'</b> 个。'
   +'MD 内容由知识库<b>实时生成</b>，改完后台内容此处即可见；上传 MD 会自动按 <code>&lt;!--KBVOL:NN--&gt;</code> 分节回写对应知识节点、版本 +0.0.1 并记变更日志。'
   +'内置文件「删除」为<b>停用</b>（不再导出，可一键恢复），自定义文件删除后重新上传即可恢复。</div></div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px">'
   +'<button class="btn teal sm" id="btnMdAll" type="button">下载全部 MD</button>'
   +'<button class="btn sm" id="btnMdUpNew" type="button">＋ 上传新 MD（登记为自定义文件）</button>'
   +'<input type="file" id="fileMdNew" accept=".md,.markdown,.txt" multiple style="display:none"/></div>';
  all.forEach(function(f,i){
    var off=st[f.name]&&st[f.name].on===false;
    var txt=off?'':(Vmap[f.name]||'');
    var src=(f.vols||[]).map(function(v){ return v+'→'+(VOLSRC[v]||''); }).join('　｜　');
    h+='<div class="actcard" style="padding:12px 14px;margin-bottom:10px">'
     +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
     +'<b style="font-size:13px;color:#1b2430">'+esc(f.name)+'</b>'
     +'<span class="tag'+(f.builtin?'':' b')+'">'+(f.builtin?'内置原始文档':'自定义上传')+'</span>'
     +(off?'<span class="tag r">已停用</span>':'<span class="tag g">启用中</span>')
     +'<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">'
     +'<button class="btn ghost sm" data-mddl="'+i+'" type="button">下载</button>'
     +'<button class="btn sm" data-mdup="'+i+'" type="button">上传替换</button>'
     +(off?'<button class="btn teal sm" data-mdres="'+i+'" type="button">恢复启用</button>'
          :'<button class="btn ghost sm" data-mddel="'+i+'" type="button">删除</button>')
     +'</span></div>'
     +'<div style="font-size:11.5px;color:#5a6472;margin-top:6px;line-height:1.7">'
     +'分节 '+((f.vols||[]).join(' / ')||'—')+'　｜　'+'字数 '+(off?'—':txt.length)+'　｜　'+(f.note?('备注：'+esc(f.note)+'　｜　'):'')
     +'对应知识节点：'+esc(src)+'</div>'
     +'<input type="file" data-mdfile="'+i+'" accept=".md,.markdown,.txt" multiple style="display:none"/></div>';
  });
  t.innerHTML=h;
  function afterImport(applied,errs,jobs,label){
    if(applied.length){
      /* 登记自定义文件：按文件名聚拢其包含的分节 */
      (jobs||[]).forEach(function(j){
        if(!j.vol) return;
        var nm=String(j.file||j.name||'').replace(/^KB_/,'');
        if(mdFilesAll().some(function(x){ return x.name===nm; })) return;
        KB.files=KB.files||[];
        var cur=KB.files.filter(function(x){ return x.name===nm; })[0];
        if(!cur){ cur={name:nm,vols:[],note:'使用者上传登记'}; KB.files.push(cur); }
        if(cur.vols.indexOf(j.vol)<0) cur.vols.push(j.vol);
      });
      saveKB(true);   /* 版本自增已由 applyMd 完成，此处不重复 bump */
      KB.log=KB.log||[]; KB.log.unshift({v:KB.meta.ver,d:KB.meta.updated,m:(label||'MD 上传替换')+'：'+applied.join('；')});
      saveKB(true); buildIndex(); applyLayout();
      toast((label||'MD')+'回写成功：'+applied.join('、'));
    }else toast('未解析到可回写的分节：'+(errs[0]||'缺少 <!--KBVOL:NN--> 标记'));
    if(errs.length) console.warn(errs);
    adminRender();
  }
  $('btnMdAll').addEventListener('click',exportMd);
  $('btnMdUpNew').addEventListener('click',function(){ $('fileMdNew').click(); });
  $('fileMdNew').addEventListener('change',function(){
    var fl=[]; for(var i=0;i<this.files.length;i++) fl.push(this.files[i]); /* 先拷贝，清空 value 会让 FileList 失效 */
    this.value='';
    if(!fl.length) return;
    parseMdVols(fl,function(ap,er,jobs){ afterImport(ap,er,jobs,'上传新 MD'); });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-mddl]'),function(el){
    el.addEventListener('click',function(){
      var f=all[+this.getAttribute('data-mddl')];
      if(!f) return;
      var v=Vmap[f.name];
      if(v==null){ toast('该文件已停用，恢复后可下载'); return; }
      dl(f.name,v,'text/markdown;charset=utf-8');
    });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-mdup]'),function(el){
    el.addEventListener('click',function(){
      var i=this.getAttribute('data-mdup');
      var fi=t.querySelector('[data-mdfile="'+i+'"]'); if(fi) fi.click();
    });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-mdfile]'),function(el){
    el.addEventListener('change',function(){
      var i=+this.getAttribute('data-mdfile'), f=all[i];
      var fl=[]; for(var k=0;k<this.files.length;k++) fl.push(this.files[k]); /* 先拷贝再清空 */
      this.value='';
      if(!fl.length) return;
      parseMdVols(fl,function(ap,er,jobs){ afterImport(ap,er,jobs,'替换 '+f.name); });
    });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-mddel]'),function(el){
    el.addEventListener('click',function(){
      var f=all[+this.getAttribute('data-mddel')]; if(!f) return;
      if(f.builtin){
        if(!confirm('确认停用「'+f.name+'」？\n停用后不再导出、不参与分发；内容仍在知识库中，可随时恢复。')) return;
        KB.mdState=KB.mdState||{}; KB.mdState[f.name]={on:false};
        bumpVer(); KB.log=KB.log||[]; KB.log.unshift({v:KB.meta.ver,d:KB.meta.updated,m:'MD 文件库：停用 '+f.name});
        saveKB(true); toast('已停用 '+f.name);
      }else{
        if(!confirm('确认删除自定义文件「'+f.name+'」？\n仅删除文件登记（内容不回退），重新上传即可恢复。')) return;
        KB.files=(KB.files||[]).filter(function(x){ return x.name!==f.name; });
        bumpVer(); KB.log=KB.log||[]; KB.log.unshift({v:KB.meta.ver,d:KB.meta.updated,m:'MD 文件库：删除自定义文件 '+f.name});
        saveKB(true); toast('已删除 '+f.name);
      }
      adminRender();
    });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-mdres]'),function(el){
    el.addEventListener('click',function(){
      var f=all[+this.getAttribute('data-mdres')]; if(!f) return;
      KB.mdState=KB.mdState||{}; delete KB.mdState[f.name];
      bumpVer(); KB.log=KB.log||[]; KB.log.unshift({v:KB.meta.ver,d:KB.meta.updated,m:'MD 文件库：恢复启用 '+f.name});
      saveKB(true); toast('已恢复 '+f.name); adminRender();
    });
  });
}
/* --- 页面备注：页面上所有备注文字后台可增改删（主人 2026-10-26 定） --- */
function tabHints(t){
  var items=(KB.hints&&KB.hints.items)||[];
  var DEF={hintCover:'生成诊断后自动逐条核对子项覆盖情况；也可点下方「仅检查覆盖度」先单独跑一遍。',
           hintKpi:'关键指标速填（选填 · 未填项自动按文本识别，识别不到则标不适用）',
           tipHold:'按住说话，松开结束。',
           phTx:'按下下方金色按钮说话。',
           phTx2:'录入项目经理补充的客户要求、项目痛点、项目亮点等。将用于提取「客户需求 / 项目痛点 / 项目亮点」。',
           noteCover:'按知识库子项逐条核对'};
  var h='<div class="actcard"><div class="t">页面备注 · 页面上的提示文字全部可增改</div>'
   +'<div class="d" style="margin-bottom:10px"><b>边改边生效</b>：输入框里一改，页面立刻跟着变，并自动存本机（无需手动保存）；'
   +'点「保存该条 / 保存全部」会额外升版本号并记变更日志。<b>清空文本 = 该处不显示</b>（如已删掉的「评分口径」说明）。'
   +'也可在任意区块新增自定义备注。</div></div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px">'
   +'<button class="btn teal sm" id="hnAll" type="button">保存全部备注（并记录版本）</button>'
   +'<span id="hnState" style="font-size:12px;color:#4a5568;align-self:center"></span></div>'
   +'<div class="actcard" style="padding:12px 14px;margin-bottom:10px">'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'
   +'<div style="flex:1;min-width:150px"><label style="font-size:11.5px;color:#5a6472;display:block;margin-bottom:4px">显示位置</label>'
   +'<select id="hnSlot" style="width:100%;font-size:12px;padding:7px 9px;border-radius:9px;border:1px solid #d8cdb4;background:#fff;color:#111">'
   +Object.keys(HINT_SLOTS).map(function(k){ return '<option value="'+k+'">'+HINT_SLOTS[k]+'</option>'; }).join('')
   +'</select></div>'
   +'<div style="flex:3;min-width:240px"><label style="font-size:11.5px;color:#5a6472;display:block;margin-bottom:4px">备注内容</label>'
   +'<input id="hnText" placeholder="输入新的备注文字，保存后显示在所选位置" style="width:100%;font-size:12.5px;padding:7px 9px;border-radius:9px;border:1px solid #d8cdb4;background:#fff;color:#111"/></div>'
   +'<button class="btn teal sm" id="hnAdd" type="button">＋ 新增备注</button>'
   +'</div></div>';
  items.forEach(function(it,i){
    var custom=/^c_/.test(it.id||'');
    h+='<div class="actcard" style="padding:12px 14px;margin-bottom:10px">'
     +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">'
     +'<span class="tag'+(custom?' b':'')+'">'+(HINT_SLOTS[it.slot]||it.slot)+'</span>'
     +'<b style="font-size:12.5px;color:#1b2430">'+esc(it.id||'')+'</b>'
     +(it.text?'<span class="tag g">显示中</span>':'<span class="tag r">已隐藏（文本为空）</span>')
     +'<span style="margin-left:auto;display:flex;gap:6px">'
     +(DEF[it.id]!==undefined?'<button class="btn ghost sm" data-hndef="'+i+'" type="button">恢复默认</button>':'')
     +(custom?'<button class="btn ghost sm" data-hndel="'+i+'" type="button">删除</button>':'')
     +'</span></div>'
     +'<textarea data-hnta="'+i+'" rows="2" style="width:100%;box-sizing:border-box;font-size:12.5px;padding:8px 10px;border-radius:9px;border:1px solid #d8cdb4;background:#fff;color:#111;font-family:inherit;line-height:1.6">'+esc(it.text||'')+'</textarea>'
     +'<div style="margin-top:6px"><button class="btn teal sm" data-hnsave="'+i+'" type="button">保存该条</button></div>'
     +'</div>';
  });
  t.innerHTML=h;
  var autoT=null;
  function autoSave(){
    KB.hints=KB.hints||{}; KB.hints.items=items;
    applyHints();
    var st=$('hnState'); if(st) st.textContent='已自动保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    clearTimeout(autoT);
    autoT=setTimeout(function(){ saveKB(true); /* 自动落本机，不重复升版本 */ },600);
  }
  /* 边改边生效：input 即写入知识库并回写页面 + 自动存本机 */
  Array.prototype.forEach.call(t.querySelectorAll('[data-hnta]'),function(el){
    el.addEventListener('input',function(){
      var i=+this.getAttribute('data-hnta');
      items[i].text=this.value;
      autoSave();
    });
  });
  $('hnAll').addEventListener('click',function(){
    Array.prototype.forEach.call(t.querySelectorAll('[data-hnta]'),function(el){
      var i=+el.getAttribute('data-hnta'); items[i].text=el.value;
    });
    KB.hints=KB.hints||{}; KB.hints.items=items;
    hintSave('页面备注：保存全部（'+items.length+' 条）');
    toast('全部备注已保存并记录版本 v'+KB.meta.ver);
  });
  $('hnAdd').addEventListener('click',function(){
    var slot=$('hnSlot').value, txt=($('hnText').value||'').trim();
    if(!txt){ toast('请先输入备注内容'); return; }
    items.push({id:'c_'+Date.now().toString(36),slot:slot,text:txt});
    KB.hints=KB.hints||{}; KB.hints.items=items;
    $('hnText').value='';
    hintSave('页面备注：新增「'+(HINT_SLOTS[slot]||slot)+'」备注');
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-hnsave]'),function(el){
    el.addEventListener('click',function(){
      var i=+this.getAttribute('data-hnsave'), ta=t.querySelector('[data-hnta="'+i+'"]');
      items[i].text=ta?ta.value:items[i].text;
      KB.hints=KB.hints||{}; KB.hints.items=items;
      hintSave('页面备注：修改 '+(items[i].id||'')+'（'+(HINT_SLOTS[items[i].slot]||items[i].slot)+'）');
    });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-hndef]'),function(el){
    el.addEventListener('click',function(){
      var i=+this.getAttribute('data-hndef');
      items[i].text=DEF[items[i].id]||'';
      KB.hints=KB.hints||{}; KB.hints.items=items;
      hintSave('页面备注：恢复默认 '+(items[i].id||''));
    });
  });
  Array.prototype.forEach.call(t.querySelectorAll('[data-hndel]'),function(el){
    el.addEventListener('click',function(){
      var i=+this.getAttribute('data-hndel');
      if(!confirm('确认删除该自定义备注？')) return;
      items.splice(i,1);
      KB.hints=KB.hints||{}; KB.hints.items=items;
      hintSave('页面备注：删除自定义备注');
    });
  });
}
/* --- 写作要求 --- */
function tabGuide(t){
  var h='<div class="actcard"><div class="t">走访报告写作要求与技巧</div>'
   +'<div class="d" style="margin-bottom:10px">本段内容会作为智能体的写作约束，随知识库一起保存 / 导出（MD 卷 04）。可整段替换为你最新版的要求文档。</div>'
   +'<textarea id="guideTa" rows="18" style="width:100%;font-size:12.5px;line-height:1.7">'+esc(KB.guide||'')+'</textarea>'
   +'<div style="margin-top:10px;display:flex;gap:8px;align-items:center">'
   +'<button class="btn teal sm" id="btnGuideSave" type="button">保存写作要求</button>'
   +'<button class="btn ghost sm" id="btnGuideLoad" type="button">从 MD 文件覆盖导入</button>'
   +'<input type="file" id="fileGuide" accept=".md,.markdown,text/markdown" style="display:none" />'
   +'<span style="font-size:11.5px;opacity:.6">当前 '+((KB.guide||'').length)+' 字</span></div></div>';
  t.innerHTML=h;
  var ta=$('guideTa');
  $('btnGuideSave').addEventListener('click',function(){
    KB.guide=ta.value; KBDirty=true; bumpVer(); toast('写作要求已保存（'+KB.guide.length+' 字）');
  });
  $('btnGuideLoad').addEventListener('click',function(){ $('fileGuide').click(); });
  $('fileGuide').addEventListener('change',function(){
    var f=this.files&&this.files[0]; if(!f) return;
    var fr=new FileReader();
    fr.onload=function(){
      var txt=String(fr.result||'');
      txt=txt.replace(/^[\s\S]*?<!--KBVOL:04-->\s*/,'').replace(/^# [^\n]*\n>[^\n]*\n\n/,'');
      txt=txt.replace(/^[\s\S]*?<!--\s*AIGC[\s\S]*?-->\s*/,'');
      if(!txt.trim()){ toast('文件内容为空'); return; }
      KB.guide=txt.trim(); KBDirty=true; bumpVer(); ta.value=KB.guide;
      toast('已导入写作要求（'+KB.guide.length+' 字），请点保存');
    };
    fr.readAsText(f); this.value='';
  });
}
function ap(path,val){
  var p=path.split('.'),o=KB;
  for(var i=0;i<p.length-1;i++){ o=o[p[i]]; if(o==null) return; }
  o[p[p.length-1]]=val; KBDirty=true;
  var s=$('adminState'); if(s) s.textContent='当前 v'+KB.meta.ver+' · 有未保存改动';
}
function field(label,val,path,type){
  var id='f_'+String(path).replace(/[.\-]/g,'_');
  var attr = (type==='num')?('data-num="'+path+'"') : (type==='bv'?('data-bv="'+path+'"') : ('data-ap="'+path+'"'));
  return '<div class="field"><label>'+esc(label)+'</label>'
   +(type==='ta'
     ?'<textarea id="'+id+'" '+attr+' rows="2">'+esc(val)+'</textarea>'
     :'<input id="'+id+'" '+attr+' value="'+esc(val)+'" />')
   +'</div>';
}
function bindFields(root){
  Array.prototype.forEach.call(root.querySelectorAll('[data-ap]'),function(el){
    el.addEventListener('input',function(){ ap(this.getAttribute('data-ap'),this.value); });
    el.addEventListener('change',function(){ if(this.type==='checkbox') ap(this.getAttribute('data-ap'),this.checked); });
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-list]'),function(el){
    el.addEventListener('input',function(){
      ap(this.getAttribute('data-list'),splitList(this.value));
    });
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-num]'),function(el){
    el.addEventListener('input',function(){ var n=parseFloat(this.value); ap(this.getAttribute('data-num'),isNaN(n)?0:n); });
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-bv]'),function(el){
    el.addEventListener('input',function(){
      var raw=String(this.value).trim(), v=null;
      if(raw!==''){ var n=parseFloat(raw); v=isNaN(n)?null:n; }
      ap(this.getAttribute('data-bv'),v);
    });
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-act]'),function(el){
    el.addEventListener('click',function(){
      var a=this.getAttribute('data-act'), arg=this.getAttribute('data-arg');
      if(a==='addDim'){ var asp=this.getAttribute('data-asp'); var A=null; KB.aspects.forEach(function(x){if(x.code===asp)A=x;});
        var code=asp+(A.items.length+1);
        A.items.push({code:code,name:'新增子项',reviews:[],signals:[],tags:[],families:[],kw:[]});
        KBDirty=true; adminRender(); toast('已新增 '+code+'，请补全名称与关键词'); }
      if(a==='delDim'){ var d=this.getAttribute('data-arg'); var asp2=d.charAt(0);
        KB.aspects.forEach(function(x){ if(x.code===asp2) x.items=x.items.filter(function(i){return i.code!==d;}); });
        KBDirty=true; adminRender(); toast('已删除 '+d); }
      if(a==='addRow'){ KB.score.rows.push({id:'SC-NEW-'+(KB.score.rows.length+1),part:this.getAttribute('data-part'),aspect:'A',l1:'',name:'新评分项',max:0,type:'band',target:'',pat:[],bands:[{d:'',e:'',v:0},{d:'',e:'',v:0},{d:'',e:'',v:0}],evidence:true,hint:''});
        KBDirty=true; adminRender(); }
      if(a==='delRow'){ KB.score.rows=KB.score.rows.filter(function(r){return r.id!==this.getAttribute('data-arg');}.bind(this)); KBDirty=true; adminRender(); }
      if(a==='addTag'){ KB.tags.push({code:'TAG-NEW'+(KB.tags.length+1),short:'X-新',name:'新标签',color:'#cccccc'}); KBDirty=true; adminRender(); }
      if(a==='delTag'){ KB.tags=KB.tags.filter(function(t){return t.code!==this.getAttribute('data-arg');}.bind(this)); KBDirty=true; adminRender(); }
    });
  });
}
function tabMeta(t){
  t.innerHTML='<div class="grid">'
   +field('知识库名称',KB.meta.name,'meta.name')
   +field('版本号',KB.meta.ver,'meta.ver')
   +field('更新日期',KB.meta.updated,'meta.updated')
   +field('总分公式',KB.cfg.totalFormula,'cfg.totalFormula')
   +field('K 折算公式',KB.cfg.kFormula,'cfg.kFormula')
   +field('免责声明（印在报告上）',KB.cfg.simTag,'cfg.simTag','ta')
   +field('IT 措施缺口说明',KB.cfg.pendingITNote,'cfg.pendingITNote','ta')
   +'</div>'
   +'<div class="warnbox"><b>成熟度分级：</b>'+(KB.cfg.grading?'已启用':'当前关闭（主人 2026-10-19 确认：只输出总得分，不分级）')+'　'+esc(KB.cfg.gradingNote||'')+'</div>'
   +'<div class="warnbox"><b>四维覆盖范围：</b>'+KB.aspects.map(function(a){return a.code+' '+a.name+'（'+a.items.length+'）';}).join(' / ')
   +'　|　措施卡 '+IDX.acts.length+' 张　|　知识点 '+(IDX.kp?Object.keys(IDX.kp).length:0)+' 条</div>';
  bindFields(t);
}
function tabDims(t){
  var h='';
  KB.aspects.forEach(function(a,ai){
    h+='<details class="fold" open><summary style="font-size:13px;color:#e8c584">'+esc(a.code+' · '+a.name)+'　'+esc(a.slogan||'')+'（'+a.items.length+' 项）</summary>';
    h+='<div style="margin-top:8px">'
      +field('方面码',a.code,'aspects.'+ai+'.code')
      +field('方面名',a.name,'aspects.'+ai+'.name')
      +field('评分表抬头 / 口号',a.slogan||'','aspects.'+ai+'.slogan')
      +'</div>';
    (a.items||[]).forEach(function(it,ii){
      var p='aspects.'+ai+'.items.'+ii+'.';
      h+='<div class="actcard"><div class="hd"><span class="t">'+esc(it.code+' '+it.name)+'</span>'
        +'<span class="tag">'+(it.families&&it.families.length?esc(it.families.join('/')):'无措施族')+'</span>'
        +'<button class="btn sm" data-act="delDim" data-arg="'+esc(it.code)+'">删除子项</button></div><div class="grid">'
        +field('子项码',it.code,p+'code')
        +field('名称',it.name,p+'name')
        +'</div>'
        +'<div class="grid" style="margin-top:8px">'
        +field('审查要点（换行分隔）',(it.reviews||[]).join('\n'),p+'reviews','ta')
        +field('证据信号（换行分隔）',(it.signals||[]).join('\n'),p+'signals','ta')
        +field('整改标签码（换行分隔）',(it.tags||[]).join('\n'),p+'tags','ta')
        +field('措施族（换行分隔，留空则出「措施待补充」）',(it.families||[]).join('\n'),p+'families','ta')
        +'</div>'
        +'<div class="grid" style="margin-top:8px">'
        +field('命中关键词（换行分隔）',(it.kw||[]).join('\n'),p+'kw','ta')
        +'</div></div>';
    });
    h+='<button class="btn sm teal" data-act="addDim" data-asp="'+esc(a.code)+'">+ 新增子项</button>';
    h+='</details>';
  });
  t.innerHTML=h;
  bindFields(t);
}
function tabScore(t){
  var h='';
  (KB.score.parts||[]).forEach(function(pt,pi){
    h+='<details class="fold" open><summary style="font-size:13px;color:#e8c584">'+esc(pt.title)+'（满分 '+pt.max+'）</summary>';
    h+='<div style="margin-top:8px">'
      +field('Part 码',pt.part,'score.parts.'+pi+'.part')
      +field('标题',pt.title,'score.parts.'+pi+'.title')
      +field('一级列名',pt.colL1||'','score.parts.'+pi+'.colL1')
      +field('依据列名',pt.colBasis||'','score.parts.'+pi+'.colBasis')
      +'</div>';
    (KB.score.rows||[]).forEach(function(r,ri){
      if(r.part!==pt.part) return;
      var p='score.rows.'+ri+'.';
      h+='<div class="actcard"><div class="hd"><span class="t">'+esc(r.id+' '+r.name)+'</span>'
        +'<span class="tag">'+esc(r.type)+'</span><span class="tag b">满分 '+r.max+'</span>'
        +'<span class="tag">'+esc(r.aspect||'')+'</span>'
        +'<button class="btn sm" data-act="delRow" data-arg="'+esc(r.id)+'">删除</button></div><div class="grid">'
        +field('ID',r.id,p+'id')
        +field('名称',r.name,p+'name')
        +field('一级维度/分类',r.l1||'',p+'l1')
        +field('所属方面',r.aspect||'',p+'aspect')
        +'</div><div class="grid" style="margin-top:8px">'
        +field('满分',r.max,p+'max','num')
        +field('类型（band/ladder_up/ladder_down/full100/qual/qual3/bonus）',r.type,p+'type')
        +field('目标值表述',r.target||'',p+'target')
        +field('备注 / 判定口径',r.hint||'',p+'hint','ta')
        +'</div><div class="grid" style="margin-top:8px">'
        +field('取值关键词（换行分隔）',(r.pat||[]).join('\n'),p+'pat','ta')
        +'</div>'
        +'<div style="margin-top:8px;font-size:12px;color:#c8d4e3">档位</div><div class="grid">';
      (r.bands||[]).forEach(function(b,bi){
        h+=field('档'+(bi+1)+' 描述',b.d,p+'bands.'+bi+'.d','ta')
         +field('档'+(bi+1)+' 触发表达式 X',b.e||'',p+'bands.'+bi+'.e')
         +field('档'+(bi+1)+' 分值',b.v==null?'':b.v,p+'bands.'+bi+'.v','v');
      });
      h+='</div></div>';
    });
    h+='<button class="btn sm teal" data-act="addRow" data-part="'+esc(pt.part)+'">+ 新增评分项</button></details>';
  });
  t.innerHTML=h;
  bindFields(t);
}
function tabTags(t){
  var h='<div class="grid">';
  KB.tags.forEach(function(x,i){
    h+=field('标签码',x.code,'tags.'+i+'.code')
     +field('简写（写入整改表维度列）',x.short,'tags.'+i+'.short')
     +field('名称',x.name,'tags.'+i+'.name')
     +field('颜色',x.color,'tags.'+i+'.color');
  });
  h+='</div><button class="btn sm teal" data-act="addTag">+ 新增标签</button>';
  t.innerHTML=h; bindFields(t);
}
function tabPrio(t){
  var U=KB.priority.urgency, M=KB.priority.matrix, ST=KB.priority.stars;
  var h='<div style="font-size:12.5px;color:#e8c584;margin-bottom:6px">紧急度信号词（换行分隔）</div><div class="grid">';
  ['高','中','低'].forEach(function(k){
    h+=field('紧急度 · '+k,(U[k]||[]).join('\n'),'priority.urgency.'+k,'ta');
  });
  h+='</div><div style="font-size:12.5px;color:#e8c584;margin:10px 0 6px">重要度星级信号词（五星最高）</div><div class="grid">';
  [5,4,3,2].forEach(function(k){
    h+=field('★★★★★'.slice(0,k)+'☆☆☆☆☆'.slice(0,5-k)+' 信号词',(ST[String(k)]||[]).join('\n'),'priority.stars.'+k,'ta');
  });
  h+='</div>';
  h+='<div style="font-size:12.5px;color:#e8c584;margin:10px 0 6px">优先级矩阵（行=紧急度，列=重要度档）</div>';
  h+='<table><thead><tr><th>紧急度 ＼ 重要度</th><th>高（★★★★☆–★★★★★）</th><th>中（★★★☆☆）</th><th>低（★☆☆☆☆–★★☆☆☆）</th></tr></thead><tbody>';
  ['高','中','低'].forEach(function(u){
    h+='<tr><th>'+u+'</th>';
    ['高','中','低'].forEach(function(i){
      h+='<td><select data-apx="priority.matrix.'+u+'.'+i+'">'
        +['P0','P1','P2','P3'].map(function(o){return '<option'+(M[u][i]===o?' selected':'')+'>'+o+'</option>';}).join('')
        +'</select></td>';
    });
    h+='</tr>';
  });
  h+='</tbody></table>';
  h+='<div style="font-size:12.5px;color:#e8c584;margin:10px 0 6px">建议交期（天）</div><div class="grid">';
  ['P0','P1','P2','P3'].forEach(function(p){
    h+=field(p+' 交期天数',KB.priority.lead[p],'priority.lead.'+p,'num')
      +field(p+' 文案',KB.priority.leadLabel[p]||'','priority.leadLabel.'+p);
  });
  h+='</div>';
  t.innerHTML=h;
  bindFields(t);
  Array.prototype.forEach.call(t.querySelectorAll('[data-apx]'),function(el){
    el.addEventListener('change',function(){ ap(this.getAttribute('data-apx'),this.value); });
  });
}
function tabJson(t){
  t.innerHTML='<div style="font-size:12px;color:#c8d4e3;margin-bottom:8px">直接编辑完整知识库 JSON，点「应用」校验并载入。</div>'
   +'<textarea id="rawJson" rows="22" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px">'+esc(JSON.stringify(KB,null,1))+'</textarea>'
   +'<div style="margin-top:8px"><button class="btn sm gold" id="btnApplyJson">应用 JSON</button></div>';
  $('btnApplyJson').addEventListener('click',function(){
    try{
      var o=JSON.parse($('rawJson').value);
      if(!o.meta||!o.aspects||!o.score) throw new Error('缺少 meta / aspects / score 节点');
      KB=o; buildIndex(); renderKpi(); KBDirty=true;
      $('adminState').textContent='JSON 已载入（未保存）'; toast('JSON 校验通过并已载入');
    }catch(e){ toast('JSON 错误：'+e.message); }
  });
}
function tabLog(t){
  try{
    var lg=JSON.parse(localStorage.getItem(LOGS)||'[]');
    t.innerHTML='<table><thead><tr><th>日期</th><th>版本</th><th>说明</th></tr></thead><tbody>'
      +(lg.length?lg.map(function(x){return '<tr><td>'+esc(x.t)+'</td><td>'+esc(x.v)+'</td><td>'+esc(x.n)+'</td></tr>';}).join(''):'<tr><td colspan="3">暂无本地变更记录</td></tr>')
      +'</tbody></table><div style="margin-top:10px"><button class="btn sm" id="btnClrLog">清空本地日志</button></div>';
    $('btnClrLog').addEventListener('click',function(){ localStorage.removeItem(LOGS); adminRender(); });
  }catch(e){ t.innerHTML='<div class="warnbox">读取日志失败：'+esc(e.message)+'</div>'; }
}
function exportHtmlWithKb(){
  try{
    var html=document.documentElement.outerHTML;
    var json=JSON.stringify(KB,null,1);
    var rep='<script id="kb-seed">\nwindow.__KB_SEED__ = '+json+';\n<'+'/script>';
    var re=/<script id="kb-seed">[\s\S]*?<\/script>/;
    if(!re.test(html)) throw new Error('未找到 kb-seed 脚本块');
    var out=html.replace(re,rep);
    dl('ops-diagnosis-agent_v'+KB.meta.ver+'.html',out,'text/html;charset=utf-8');
    toast('已导出：含 v'+KB.meta.ver+' 知识库，可分发给所有人离线使用');
  }catch(e){ toast('导出失败：'+e.message); }
}

/* ---------------- 语音 ---------------- */
var SR=null,rec=null,recOn=false,HOLDTIP='按住说话，松开结束。';
function initVoice(){
  SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    ['holdBtn','holdBtnM','holdTip'].forEach(function(id){ var e=$(id); if(e){ e.disabled=true; e.style.opacity=.45; } });
    if($('holdTip')) $('holdTip').textContent='当前浏览器不支持语音识别，请直接输入文本（推荐 Chrome / Edge）。';
    return;
  }
  function build(){
    rec=new SR(); rec.lang='zh-CN'; rec.continuous=true; rec.interimResults=true;
    rec.onresult=function(e){
      var fin='',itm='';
      for(var i=e.resultIndex;i<e.results.length;i++){
        var t=e.results[i][0].transcript;
        if(e.results[i].isFinal) fin+=t; else itm+=t;
      }
      var ta=$('tx');
      if(fin){ ta.value=(ta.value?ta.value.replace(/\s*$/,'')+'\n':'')+fin; ta.scrollTop=ta.scrollHeight; count(); }
      $('liveText').textContent=itm||'正在聆听…';
    };
    rec.onerror=function(e){ toast('语音识别出错：'+e.error); stopRec(); };
    rec.onend=function(){ if(recOn){ try{rec.start();}catch(x){} } else { $('live').style.display='none'; } };
  }
  function startRec(){
    if(!rec) build(); recOn=true; try{ rec.start(); }catch(e){}
    $('live').style.display='flex'; $('liveText').textContent='正在聆听…';
    ['holdBtn','holdBtnM'].forEach(function(id){var e=$(id); if(e) e.classList.add('on');});
    if($('holdTip')) $('holdTip').textContent='正在聆听…松开结束。';
  }
  function stopRec(){
    recOn=false; try{ rec.stop(); }catch(e){}
    $('live').style.display='none';
    ['holdBtn','holdBtnM'].forEach(function(id){var e=$(id); if(e) e.classList.remove('on');});
    if($('holdTip')) $('holdTip').textContent=HOLDTIP;
  }
  /* 真·按住说话：按下去开始，松手结束（2026-10-26 主人定） */
  function bindHold(el){
    if(!el) return;
    el.addEventListener('pointerdown',function(e){ e.preventDefault(); if(!recOn) startRec(); });
    ['pointerup','pointerleave','pointercancel'].forEach(function(ev){
      el.addEventListener(ev,function(){ if(recOn) stopRec(); });
    });
    el.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  }
  bindHold($('holdBtn')); bindHold($('holdBtnM'));
}

/* ---------------- 交互初始化 ---------------- */
/* 主人 2026-10-26 定：去掉口述建议标签云（CHIPS），录入区保持干净 */
function count(){
  var a=$('tx'),b=$('tx2');
  if($('cc')) $('cc').textContent=(a.value||'').length+' 字';
  if($('cc2')) $('cc2').textContent=(b.value||'').length+' 字';
}
var DEMO={
 name:'某新能源材料项目', type:'A类', head:'约 260 人', conf:'18 人（项目经理 1+行政 2+主管 3+EHS 3+班组长 9）',
 oral:[
  '今天走访了该项目现场，人数约 260 人，管理配置 18 人。',
  '现场管理方面：安全三级教育覆盖率 100%，特种作业持证上岗率 100%，全年未发生安全事故；隐患排查台账每周更新，闭环率 96%。',
  '品质方面：SOP 覆盖率 85%，关键工序的作业指导书还有 3 份没补齐；作业遵守度从年初的 70% 提升到 92%。',
  '本月发生客户投诉 2 起，其中 1 起走到索赔，主要是外观判定的标准没有统一。',
  '成本方面：线体平衡率 72%，离目标 85% 还有差距；我们通过一人双线减少了 4 人，月节约约 6 万元。',
  '目视化这块，看板更新不及时，仓库的手工目视化库位做得不错，客户也有借鉴。',
  '人员服务方面：系统离职率 3.9%，但实际统计下来有 7% 左右，偏差主要是已离职没走系统流程。',
  '员工关怀做了宿舍家访和生日会，但缺少员工风采展示墙，内容没能外化展示。',
  '员工满意度问卷还没有建立执行，目前只有随机访谈，满意度大概 85 分，没有量化数据支撑。',
  '招聘方面：系统内荐自招率 51%，主要靠 BOSS 直聘和朋友圈自招；招聘费用占比 13.6%。',
  '旺季缺口最大时有 60 人，供应商交付跟不上，供应商评价体系还没标准化。',
  'IT 应用方面：钉钉考勤覆盖率 100%，但跨天打卡还有问题；电子签覆盖率只做到 60%，一线员工推广有阻力。',
  '系统里的在职人数和现场实际对不上，导致系统数据失准。'
 ].join('\n'),
 supp:[
  '客户要求：客户明确要求下个月把外观判定标准统一，并且限我们在月底前把客诉闭环率做到 100%。',
  '客户希望：客户希望我们能够把精益改善成果形成案例，在集团内部推广。',
  '项目痛点：office 区域是英格玛专属但没有英格玛元素；电子签推广阻力大；员工离职率高居不下。',
  '项目亮点：手工目视化库位被客户借鉴并在其他产线推广；今年获得客户表彰信 2 封。'
 ].join('\n')
};
function fillDemo(){
  $('mName').value=DEMO.name; $('mType').value=DEMO.type; $('mHead').value=DEMO.head; $('mConf').value=DEMO.conf;
  /* 主人 2026-10-26 定：评分日期默认清空，由使用者自选（生成报告时空值仍按当天兜底） */  $('tx').value=DEMO.oral; $('tx2').value=DEMO.supp;
  KPIV={}; renderKpi(); count(); setPill('示例已填入');
  toast('示例已填入，点绿色 ▶ 按钮生成诊断报告');
}
function clearAll(){
  ['mName','mType','mHead','mConf','tx','tx2'].forEach(function(id){ var e=$(id); if(e) e.value=''; });
  (function(){ var md=$('mDate'); if(md){ md.value=''; md.classList.remove('filled'); } })();
  KPIV={}; COVERV={}; COVERX={}; CV=null; LAST={D:null,S:null}; saveCoverV(); saveCoverX(); renderCover();
  renderKpi(); count(); pReset();
  $('doc').innerHTML='<div class="idle-art">点绿色 ▶ 按钮生成诊断报告后，这里会逐步展开：四维子项命中情况、指标抽取、评分赋分、信息提取、措施收敛、优先级排序。</div>';
  $('jNow').textContent='等待输入'; setPill('待录入'); paintRail(-1);
  var rt=$('rptTag'); if(rt) rt.textContent='';
  $('jsonBox').style.display='none';
}
function boot(){
  KB=loadKB(); buildIndex(); paintVer(); renderKpi(); count();
  $('kbVer').textContent='v'+KB.meta.ver+' · '+KB.meta.updated;

  $('tx').addEventListener('input',count);
  $('tx2').addEventListener('input',count);

  /* 评分日期：未选时提示字用灰（muted），选中后值转亮色（主人 2026-10-26 定） */
  (function(){ var md=$('mDate'); if(!md) return;
    var uf=function(){ md.classList.toggle('filled',!!md.value); };
    md.addEventListener('change',uf); md.addEventListener('input',uf); uf();
  })();

  $('btnRun').addEventListener('click',run);
  $('btnRunM').addEventListener('click',run);
  $('btnDemo').addEventListener('click',fillDemo);
  $('btnDemoM').addEventListener('click',fillDemo);
  $('btnClear').addEventListener('click',clearAll);
  $('btnGrab').addEventListener('click',grab);
  $('btnKpiClear').addEventListener('click',function(){ KPIV={}; renderKpi(); toast('已清空手工指标，重跑时会重新抓取'); });

  $('btnDown').addEventListener('click',function(){ if(!R){toast('请先生成报告');return;} dl((R.meta.name||'诊断报告')+'_运营诊断报告.html',reportHtml(),'text/html;charset=utf-8'); });
  $('btnPrint').addEventListener('click',function(){ if(!R){toast('请先生成报告');return;} window.print(); });
  $('btnCopy').addEventListener('click',function(){
    if(!R){toast('请先生成报告');return;}
    var s=window.getSelection(),r=document.createRange(); r.selectNodeContents($('doc')); s.removeAllRanges(); s.addRange(r);
    try{ document.execCommand('copy'); toast('报告已复制到剪贴板'); }catch(e){ toast('复制失败，请手动选择'); }
    s.removeAllRanges();
  });
  $('btnCsv').addEventListener('click',function(){ if(!R){toast('请先生成报告');return;} dl((R.meta.name||'诊断报告')+'_评分与整改表.csv','\ufeff'+csvOf(),'text/csv;charset=utf-8'); });
  $('btnJson').addEventListener('click',function(){
    if(!R){toast('请先生成报告');return;}
    var b=$('jsonBox'); b.style.display=(b.style.display==='none'||!b.style.display)?'block':'none';
    if(b.style.display==='block') b.scrollIntoView({behavior:'smooth',block:'nearest'});
  });

  $('btnAdmin').addEventListener('click',adminOpen);
  $('btnClose').addEventListener('click',function(){ $('modal').classList.remove('on'); });
  /* 主人 2026-10-26 定：后台头部仅保留 保存到本机 / 导出HTML / 关闭；
     MD 的导出导入收进「MD 文件库」页签，JSON 的导入收进「原始 JSON」页签（如有需要） */
  $('btnSaveKb').addEventListener('click',function(){ bumpVer(); KB.log=KB.log||[]; KB.log.unshift({v:KB.meta.ver,d:KB.meta.updated,m:'管理员后台更新'}); if(saveKB()) adminRender(); });
  $('btnExportHtml').addEventListener('click',exportHtmlWithKb);
  $('modal').addEventListener('click',function(e){ if(e.target===this) this.classList.remove('on'); });

  initVoice();
  loadCoverV(); loadCoverX(); applyLayout(); applyHints(); renderCover();
  paintRail(-1);
  pLog('READY','知识库 v'+KB.meta.ver+' 已装载：'+KB.aspects.map(function(a){return a.code+'('+a.items.length+')';}).join(' ')+'；措施卡 '+IDX.acts.length+' 张。','ok');
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
window.__diag={run:run,getKB:function(){return KB;},getR:function(){return R;},mdVols:mdVols,applyMd:applyMd,applyLayout:applyLayout,reportHtml:reportHtml,
  buildCover:function(){return buildCover(LAST.D,LAST.S);},askList:askList,coverStat:function(){return CV?CV.stat:null;},
  judge:judge,methodsFor:methodsFor,scanRedFlags:scanRedFlags,buildEvals:buildEvals,
  /* 2026-10-27 新增：供 AI 增强模块（05_llm.js）调用的接口 */
  toast:toast,esc:esc,renderCover:renderCover,
  cover:function(){return CV;},coverRows:function(){return CV?CV.rows:[];},coverX:function(){return COVERX;},
  coverXSet:function(k,v){ if(v) COVERX[k]=v; else delete COVERX[k]; saveCoverX(); },
  mergeSupplements:mergeSupplements,
  fixes:function(){return R?R.fixes:[];},evals:function(){return R?R.evals:[];},
  kpi:function(){return R?R.score.rows:[];},
  input:function(){ return {name:($('mName')||{}).value||'', type:($('mType')||{}).value||'',
    date:($('mDate')||{}).value||'', oral:($('tx')||{}).value||'', supp:($('tx2')||{}).value||''}; },
  rawText:function(){ return (($('tx')||{}).value||'')+'\n'+(($('tx2')||{}).value||''); },
  meta:function(){ return R?R.meta:{}; }};
})();
