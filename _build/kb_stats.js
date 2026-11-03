/* 知识库全景统计：加载 v2 种子 + 旧版措施卡/知识包，输出清单 MD */
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','ops-diagnosis-agent.html'),'utf8');
const ctx={window:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'01_seed.js'),'utf8'),ctx);
const KB0=ctx.window.__KB_SEED__||ctx.__KB_SEED__;
const KB=KB0;
if(!KB) throw new Error('seed not loaded');
const R=KB.rules||{},M=(R.methods||{hl:[],pb:[]});

// 提取 legacy-seed 块
const m=html.match(/<script id="legacy-seed">([\s\S]*?)<\/script>/);
const ctx2={console};
vm.createContext(ctx2);
vm.runInContext(m[1]+'\n;__OUT__={ACT:typeof ACT!=="undefined"?ACT:null,KP:typeof KP!=="undefined"?KP:null};',ctx2);
const {ACT,KP}=ctx2.__OUT__;

const L=[];
const w=s=>L.push(s);
w('# 外包项目运营诊断知识库 · 全景清单（v'+KB.meta.ver+'，更新于 '+KB.meta.updated+'）');
w('');
w('> 本清单由 `_build/kb_stats.js` 自动统计生成，供后续精简优化时对照。');
w('> 优化建议直接在对应小节下批注，或一次性下发精简要求，我按清单逐项执行。');
w('');

/* 一、总体结构 */
w('## 一、总体结构（顶层 16 个部件）');
w('');
w('| # | 部件 | 数量 | 作用 | 存储位置 |');
w('|---|---|---|---|---|');
w('| 1 | meta 元信息 | 4 字段 | 知识库名称/版本/更新日期/说明 | KB.meta |');
w('| 2 | cfg 总控配置 | '+Object.keys(KB.cfg).length+' 字段 | 免责声明、总分公式、K 公式、成熟度开关、IT 缺口说明、管理员密钥 | KB.cfg |');
w('| 3 | layout 页面布局 | '+['input','proc','report'].reduce((s,k)=>s+KB.layout[k].length,0)+' 个区块 | 录入页/留痕/报告三区区块的显隐与排序（管理员可调） | KB.layout |');
w('| 4 | guide 写作要求 | '+(KB.guide||'').length+' 字 | 走访报告写作要求与技巧全文，约束报告生成 | KB.guide |');
w('| 5 | aspects 四维审查维度 | '+KB.aspects.length+' 个方面 / '+KB.aspects.reduce((s,a)=>s+(a.items||[]).length,0)+' 个子项 | 判定句子命中哪个审查维度 | KB.aspects |');
w('| 6 | tags 整改标签 | '+KB.tags.length+' 个 | 报告维度分类（8 分类代码，不可自定义） | KB.tags |');
w('| 7 | score 评分规则 | '+KB.score.parts.length+' 个 Part / '+KB.score.rows.length+' 个评分项 | 100 分制评分引擎的取值规则 | KB.score |');
w('| 8 | extract 信息提取信号 | 需求 '+KB.extract.need.pat.length+' / 痛点 '+KB.extract.pain.neg.length+' / 亮点 '+KB.extract.hl.pos.length+' 词 | 从口述文本中提取需求/痛点/亮点 | KB.extract |');
w('| 9 | priority 优先级规则 | 紧急度 3 组 / 重要度 4 组 / 矩阵 3×3 / 交期 4 档 | 痛点排序 P0–P3 与建议交期 | KB.priority |');
w('| 10 | rules 判定标准A | 五维 '+(R.fiveDims||[]).length+' / 红灯 '+(R.redFlags||[]).length+' / 方法 '+(M.hl.length+M.pb.length)+' 类 / 优先序 '+(R.pickOrder||[]).length+' 条 / 八要素 '+(R.eightElements||[]).length+' | 「事项好坏」标尺 + 措施卡触发依据 | KB.rules |');
w('| 11 | evals 独立评价项 | '+(KB.evals||[]).length+' 项 | 客户满意度 / 员工满意度（独立于四维，报告模块二） | KB.evals |');
w('| 12 | cover 覆盖度判定 | '+(KB.cover.states||[]).length+' 状态 | 仅判定输入信息是否齐全，不进报告 | KB.cover |');
w('| 13 | log 变更日志 | '+(KB.log||[]).length+' 条 | 版本沿革 | KB.log |');
w('| 14 | files MD 文件登记册 | '+(KB.files||[]).length+' 个自定义文件 | 后台「MD 文件库」登记的使用者上传文件（按分节归组） | KB.files |');
w('| 15 | mdState 文件启停状态 | '+Object.keys(KB.mdState||{}).length+' 条 | 内置 MD 文件的停用/恢复记录 | KB.mdState |');
w('| 16 | hints 页面备注 | '+(KB.hints&&KB.hints.items?KB.hints.items.length:0)+' 条 | 页面提示文字（占位语/介绍/小字），后台「页面备注」页签可增改删 | KB.hints |');
w('| 附 | 措施卡 ACT（旧版） | '+Object.keys(ACT).length+' 张 | 痛点→建议行动项的匹配库 | legacy-seed |');
w('| 附 | 知识包 KP（旧版） | '+Object.keys(KP).length+' 条 | 「问题场景→根因→措施组合」经验包 | legacy-seed |');
w('');

