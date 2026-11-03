/* 导出知识库全量数据为 JSON（vm 直读种子，无需浏览器） */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const ctx={window:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'01_seed.js'),'utf8'),ctx);
const KB=ctx.window.__KB_SEED__;
const html=fs.readFileSync(path.join(ROOT,'ops-diagnosis-agent.html'),'utf8');
const m=html.match(/<script id="legacy-seed">([\s\S]*?)<\/script>/);
const c2={console};
vm.createContext(c2);
vm.runInContext(m[1]+'\n;__OUT__={ACT:typeof ACT!=="undefined"?ACT:{},KP:typeof KP!=="undefined"?KP:{}};',c2);
const {ACT,KP}=c2.__OUT__;
fs.writeFileSync(path.join(__dirname,'kb_dump.json'),JSON.stringify({KB:KB,ACT:ACT,KP:KP},null,1),'utf8');
console.log('dumped: aspects',KB.aspects.length,'score',KB.score.rows.length,'ACT',Object.keys(ACT).length,'KP',Object.keys(KP).length);
