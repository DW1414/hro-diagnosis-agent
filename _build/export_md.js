const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'知识库_v2_MD');
const FILE='file:///'+path.join(ROOT,'ops-diagnosis-agent.html').replace(/\\/g,'/');
(async()=>{
  if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
  const b=await chromium.launch({channel:'msedge',headless:true});
  const p=await b.newPage();
  await p.goto(FILE,{waitUntil:'load'});
  await p.waitForTimeout(300);
  const vols=await p.evaluate(()=>window.__diag.mdVols());
  vols.forEach(([name,txt])=>{
    fs.writeFileSync(path.join(OUT,name),txt,'utf8');
    console.log(name, txt.length+' 字');
  });
  // 附带两份说明文档
  const KB=await p.evaluate(()=>window.__diag.getKB());
  fs.writeFileSync(path.join(OUT,'_manifest.json'),JSON.stringify({
    kb:KB.meta, exported:new Date().toISOString(), count:vols.length,
    files:vols.map(v=>v[0])
  },null,2),'utf8');
  console.log('导出完成：'+vols.length+' 卷 -> '+OUT);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