/* 二、四维审查维度表 */
w('## 二、四维审查维度表（KB.aspects，共 '+KB.aspects.reduce((s,a)=>s+(a.items||[]).length,0)+' 子项）');
w('');
w('> 每个子项含 5 类字段：审查要点 reviews / 证据信号 signals / 整改标签 tags / 措施族 families / 关键词 kw。');
w('> **精简提示**：关键词是命中判定依据，删减会直接影响命中率；措施族决定匹配哪张措施卡。');
w('');
KB.aspects.forEach(a=>{
  w('### '+a.code+' '+a.name+'（'+(a.items||[]).length+' 子项）'+(a.slogan?'　'+a.slogan:''));
  w('');
  w('| 子项 | 审查要点 | 整改标签 | 措施族 | 关键词数 |');
  w('|---|---|---|---|---|');
  (a.items||[]).forEach(it=>{
    w('| '+it.code+' '+it.name+' | '+(it.reviews||[]).join('、')+' | '+(it.tags||[]).map(t=>t.replace('TAG-','')).join('/')+' | '+(it.families||[]).join('/')+' | '+(it.kw||[]).length+' |');
  });
  w('');
});

/* 三、评分规则 */
w('## 三、评分规则（KB.score，100 分制）');
w('');
w('| Part | 名称 | 满分 | 评分项数 |');
w('|---|---|---|---|');
const partCnt={};
KB.score.rows.forEach(r=>{partCnt[r.part]=(partCnt[r.part]||0)+1;});
KB.score.parts.forEach(p=>{ w('| '+p.part+' | '+p.title+' | '+p.max+' | '+(partCnt[p.part]||0)+' |'); });
w('');
w('| 评分项 | 名称 | Part | 满分 | 类型 | 绑定方面 |');
w('|---|---|---|---|---|---|');
KB.score.rows.forEach(r=>{
  w('| '+r.id+' | '+(r.name||'')+' | '+r.part+' | '+r.max+' | '+r.type+' | '+(r.aspect||'—')+' |');
});
w('');

/* 四、整改标签 */
w('## 三·补、判定标准A（KB.rules，好坏判定与措施触发）');
w('');
w('> 这是「一个事项是好还是坏」的标尺。措施卡不再由关键词直接触发，而是：**五维打分 → 红灯扫描 → 结论阈值 → 方法族 → 措施卡**。');
w('');
w('**五维评分卡（各 0–3 分，满分 15）**');
w('');
w('| 码 | 维度 | 0 / 1 / 2 / 3 档 | 证据信号词 |');
w('|---|---|---|---|');
(R.fiveDims||[]).forEach(function(d){ w('| '+d.code+' | '+d.name+' | '+((d.anchors||[]).join(' ／ '))+' | '+((d.signals||[]).join('、'))+' |'); });
w('');
w('**红灯清单（'+R.redFlags.length+' 条，命中即一票否决并提为 P0）**');
w('');
w('| 码 | 红灯项 | 证据信号 |');
w('|---|---|---|');
R.redFlags.forEach(function(f){ w('| '+f.code+' | '+f.name+' | '+((f.signals||[]).join('、'))+' |'); });
w('');
w('**结论阈值**：亮点＝'+R.verdict.highlight.txt+'；不足＝'+R.verdict.problem.txt+'；待确认＝'+R.verdict.pending.txt+'。'+R.verdict.guard);
w('');
w('**方法族 → 措施卡（亮点 '+M.hl.length+' 类 / 不足 '+M.pb.length+' 类）**');
w('');
w('| 码 | 方法 | 触发特征 | 默认措施卡 |');
w('|---|---|---|---|');
M.hl.concat(M.pb).forEach(function(m){ w('| '+m.code+' | '+m.name+' | '+(m.when||'')+' | '+((m.acts||[]).join(' '))+' |'); });
w('');
w('**独立评价项（KB.evals）**');
w('');
w('| 评价项 | 关联评分项 | 关联子项 | 等级口径 |');
w('|---|---|---|---|');
(KB.evals||[]).forEach(function(e){ w('| '+e.name+' | '+(e.scoreItems||[]).join('、')+' | '+(e.dims||[]).join('、')+' | '+(e.levels||[]).map(function(l){return l.lv;}).join(' / ')+' |'); });
w('');
w('## 四、整改标签（8 分类，严格使用）');
w('');
w('| 代码 | 简写 | 名称 | 颜色 |');
w('|---|---|---|---|');
KB.tags.forEach(t=>{ w('| '+t.code+' | '+t.short+' | '+t.name+' | '+t.color+' |'); });
w('');

/* 五、措施卡 */
w('## 五、措施卡 ACT（旧版，共 '+Object.keys(ACT).length+' 张）');
w('');
w('> 每张卡字段：n 名称 / f 措施族 / grp 分组 / cy 周期 / df 难度 / pre 前置 / tr 触发条件 / st 步骤 / kf 关键 / ac 验收 / na 不适用情形。');
w('> **精简提示**：措施卡仅通过 aspects 的 families 字段被引用，未被任何子项引用的卡即为「悬空卡」，可优先清理。');
w('');
const byFam={};
Object.keys(ACT).forEach(k=>{ const f=ACT[k].f||'?'; (byFam[f]=byFam[f]||[]).push(k+' '+ACT[k].n); });
w('| 措施族 | 卡数 | 卡片 |');
w('|---|---|---|');
Object.keys(byFam).sort().forEach(f=>{
  w('| '+f+' | '+byFam[f].length+' | '+byFam[f].join('；')+' |');
});
w('');
// 悬空卡
const used=new Set();
KB.aspects.forEach(a=>(a.items||[]).forEach(it=>(it.families||[]).forEach(f=>used.add(f))));
const orphan=Object.keys(ACT).filter(k=>!used.has(ACT[k].f));
w('**悬空措施卡**（措施族未被任何审查子项引用，共 '+orphan.length+' 张）：'+(orphan.length?orphan.join('、'):'无'));
w('');

/* 六、知识包 */
w('## 六、知识包 KP（旧版，共 '+Object.keys(KP).length+' 条）');
w('');
w('> 每条字段：t 问题 / ind 行业 / d1 一级维度 / d2 二级维度 / dom 域 / scene 场景 / root 根因 / acts 措施组合 / kw 关键词。');
w('> **精简提示**：KP 为 v1 遗留经验库，当前引擎仅做关键词兜底匹配（IDX.kp），与四维审查体系并行存在，是重复度最高的部分。');
w('');
const byDom={};
Object.keys(KP).forEach(k=>{ const d=KP[k].dom||'?'; (byDom[d]=byDom[d]||[]).push(k); });
w('| 域 dom | 条数 | 示例 |');
w('|---|---|---|');
Object.keys(byDom).sort().forEach(d=>{
  w('| '+d+' | '+byDom[d].length+' | '+byDom[d].slice(0,3).map(k=>KP[k].t).join('；')+' |');
});
w('');
const byInd={};
Object.keys(KP).forEach(k=>{ const d=KP[k].ind||'?'; byInd[d]=(byInd[d]||0)+1; });
w('按行业分布：'+Object.keys(byInd).map(k=>k+' '+byInd[k]+' 条').join('；'));
w('');

/* 七、信息提取与优先级 */
w('## 七、信息提取信号与优先级规则');
w('');
w('- 客户需求信号词 '+KB.extract.need.pat.length+' 个：'+KB.extract.need.pat.join('、'));
w('- 痛点负面信号词 '+KB.extract.pain.neg.length+' 个：'+KB.extract.pain.neg.join('、'));
w('- 亮点正面信号词 '+KB.extract.hl.pos.length+' 个：'+KB.extract.hl.pos.join('、'));
w('- 紧急度·高 '+(KB.priority.urgency['高']||[]).length+' 词 / 中 '+(KB.priority.urgency['中']||[]).length+' 词 / 低 '+(KB.priority.urgency['低']||[]).length+' 词');
['5','4','3','2'].forEach(k=>{
  w('- 重要度★'+k+' 信号词 '+(KB.priority.stars[k]||[]).length+' 个：'+(KB.priority.stars[k]||[]).join('、'));
});
w('- 优先级矩阵：P0='+(Object.values(KB.priority.matrix).filter(x=>x.高==='P0'||x.中==='P0'||x.低==='P0').length)+' 格；交期 P0='+KB.priority.lead.P0+' 天 / P1='+KB.priority.lead.P1+' 天 / P2='+KB.priority.lead.P2+' 天 / P3='+KB.priority.lead.P3+' 天');
w('');

/* 八、写作要求 */
w('## 八、写作要求（KB.guide，'+(KB.guide||'').length+' 字）');
w('');
w('来源：《项目走访报告写作要求与技巧》，12 章 + 数据来源附录，随 MD 卷 04 导出。后台「写作要求」页签可整段替换。');
w('');

/* 八点五、覆盖度判定标准 */
const cv=KB.cover||{};
w('## 八·补、输入覆盖度判定标准（KB.cover，随 MD 卷 06 导出）');
w('');
w('- 判定规则：'+(cv.rule||''));
w('');
w('| 代码 | 名称 | 自动判定等级 | 必须补 | 说明 |');
w('|---|---|---|---|---|');
(cv.states||[]).forEach(s=>{ w('| '+s.code+' | '+s.name+' | '+(s.lv==null?'—':s.lv)+' | '+(s.must?'是':'否')+' | '+(s.note||'')+' |'); });
w('');
w('追问话术模板：');
Object.keys(cv.asks||{}).forEach(k=>{ w('- '+k+'：'+cv.asks[k]); });
w('');

/* 九、变更日志 */
w('## 九、变更日志（'+(KB.log||[]).length+' 条）');
w('');
w('| 版本 | 日期 | 说明 |');
w('|---|---|---|');
(KB.log||[]).forEach(l=>{ w('| '+l.v+' | '+l.d+' | '+l.m+' |'); });
w('');

fs.writeFileSync(path.join(__dirname,'..','知识库清单_v2.md'),L.join('\n'),'utf8');
console.log('written: 知识库清单_v2.md');
console.log('aspects:',KB.aspects.map(a=>a.code+':'+(a.items||[]).length).join(' '));
console.log('ACT:',Object.keys(ACT).length,'orphan:',orphan.length);
console.log('KP:',Object.keys(KP).length);
