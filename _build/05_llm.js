/* =========================================================================
   AI 增强模块 · 悬浮开关 + 融入报告版（可选外挂）
   —— 未配置任何接口时完全静默，智能体仍 100% 离线可用。
   —— 悬浮球（右下角 ✨）：点击打开配置面板；开关开启后，生成报告自动执行
      AI 辅助诊断，结果**直接写入诊断报告本体**（主人 2026-10-27 定：不再单独列出）：
        · 整改表「建议行动项」：知识库命中标「知识库」，AI 贴合改写原位替换并标「大模型」
        · 覆盖度面板追问：AI 补检结果标「大模型」（知识库原追问保留追溯）
        · 模块三总结：AI 归纳的「综合评估补充」卡片，标「大模型」
   —— 铁律：AI 只做补充 / 改写 / 归纳，绝不修改评分与判定结果（分数、等级、判定依据不动）。
   —— 隐私：默认自动脱敏，项目名 / 客户名 / 人名 / 电话 等发出前替换为占位符，返回后本地回填。
   ========================================================================= */
(function () {
  var D = window.__diag;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var toast = function (m) { if (D && D.toast) D.toast(m); };

  var KEY = 'opsdiag.llm';
  /* 2026-11-10 增：每家服务商配「普通对话 / 专业（深度推理）」两档模型预设，
     选档位自动填模型名；仍可手填任意模型名（选「自定义」档）。 */
  var PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek 深度求索', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      models: [{ m: 'deepseek-chat', n: 'V3 · 普通对话' }, { m: 'deepseek-reasoner', n: 'R1 · 深度推理' }],
      tip: 'platform.deepseek.com 申请密钥；V3 日常够用，复杂归纳可选 R1（更慢、更贵）' },
    { id: 'doubao', name: '豆包 · 火山方舟', url: 'https://ark.cn-beijing.volces.com/api/v3', model: 'ep-2024xxxxxxxx-xxxxx',
      models: [{ m: 'doubao-seed-1-6-250615', n: 'Seed 1.6 · 普通对话' }, { m: 'doubao-seed-1-6-thinking-250615', n: 'Seed 1.6 Thinking · 深度推理' }],
      tip: '可填模型 ID（以方舟控制台显示为准），也可填「推理接入点 ID」（ep- 开头）' },
    { id: 'kimi', name: 'Kimi · 月之暗面', url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k',
      models: [{ m: 'moonshot-v1-32k', n: 'v1-32k · 普通对话' }, { m: 'kimi-thinking-preview', n: 'K1.5 · 深度推理' }],
      tip: 'platform.moonshot.cn 申请；超长口述选 moonshot-v1-128k，K2 系列：kimi-k2-0905-preview' },
    { id: 'qwen', name: '通义千问 · 阿里云百炼', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus',
      models: [{ m: 'qwen-plus', n: 'Qwen-Plus · 普通对话' }, { m: 'qwq-plus', n: 'QwQ · 深度推理' }],
      tip: '百炼控制台申请；普通 qwen-plus / qwen-max，深度推理 qwq-plus' },
    { id: 'glm', name: '智谱 GLM', url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash',
      models: [{ m: 'glm-4-flash', n: 'GLM-4-Flash · 普通对话（免费）' }, { m: 'glm-z1-air', n: 'GLM-Z1-Air · 深度推理' }],
      tip: 'open.bigmodel.cn 申请；glm-4-flash 免费，深度推理选 Z1 系列' },
    { id: 'hunyuan', name: '腾讯混元', url: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbo',
      models: [{ m: 'hunyuan-turbo', n: 'Turbo · 普通对话' }, { m: 'hunyuan-t1-latest', n: 'T1 · 深度推理' }],
      tip: '腾讯云控制台申请；模型名以控制台模型列表页显示为准' },
    { id: 'ollama', name: '本机 Ollama（数据不出网）', url: 'http://localhost:11434/v1', model: 'qwen2.5:7b',
      models: [{ m: 'qwen2.5:7b', n: 'Qwen2.5 7B · 普通对话' }, { m: 'deepseek-r1:14b', n: 'DeepSeek-R1 14B · 深度推理' }],
      tip: '先 ollama pull 对应模型；需设置环境变量 OLLAMA_ORIGINS=* 并重启 Ollama，否则浏览器跨域被拦' },
    { id: 'custom', name: '自定义 / 自建网关', url: '', model: '',
      tip: 'One-API、New-API、Nginx 反代等 OpenAI 兼容网关，填到 /v1 为止；模型名手填' }
  ];
  var DEF = { on: false, pid: 'deepseek', base: 'https://api.deepseek.com/v1', key: '', model: 'deepseek-chat',
              temp: 0.3, timeout: 60, mask: true };
  var AIR = { gap: {}, rw: {}, sum: '' };   /* AI 融合结果缓存（页面内存，刷新即清） */

  /* ---------------- 配置读写 ---------------- */
  function cfg() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    c = c || {};
    for (var k in DEF) if (!(k in c)) c[k] = DEF[k];
    return c;
  }
  function saveCfg(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} paintFab(); }
  function clearKey() { var c = cfg(); c.key = ''; c.on = false; saveCfg(c); }

  /* ---------------- 脱敏 / 回填 ---------------- */
  var GENERIC = /^(项目|生产|运营|人事|行政|客户|销售|招聘|品质|质量|仓储|物流|采购|财务|安全|设备|工艺|计划|客服|综合|制造|工程|技术|该|本|贵|我司|我方|公司|工厂)/;
  function buildDict(text) {
    var m = [], seen = {}, inp = D.input ? D.input() : {};
    function add(real, ph) {
      if (!real || seen[real] || real.length < 2) return;
      seen[real] = 1; m.push([real, ph]);
    }
    if (inp.name && inp.name !== '未命名项目') add(inp.name, '【项目】');
    (text.match(/1[3-9]\d{9}/g) || []).forEach(function (x) { add(x, '【电话】'); });
    (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).forEach(function (x) { add(x, '【邮箱】'); });
    (text.match(/\b\d{17}[\dXx]\b/g) || []).forEach(function (x) { add(x, '【证件号】'); });
    var re1 = /[一-龥A-Za-z0-9（）()·]{2,16}(?:有限公司|股份有限公司|有限责任公司|集团公司|分公司|公司|工厂|厂区|园区|产业园|基地|项目部)/g;
    (text.match(re1) || []).forEach(function (x) {
      if (GENERIC.test(x) || x.length < 4) return;
      add(x.replace(/^(?:在|与|和|给|为|由|从|对|把|被)/, ''), '【客户】');
    });
    var re2 = /[一-龥]{1,3}(?:经理|主管|总监|厂长|主任|班长|组长|工程师|专员|顾问|总经理|副总)/g;
    (text.match(re2) || []).forEach(function (x) {
      if (GENERIC.test(x)) return;
      add(x, '【人名】');
    });
    m.sort(function (a, b) { return b[0].length - a[0].length; });
    return m;
  }
  function mask(s) {
    var c = cfg();
    if (!c.mask) return { text: s, map: [] };
    var map = buildDict(String(s || '')), t = String(s || '');
    map.forEach(function (p) { t = t.split(p[0]).join(p[1]); });
    return { text: t, map: map };
  }
  function unmask(s, map) {
    var t = String(s == null ? '' : s);
    (map || []).forEach(function (p) { t = t.split(p[1]).join(p[0]); });
    return t;
  }

  /* ---------------- 请求 ---------------- */
  function endpoint(base) {
    var b = String(base || '').replace(/\/+$/, '');
    if (!b) return '';
    if (/\/chat\/completions$/.test(b)) return b;
    return b + '/chat/completions';
  }
  function normErr(e, c) {
    var st = e && e.status, msg = (e && e.message) || '';
    if (e && e.name === 'AbortError') return { code: 'TIMEOUT', msg: '请求超时（' + (c.timeout || 60) + ' 秒）。可调大超时，或换一个更快的模型。' };
    if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(msg))
      return { code: 'CORS', msg: '连不上接口地址。最常见是<b>浏览器跨域（CORS）被拦截</b>——官方端点大多不允许网页直连。'
        + '解法：① 双击运行附带的 <b>llm_proxy.py</b> 本地代理，再把接口地址填成 http://127.0.0.1:8787/v1；'
        + '② 或改用允许跨域的自建网关（One-API / New-API）；③ 检查地址是否填错、网络是否通畅。' };
    if (st === 401) return { code: '401', msg: '密钥无效或已过期（401），请重新填写 API Key。' };
    if (st === 403) return { code: '403', msg: '无访问权限（403）：密钥权限不足，或该网关未放行此模型。' };
    if (st === 404) return { code: '404', msg: '接口地址或模型名不存在（404）。注意火山方舟的模型名须填 ep- 开头的推理接入点 ID。' };
    if (st === 429) return { code: '429', msg: '触发限流（429），请稍后重试或减少单次批量数量。' };
    if (st >= 500) return { code: '5XX', msg: '模型服务端错误（' + st + '），请稍后重试。' };
    return { code: 'ERR', msg: msg || '未知错误' };
  }
  function chat(sys, user) {
    var c = cfg();
    if (!c.on) return Promise.reject({ code: 'OFF', msg: 'AI 增强未开启：点右下角 ✨ 悬浮球，打开开关并填写接口信息。' });
    if (!c.base || !c.key || !c.model)
      return Promise.reject({ code: 'CFG', msg: '接口信息不完整：请填写接口地址、API Key 与模型名。' });
    var url = endpoint(c.base);
    var ctrl = (window.AbortController) ? new AbortController() : null;
    var tid = setTimeout(function () { if (ctrl) ctrl.abort(); }, (Number(c.timeout) || 60) * 1000);
    var opt = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify({
        model: c.model, temperature: Number(c.temp) || 0.3, stream: false,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
      })
    };
    if (ctrl) opt.signal = ctrl.signal;
    fabRun(true);
    return fetch(url, opt).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }).then(function (j) {
      var t = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      t = String(t).trim();
      if (!t) { var e2 = new Error('模型返回内容为空'); e2.status = 0; throw e2; }
      return t;
    }).catch(function (e) {
      if (e && e.code) throw e;
      throw normErr(e, c);
    }).then(function (t) { clearTimeout(tid); fabRun(false); return t; },
            function (e) { clearTimeout(tid); fabRun(false); throw e; });
  }
  function jsonOf(txt) {
    var s = String(txt || '').trim(), m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) s = m[1].trim();
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '\n…（原文后续省略）' : s; }
  function copyText(s) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(s); toast('已复制'); return; }
    } catch (e) {}
    try {
      var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制');
    } catch (e2) { toast('复制失败，请手动选择'); }
  }

  /* ---------------- 悬浮球与抽屉 ---------------- */
  function ensureUI() {
    if ($('aiFab')) return;
    var st = document.createElement('style');
    st.textContent = ''
      + '#aiFab{position:fixed;right:16px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:99997;'
      + 'width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;'
      + 'cursor:pointer;background:rgba(12,22,34,.9);border:1px solid rgba(232,197,132,.35);'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.4);opacity:.78;transition:all .18s}'
      + '#aiFab:hover{opacity:1;transform:scale(1.07)}'
      + '#aiFab.on{background:linear-gradient(135deg,#e8c584,#f6e2b8);border-color:#e8c584}'
      + '#aiFab.on::after{content:"";position:absolute;top:1px;right:1px;width:10px;height:10px;border-radius:50%;'
      + 'background:#4ee3a0;border:2px solid #0b1622}'
      + '#aiFab.running{animation:aipulse 1.2s infinite}'
      + /* 2026-11-12 增：AI 问答悬浮球（✨ 球上方，问字金底，字样同步左上角 logo：20px 加粗金渐变） */
      '#aiAskFab{position:fixed;right:16px;bottom:calc(116px + env(safe-area-inset-bottom,0px));z-index:99997;'
      + 'width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
      + 'cursor:pointer;font-size:20px;font-weight:700;color:#1b2430;'
      + 'background:linear-gradient(140deg,var(--gold2),var(--gold));border:0;'
      + 'box-shadow:0 10px 26px rgba(232,197,132,.3);opacity:.92;transition:all .18s}'
      + '#aiAskFab:hover{opacity:1;transform:scale(1.07)}'
      + /* 2026-11-12 增：AI 未开启时的居中提示卡（不自动弹右侧抽屉，主人定） */
      '#aiNeedCard{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(3,8,14,.55)}'
      + '.ancBox{background:#0b1622;border:1px solid rgba(232,197,132,.4);border-radius:16px;padding:24px 28px;'
      + 'max-width:380px;color:#f4f7ff;font-size:13px;line-height:1.8;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.5)}'
      + '.ancBox b{font-size:14.5px;color:#f6e2b8;display:block;margin-bottom:8px}'
      + '.ancBox div{color:#c8d6e8;font-size:12px}'
      + '.ancBtn{border:1px solid rgba(232,197,132,.5);background:linear-gradient(135deg,#e8c584,#f6e2b8);color:#0b1622;'
      + 'border-radius:10px;padding:8px 18px;font-size:12.5px;cursor:pointer}'
      + '.ancBtn.gh{background:rgba(255,255,255,.06);color:#c8d6e8;border-color:rgba(255,255,255,.16)}'
      + '@keyframes aipulse{0%,100%{box-shadow:0 0 0 0 rgba(232,197,132,.55)}50%{box-shadow:0 0 0 12px rgba(232,197,132,0)}}'
      + /* 2026-11-10 增：AI 调用中的大动画（右下角约 1/4 页面，主人的要求——醒目） */
      '#aiGlow{position:fixed;right:0;bottom:0;width:min(56vmin,580px);height:min(56vmin,580px);'
      + 'z-index:99996;pointer-events:none;display:none}'
      + '#aiGlow.on{display:block}'
      + '#aiGlow .g1{position:absolute;inset:0;'
      + 'background:radial-gradient(circle at 94% 94%, rgba(232,197,132,.30) 0%, rgba(232,197,132,.13) 34%, rgba(232,197,132,0) 64%);'
      + 'animation:aiGlowB 1.5s ease-in-out infinite}'
      + '#aiGlow .g2,#aiGlow .g3{position:absolute;right:38px;bottom:calc(86px + env(safe-area-inset-bottom,0px));'
      + 'width:24px;height:24px;border-radius:50%;border:2px solid rgba(232,197,132,.75);'
      + 'transform:translate(50%,50%) scale(1);animation:aiRing 2s ease-out infinite}'
      + '#aiGlow .g3{animation-delay:1s}'
      + '#aiGlow .gtxt{position:absolute;right:74px;bottom:calc(98px + env(safe-area-inset-bottom,0px));'
      + 'font-size:13px;color:#f6e2b8;background:rgba(12,22,34,.9);border:1px solid rgba(232,197,132,.4);'
      + 'border-radius:99px;padding:6px 14px;box-shadow:0 4px 18px rgba(0,0,0,.45);white-space:nowrap}'
      + '#aiGlow .gtxt b{font-weight:600;animation:aiGlowB 1.5s ease-in-out infinite}'
      + '#aiGlow .gtxt span{display:inline-block;animation:aiDot 1.2s infinite}'
      + '#aiGlow .gtxt .d2{animation-delay:.2s}#aiGlow .gtxt .d3{animation-delay:.4s}'
      + '@keyframes aiGlowB{0%,100%{opacity:.55}50%{opacity:1}}'
      + '@keyframes aiRing{0%{transform:translate(50%,50%) scale(1);opacity:.75}'
      + '100%{transform:translate(50%,50%) scale(26);opacity:0}}'
      + '@keyframes aiDot{0%,100%{opacity:.15}50%{opacity:1}}'
      + '#aiDrawer{position:fixed;inset:0;z-index:9999;display:none}'
      + '#aiDrawer.on{display:block}'
      + '#aidMask{position:absolute;inset:0;background:rgba(3,8,14,.62);backdrop-filter:blur(2px)}'
      + '#aidPanel{position:absolute;top:0;right:0;height:100%;width:min(520px,100%);background:#0b1622;'
      + 'border-left:1px solid rgba(232,197,132,.24);box-shadow:-24px 0 60px rgba(0,0,0,.5);display:flex;flex-direction:column;'
      + 'animation:aidIn .22s ease-out}'
      + '@keyframes aidIn{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}'
      + '#aidHead{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);flex:0 0 auto}'
      + '#aidHead b{font-size:14px;color:#f4f7ff;flex:1}'
      + '#aidClose{background:none;border:0;color:#9aabc4;font-size:22px;cursor:pointer;line-height:1;padding:0 4px}'
      + '#aidClose:hover{color:#e8c584}'
      + '#aidBody{flex:1;overflow-y:auto;padding:14px 16px 26px;font-size:12.5px;line-height:1.75;color:#dbe5f2}'
      + '.aidCard{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:11px 13px;margin-bottom:10px;background:rgba(255,255,255,.035)}'
      + '.aidCard h5{margin:0 0 6px;font-size:12.5px;color:#f4f7ff}'
      + '.aidCard .lb{color:#e8c584;font-weight:600}'
      + '.aidBtn{border:1px solid rgba(232,197,132,.4);background:rgba(232,197,132,.12);color:#f6e2b8;border-radius:9px;'
      + 'padding:5px 11px;font-size:11.5px;cursor:pointer}'
      + '.aidBtn:hover{background:rgba(232,197,132,.22)}'
      + '.aidBtn.gh{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#c8d6e8}'
      + '.aidHint{font-size:11px;color:#7f92aa;line-height:1.7;margin-top:8px}'
      + '.aidField{margin-bottom:9px}'
      + '.aidField label{display:block;font-size:11.5px;color:#9fb0c2;margin-bottom:4px}'
      + '.aidField input,.aidField select{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;'
      + 'border:1px solid rgba(232,197,132,.24);background:rgba(6,16,24,.8);color:#f4f7ff;font-size:12.5px;outline:none}'
      + '.aidField input:focus,.aidField select:focus{border-color:#e8c584}'
      + '.aidRow2{display:grid;grid-template-columns:1fr 1fr;gap:9px}'
      + '.aidSwitch{display:flex;align-items:center;gap:10px;padding:12px 13px;border-radius:12px;'
      + 'border:1px solid rgba(232,197,132,.3);background:rgba(232,197,132,.07);margin-bottom:12px}'
      + '.aidSwitch b{color:#f4f7ff;font-size:13px;flex:1}'
      + '.aidSwitch input[type=checkbox]{width:40px;height:22px;appearance:none;-webkit-appearance:none;border-radius:99px;'
      + 'background:rgba(255,255,255,.14);position:relative;cursor:pointer;outline:none;transition:background .2s;flex:0 0 auto}'
      + '.aidSwitch input[type=checkbox]::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;'
      + 'border-radius:50%;background:#9aabc4;transition:all .2s}'
      + '.aidSwitch input[type=checkbox]:checked{background:rgba(232,197,132,.5)}'
      + '.aidSwitch input[type=checkbox]:checked::after{left:20px;background:#f6e2b8}'
      + '#aidAsk{width:100%;min-height:76px;border-radius:11px;border:1px solid rgba(232,197,132,.26);background:rgba(6,16,24,.8);'
      + 'color:#f4f7ff;font-size:12.5px;padding:9px 11px;outline:none;resize:vertical;box-sizing:border-box}'
      + /* 出处标签：覆盖度面板（深色） */
      '.cvTag{display:inline-block;font-size:10px;padding:0 7px;border-radius:99px;margin-right:6px;vertical-align:1px}'
      + '.cvTag.kb{background:rgba(232,197,132,.12);color:#e8c584;border:1px solid rgba(232,197,132,.3)}'
      + '.cvTag.ai{background:rgba(126,179,255,.14);color:#7eb3ff;border:1px solid rgba(126,179,255,.35)}'
      + /* 出处标签：报告（白底，打印可见） */
      '.srcTag{display:inline-block;font-size:10px;padding:0 6px;border-radius:99px;margin-right:5px;vertical-align:1px;font-weight:400}'
      + '.srcTag.kb{background:#f0e9da;color:#8b6412;border:1px solid #d8c9a5}'
      + '.srcTag.ai{background:#e8f1fb;color:#1f5c99;border:1px solid #b9d3ea}'
      + '.aiSumBox{border:1px solid #b9d3ea;background:#f3f8fd;border-radius:10px;padding:10px 13px;margin-top:12px;'
      + 'font-size:12px;color:#1b2430;line-height:1.85}'
      + '.aiSumBox h6{margin:0 0 6px;font-size:12.5px;color:#1f5c99}'
      + '@media print{#aiDrawer,#aiFab,#aiAskFab,#aiGlow{display:none!important}}';
    document.head.appendChild(st);
    var fab = document.createElement('div');
    fab.id = 'aiFab'; fab.title = 'AI 增强（点击配置）'; fab.textContent = '✨';
    fab.addEventListener('click', openConfig);
    document.body.appendChild(fab);
    /* 主人 2026-11-12 定：AI 问答悬浮球（✨ 球上方），点击直接进入问答，随时可问 */
    var qf = document.createElement('div');
    qf.id = 'aiAskFab'; qf.title = 'AI 问答：随时提问，回答可并入补充信息参与诊断'; qf.textContent = '问';
    qf.addEventListener('click', aiAsk);
    document.body.appendChild(qf);
    /* 2026-11-10 增：AI 调用中的大动画层（右下角 1/4 页面） */
    var glow = document.createElement('div');
    glow.id = 'aiGlow';
    glow.innerHTML = '<div class="g1"></div><div class="g2"></div><div class="g3"></div>'
      + '<div class="gtxt"><b>✨ AI 分析中</b><span class="d1">·</span><span class="d2">·</span><span class="d3">·</span></div>';
    document.body.appendChild(glow);
    var d = document.createElement('div');
    d.id = 'aiDrawer';
    d.innerHTML = '<div id="aidMask"></div><div id="aidPanel">'
      + '<div id="aidHead"><b id="aidTitle">✨ AI 增强</b><button id="aidClose" type="button" title="关闭">×</button></div>'
      + '<div id="aidBody"></div></div>';
    document.body.appendChild(d);
    $('aidClose').addEventListener('click', closeDrawer);
    $('aidMask').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    paintFab();
  }
  function paintFab() {
    var f = $('aiFab'); if (!f) return;
    var c = cfg();
    f.classList.toggle('on', !!c.on);
    f.title = c.on ? 'AI 增强：已开启（生成报告自动融入 AI 建议）' : 'AI 增强：未开启（点击配置）';
  }
  function fabRun(v) {
    var f = $('aiFab'); if (f) f.classList.toggle('running', !!v);
    var g = $('aiGlow'); if (g) g.classList.toggle('on', !!v);   /* 大动画同步亮起 */
  }
  function drawer(title) {
    ensureUI();
    $('aidTitle').textContent = title;
    $('aiDrawer').classList.add('on');
    var b = $('aidBody'); b.innerHTML = '';
    b.scrollTop = 0;
    return b;
  }
  function closeDrawer() { var d = $('aiDrawer'); if (d) d.classList.remove('on'); }
  function errBox(b, e) {
    b.insertAdjacentHTML('beforeend', '<div class="aidCard" style="border-color:rgba(255,107,136,.4)">'
      + '<h5 style="color:#ff8fa3">调用失败' + (e && e.code ? '（' + esc(e.code) + '）' : '') + '</h5>'
      + '<div>' + (e && e.msg ? e.msg : esc(String(e))) + '</div></div>');
  }
  function footNote(b) {
    var c = cfg();
    b.insertAdjacentHTML('beforeend', '<div class="aidHint">'
      + (c.mask ? '🔒 已自动脱敏：项目名 / 客户名 / 人名 / 电话 等替换为占位符后发送，结果在本地还原'
                : '⚠️ 自动脱敏已关闭，原始内容已原样发送')
      + '　·　模型：' + esc(c.model || '—') + '<br/>'
      + 'AI 输出仅供参考，需人工复核后采用；评分与判定结果不受 AI 影响。</div>');
  }
  var R_TEXT = '';
  function setRptTag(suffix) {
    var rt = $('rptTag'); if (!rt || !R_TEXT) return;
    var base = R_TEXT.replace(/\s*·\s*(?:AI 增强中…|已融合 AI 建议)\s*$/, '');
    rt.textContent = suffix ? base + ' · ' + suffix : base;
  }

  /* ---------------- 配置面板（悬浮球入口，不进管理员后台） ---------------- */
  function openConfig() {
    ensureUI();
    var c = cfg();
    var b = drawer('✨ AI 增强 · 接入配置');
    var opts = PROVIDERS.map(function (p) {
      return '<option value="' + p.id + '"' + (c.pid === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    var cur = null;
    PROVIDERS.forEach(function (p) { if (p.id === c.pid) cur = p; });
    b.innerHTML = ''
      + '<div class="aidSwitch"><b>接入大模型增强'
      + '<div style="font-weight:400;font-size:11px;color:#9fb0c2;margin-top:2px">开启后：生成报告时自动结合知识库与大模型，把贴合项目的建议、改写与归纳直接写入诊断报告</div></b>'
      + '<input type="checkbox" id="aiOn" ' + (c.on ? 'checked' : '') + ' /></div>'
      + '<div class="aidField"><label>服务商预设</label><select id="aiPid">' + opts + '</select></div>'
      + '<div class="aidField" id="aiTierField"><label>模型档位（普通 / 专业）</label><select id="aiTier"></select></div>'
      + '<div class="aidRow2">'
      + '<div class="aidField"><label>模型名</label><input id="aiModel" value="' + esc(c.model) + '" placeholder="如 deepseek-chat" /></div>'
      + '<div class="aidField"><label>温度（0-1，越低越稳）</label><input id="aiTemp" value="' + esc(c.temp) + '" /></div>'
      + '</div>'
      + '<div class="aidField"><label>接口地址（Base URL）</label><input id="aiBase" value="' + esc(c.base) + '" placeholder="https://api.deepseek.com/v1" /></div>'
      + '<div class="aidRow2">'
      + '<div class="aidField"><label>API Key</label><input id="aiKey" type="password" value="' + esc(c.key) + '" placeholder="sk-…" /></div>'
      + '<div class="aidField"><label>超时（秒）</label><input id="aiTimeout" value="' + esc(c.timeout) + '" /></div>'
      + '</div>'
      + '<div class="aidField"><label style="display:flex;align-items:center;gap:6px;cursor:pointer">'
      + '<input type="checkbox" id="aiMask" ' + (c.mask ? 'checked' : '') + ' style="width:auto" /> 发送前自动脱敏（强烈推荐）</label></div>'
      + '<div style="font-size:11.5px;color:#7f92aa;margin:2px 0 10px">💡 ' + esc(cur ? cur.tip : '选择服务商后自动填入地址与模型名') + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">'
      + '<button class="aidBtn" id="aiTest" type="button">测试连接</button>'
      + '<button class="aidBtn" id="aiSave" type="button">保存配置</button>'
      + '<button class="aidBtn gh" id="aiForget" type="button">忘记密钥</button>'
      + '<button class="aidBtn gh" id="aiNow" type="button">立即诊断</button>'
      + '</div>'
      + '<span id="aiState" style="font-size:11.5px;color:#7f92aa"></span>'
      + '<div class="aidHint" style="margin-top:10px">'
      + '<b style="color:#e8c584">跨域（CORS）提示：</b>浏览器直连官方 API 通常被拦。解法：① 双击运行同目录 <b>llm_proxy.py</b> 本地代理，'
      + '接口地址填 http://127.0.0.1:8787/v1；② 自建网关（One-API / New-API）；③ 本机 Ollama（需 OLLAMA_ORIGINS=*）。<br/>'
      + '<b style="color:#e8c584">隐私：</b>开启自动脱敏后，项目名 / 客户名 / 人名 / 电话 等发送前替换为占位符；'
      + 'API Key 仅存本机浏览器，不随页面分享。</div>';

    /* 档位下拉：随服务商重建；当前模型名能对上预设就选中，对不上落「自定义」 */
    function paintTier(p, selVal) {
      var t = $('aiTier'), fd = $('aiTierField');
      if (!t || !fd) return;
      var arr = (p && p.models) || [];
      fd.style.display = arr.length ? '' : 'none';
      t.innerHTML = arr.map(function (m) {
        return '<option value="' + esc(m.m) + '">' + esc(m.n) + '（' + esc(m.m) + '）</option>';
      }).join('') + '<option value="__custom__">自定义（手填模型名）</option>';
      t.value = selVal || '__custom__';
      if (t.selectedIndex < 0) t.value = '__custom__';
    }
    function prov(id) { var r = null; PROVIDERS.forEach(function (x) { if (x.id === id) r = x; }); return r; }
    paintTier(cur, (function () {
      var hit = '__custom__';
      ((cur && cur.models) || []).forEach(function (m) { if (m.m === c.model) hit = m.m; });
      return hit;
    })());
    $('aiPid').addEventListener('change', function () {
      var p = prov(this.value);
      if (!p) return;
      if (p.url) $('aiBase').value = p.url;
      var m0 = (p.models && p.models.length) ? p.models[0].m : (p.model || '');
      $('aiModel').value = m0;
      paintTier(p, m0 || '__custom__');
      $('aiState').textContent = p.tip || '';
    });
    $('aiTier').addEventListener('change', function () {
      if (this.value !== '__custom__') $('aiModel').value = this.value;
    });
    $('aiSave').addEventListener('click', function () {
      var c2 = cfg();
      c2.on = $('aiOn').checked; c2.mask = $('aiMask').checked;
      c2.pid = $('aiPid').value;
      c2.base = ($('aiBase').value || '').trim();
      c2.key = ($('aiKey').value || '').trim();
      c2.model = ($('aiModel').value || '').trim();
      c2.temp = Number($('aiTemp').value || 0.3);
      c2.timeout = Number($('aiTimeout').value || 60);
      saveCfg(c2);
      $('aiState').textContent = '已保存到本机' + (c2.on ? '（已开启：生成报告时自动融入 AI 建议）' : '（未开启）');
    });
    $('aiOn').addEventListener('change', function () {
      var c2 = cfg();
      c2.on = this.checked;
      saveCfg(c2);
      if (c2.on) {
        if (!c2.key || !c2.base || !c2.model) $('aiState').textContent = '已开启，但接口信息未填全，请填写并保存';
        else if (D.getR()) { toast('AI 已开启，正在把大模型建议融入当前报告…'); autoDiagnose(); }
        else $('aiState').textContent = '已开启：下次生成报告时自动融入 AI 建议';
      }
    });
    $('aiTest').addEventListener('click', function () {
      var c2 = cfg();
      c2.on = true;   /* 测试按启用处理 */
      c2.base = ($('aiBase').value || '').trim();
      c2.key = ($('aiKey').value || '').trim();
      c2.model = ($('aiModel').value || '').trim();
      if (!c2.base || !c2.key || !c2.model) { $('aiState').textContent = '请先填全 接口地址 / API Key / 模型名'; return; }
      saveCfg(c2);   /* 测试即按当前表单值落盘，避免未保存导致调用被拦 */
      $('aiState').textContent = '正在测试…';
      chat('你是一个简洁的助手。', '只回复两个字：正常').then(function (t) {
        $('aiState').textContent = '✅ 连接成功，模型回复：' + String(t).slice(0, 20);
      }).catch(function (e) {
        $('aiState').innerHTML = '❌ ' + (e.code ? '[' + e.code + '] ' : '') + e.msg;
      });
    });
    $('aiForget').addEventListener('click', function () {
      clearKey();
      var k = $('aiKey'); if (k) k.value = '';
      var o = $('aiOn'); if (o) o.checked = false;
      $('aiState').textContent = '已清除本机密钥并停用 AI';
    });
    $('aiNow').addEventListener('click', function () {
      var c2 = cfg();
      if (!c2.on) { $('aiState').textContent = '请先打开顶部开关'; return; }
      if (!D.getR()) { $('aiState').textContent = '请先生成诊断报告，再融合 AI 建议'; return; }
      autoDiagnose();
    });
  }

  /* ---------------- 功能一：缺口补检（结果直接写进覆盖度面板） ---------------- */
  var GAP_SYS = '你是制造业 / 服务业外包（HRO）项目的运营诊断顾问，擅长从项目走访口述里挖出被漏掉的管理事实。\n'
    + '现在给你：① 某项目的走访口述与补充信息原文（已脱敏，可能截断）；② 若干「覆盖度检查未命中」的审查子项（含审查要点）。\n'
    + '请逐项判断并给出可执行建议。严格要求：\n'
    + '1. 只依据给定原文，绝不臆造事实、数据、时间、人名；\n'
    + '2. 原文里若真有相关线索，clue 填原句（≤2 句，照抄，不要改写）；\n'
    + '3. ask 给 1 条可直接拿去问项目经理的问题，必须具体到「问事实 / 问数据 / 问机制」，不要问「有没有」这种能靠猜的问题；\n'
    + '4. 原文完全没有相关信息时，has 填 false，clue 填空，ask 仍给追问问题，evidence 给取证建议（找什么资料、问谁、看什么记录）；\n'
    + '5. 只输出 JSON，不要任何解释文字。\n'
    + '格式：{"items":[{"code":"子项编码","has":true/false,"clue":"原句或空","ask":"追问问题","evidence":"取证建议"}]}';
  function gapPrompt(rows, raw) {
    var its = rows.map(function (r) {
      return '- 编码：' + r.code + '｜子项：' + r.name + '｜所属：' + (r.aspectName || '') + '｜当前状态：' + (r.st || '')
        + '｜审查要点：' + (r.ask || '—');
    }).join('\n');
    return '【项目走访原文（已脱敏）】\n' + raw + '\n\n【待补检的子项】\n' + its
      + '\n\n请按要求逐项输出 JSON。';
  }
  function gapRows() {
    var CV = D.cover();
    if (!CV || !CV.rows || !CV.rows.length) return [];
    return CV.rows.filter(function (r) { return r.st !== 'FULL' && r.st !== 'NA'; }).slice(0, 12);
  }

  /* ---------------- 功能二：措施贴合改写 + 综合归纳（合并一次调用） ---------------- */
  var RW_SYS = '你是 HRO（人力资源外包 / 制造业与服务业产线外包）项目的整改顾问，熟悉现场管理、人员服务、招聘交付、IT 应用四类整改场景。\n'
    + '给你一个项目的多条整改事项（含知识库标准措施卡与现场原话，已脱敏）。\n'
    + '请逐条把标准措施改写为「贴合本项目实际情况」的行动项，并给出整体归纳。严格要求：\n'
    + '1. 有标准措施卡的：保留核心动作与验收标准，不得弱化、不得删除关键动作；\n'
    + '2. 知识库无措施卡（标注「措施待补充」）的事项：直接给出一版贴合项目实际的建议方案（行动项 + 验收标准），'
    + '不要留空、不要只复述「措施待补充」；依据现场原话与同场景通行做法给建议，原文没有的信息不编造，不足处用「待现场确认」占位；\n'
    + '3. 结合项目实际场景（行业、岗位、人数、现场情况）具体化，禁止「加强管理」「提高意识」这类空话；\n'
    + '4. 每条事项输出 1-2 个行动项，act（≤40 字，带可执行动作与责任指向）、accept（验收标准，≤30 字，可核查）；\n'
    + '5. summary：结合全部事项与原文，输出 150-250 字的项目综合评估补充——归纳管理短板的共性、点出改善主线与优先顺序，语言与正式诊断报告一致，不要空话；\n'
    + '6. 只输出 JSON：{"fixes":[{"i":事项序号,"items":[{"act":"…","accept":"…"}]}],"summary":"…"}，按传入顺序，不要解释文字。';
  function rwPrompt(fixes) {
    var meta = D.meta() || {}, inp = D.input();
    var its = fixes.map(function (f, i) {
      var a = (f.primary && f.primary.act && f.primary.act.act) || null;
      return '【事项 ' + i + '】' + (f.thing || '')
        + '\n维度：' + (f.dim + ' ' + (f.dimName || '')) + '；优先级：' + (f.pri || '')
        + '\n现场原话：' + ((f.evidence || []).slice(0, 2).join(' / ') || '—')
        + '\n标准措施卡：' + (a ? ((a.n || '') + '｜步骤：' + (a.st || '—') + '｜关键：' + (a.kf || '—') + '｜验收：' + (a.ac || '—'))
                                : '（措施待补充——知识库无对应措施卡，请直接给出一版贴合本项目的建议方案）');
    }).join('\n\n');
    return '【项目背景】类型：' + (inp.type || meta.type || '—') + '；项目名：' + (inp.name || meta.name || '—') + '\n'
      + '【走访原文节选（已脱敏）】\n' + clip(D.rawText(), 3000) + '\n\n【整改事项清单】\n' + its
      + '\n\n请逐条输出贴合本项目的行动项，并给出 summary，按 JSON 输出。';
  }

  /* ---------------- 融入报告：原位替换（主人 2026-10-27 定） ---------------- */
  function aiGapFor(code) { return (AIR.gap && AIR.gap[code]) || null; }
  function applyToReport() {
    var doc = $('doc'); if (!doc) return;
    var fixes = D.fixes() || [];
    /* 1) 整改表：AI 改写原位替换「建议行动项」，标「大模型」，知识库原措施保留追溯 */
    Object.keys(AIR.rw || {}).forEach(function (k) {
      var i = Number(k), row = doc.querySelector('tr[data-fx="' + i + '"]');
      var it = AIR.rw[k], f = fixes[i];
      if (!row || !it || !it.items || !it.items.length) return;
      var td = row.children[2]; if (!td) return;
      var h = '<span class="srcTag ai">大模型</span>';
      it.items.forEach(function (x) {
        h += '<div style="margin-top:2px"><b>' + esc(unmask(x.act || '', it._map || [])) + '</b></div>'
           + '<div style="font-size:11.5px;color:#244a6b;margin-top:1px">验收：' + esc(unmask(x.accept || '', it._map || [])) + '</div>';
      });
      var a = (f && f.primary && f.primary.act && f.primary.act.act) || null;
      h += '<div style="font-size:10.5px;color:#8b96a3;margin-top:3px">'
         + (a
            ? '<span class="srcTag kb">知识库</span>原措施：' + esc(a.n) + '（保留追溯）'
            : '<span class="srcTag kb">知识库</span>暂无对应措施卡（措施库缺口）· 本条为 AI 建议方案（需人工复核）')
         + '</div>';
      td.innerHTML = h;
    });
    /* 2) 模块三总结：AI 归纳补充 */
    var box = doc.querySelector('#aiSumBox');
    if (box && AIR.sum) {
      box.innerHTML = '<div class="aiSumBox"><h6><span class="srcTag ai">大模型</span>综合评估补充（AI 归纳 · 需人工复核）</h6>'
        + esc(AIR.sum).replace(/\n/g, '<br/>') + '</div>';
    }
  }
  function errDrawer(e) {
    var b = drawer('✨ AI 增强 · 调用失败');
    errBox(b, e); footNote(b);
  }

  /* ---------------- 自动诊断主流程（静默融入报告，不弹结果窗） ---------------- */
  function autoDiagnose() {
    var c = cfg();
    if (!c.on) { toast('AI 增强未开启：点右下角 ✨ 打开开关'); return; }
    if (!D.getR()) { toast('请先生成诊断报告'); return; }
    if (!$('rptTag')) return;
    R_TEXT = $('rptTag').textContent;
    setRptTag('AI 增强中…');
    AIR = { gap: {}, rw: {}, sum: '' };

    var rows = gapRows();
    var p1 = rows.length
      ? (function () {
          var mk = mask(clip(D.rawText(), 6000));
          return chat(GAP_SYS, gapPrompt(rows, mk.text)).then(function (t) {
            var obj = jsonOf(t) || {};
            ((obj.items) || []).forEach(function (x) {
              if (!x || !x.code) return;
              AIR.gap[x.code] = {
                has: !!x.has,
                ask: unmask(x.ask || '', mk.map),
                clue: unmask(x.clue || '', mk.map),
                evidence: unmask(x.evidence || '', mk.map)
              };
            });
          });
        })()
      : Promise.resolve();

    p1.then(function () {
      /* 主人 2026-10-27 定：全量事项都发给大模型（原只取优先级前 8 条，导致排在尾部、
         优先级低的措施待补充行如 D1/D2 不被覆盖），上限 30 条防极端超长 */
      var fixes = (D.fixes() || []).slice(0, 30);
      if (!fixes.length) return null;
      var mk2 = mask(rwPrompt(fixes));
      return chat(RW_SYS, mk2.text).then(function (t2) {
        var obj2 = jsonOf(t2) || {};
        ((obj2.fixes) || []).forEach(function (x) {
          if (!x || typeof x.i === 'undefined') return;
          AIR.rw[Number(x.i)] = { items: x.items || [], _map: mk2.map };
        });
        AIR.sum = unmask(obj2.summary || '', mk2.map);
      });
    }).then(function () {
      applyToReport();                       /* 写入报告本体 */
      if (D.renderCover) D.renderCover();    /* 覆盖度面板追问更新为大模型版 */
      setRptTag('已融合 AI 建议');
      toast('AI 建议已融入诊断报告，出处已标注');
    }).catch(function (e) {
      setRptTag('');
      errDrawer(e);                          /* 失败才弹窗给详细指引 */
      toast('AI 融合失败：' + (e && e.code ? e.code : ''));
    });
  }
  function maybeAuto() {
    paintFab();
    if (!cfg().on) return;
    autoDiagnose();
  }

  /* ---------------- AI 问答（主人 2026-11-12 定：独立按钮、随时可问、答案可并入补充信息参与诊断） ---------------- */
  var ASK_SYS = '你是项目运营诊断助手。下面给你某外包项目的走访口述与补充信息原文（已脱敏、可能截断），以及本次诊断的结果摘要。\n'
    + '要求：① 只依据材料回答，不臆造数据、人名、时间；② 材料没覆盖到的，明确说「材料未体现」，并指出应补充哪类信息；'
    + '③ 回答用中文，条理清晰、可执行，控制在 400 字以内；④ 涉及整改建议时，说明依据来自材料的哪句话。';
  var QA_SYS = '你是制造业外包项目运营的答疑顾问，覆盖用工管理、现场管理、精益改善、IT 工具应用、客户服务等场景。\n'
    + '要求：① 依据行业通用实践回答，不臆造数据、人名、时间；② 回答用中文，条理清晰、可操作，控制在 400 字以内；'
    + '③ 涉及具体项目现状时，提示用户可在走访口述中补充相应信息后生成诊断；④ 不确定的内容明确说明，不编造。';
  function aiReady() {
    var c = cfg();
    if (c.on && (c.key || '').trim()) return true;
    /* 主人 2026-11-12 定：未开启时不弹右侧抽屉，改居中提示卡（显眼、不遮操作） */
    if (!$('aiNeedCard')) {
      var d = document.createElement('div');
      d.id = 'aiNeedCard';
      d.innerHTML = '<div class="ancBox"><b>✨ AI 问答需要先开启 AI 大模型</b>'
        + '<div>完成服务商与 API Key 配置后即可随时提问，回答可并入补充信息参与诊断。</div>'
        + '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">'
        + '<button class="ancBtn" id="ancGo" type="button">去配置</button>'
        + '<button class="ancBtn gh" id="ancClose" type="button">暂不</button></div></div>';
      document.body.appendChild(d);
      $('ancGo').addEventListener('click', function () { d.remove(); openConfig(); });
      $('ancClose').addEventListener('click', function () { d.remove(); });
    }
    return false;
  }
  function aiAppendAns(txt) {
    var ta = $('tx2');
    if (!ta) { toast('未找到补充信息框'); return; }
    ta.value = (String(ta.value || '').replace(/\s+$/, '') ? String(ta.value).replace(/\s+$/, '') + '\n' : '')
      + '【AI 问答补充】' + txt;
    toast('已并入补充信息框，点 ▶ 重新诊断即可计入');
  }
  function aiAsk() {
    if (!aiReady()) return;
    ensureUI();
    var ex = $('aidAsk'), dr = $('aiDrawer');
    var curMat = !!String(clip(D.rawText(), 8000)).trim();
    if (ex && dr && ex.dataset.mat === (curMat ? '1' : '0')) { dr.classList.add('on'); ex.focus(); return; }  /* 已开着且模式一致：保留历史继续问 */
    var b = drawer('✨ AI 问答');
    var raw = clip(D.rawText(), 8000);
    var hasMat = !!String(raw).trim();
    var mk = hasMat ? mask(raw) : null;
    var R = D.getR();
    var sum = hasMat ? (R ? ('总得分 ' + R.total + ' 分；整改事项 ' + R.fixes.length + ' 项；覆盖度 ' + ((D.coverStat() || {}).rate || '—') + '%')
                : '（尚未生成报告）') : '';
    b.innerHTML = '<div class="aidCard"><div style="font-size:11.5px;color:#9fb0c2">'
      + (hasMat
          ? '材料模式：将基于<b>走访口述 + 补充信息（已脱敏）</b>与诊断摘要作答。诊断摘要：' + esc(sum)
          : '答疑模式：当前无走访材料，可直接提问外包项目运营相关问题；回答可一键并入补充信息参与诊断。')
      + '</div>'
      + '<textarea id="aidAsk" placeholder="' + (hasMat ? '例如：这次走访里，人员流失的根因还能怎么挖？' : '例如：电子签到与纸质签到怎么平滑过渡？') + '" style="margin-top:8px"></textarea>'
      + '<div style="margin-top:8px;display:flex;gap:8px"><button class="aidBtn" id="aidSend" type="button">发送</button>'
      + '<button class="aidBtn gh" id="aidCancel" type="button">关闭</button></div></div><div id="aidAns"></div>';
    var ta = b.querySelector('#aidAsk');
    if (ta) { ta.dataset.mat = hasMat ? '1' : '0'; ta.focus(); }
    b.querySelector('#aidCancel').addEventListener('click', closeDrawer);
    b.querySelector('#aidSend').addEventListener('click', function () {
      if (!aiReady()) return;
      var q = (ta.value || '').trim();
      if (!q) { toast('请输入问题'); return; }
      var ans = $('aidAns');
      ans.insertAdjacentHTML('beforeend', '<div class="aidCard" style="border-color:rgba(126,179,255,.3)">'
        + '<div style="color:#7eb3ff;font-size:11.5px;margin-bottom:4px">问：' + esc(q) + '</div>'
        + '<div class="aidWait">✨ 正在思考…</div></div>');
      var last = ans.lastElementChild;
      var user = hasMat
        ? '【材料原文（已脱敏）】\n' + mk.text + '\n\n【诊断结果摘要】\n' + sum + '\n\n【我的问题】\n' + q
        : '【我的问题】\n' + q;
      chat(hasMat ? ASK_SYS : QA_SYS, user).then(function (txt) {
        var t = unmask(txt, mk ? mk.map : null);
        last.innerHTML = '<div style="color:#7eb3ff;font-size:11.5px;margin-bottom:4px">问：' + esc(q) + '</div>'
          + '<h5>回答' + (hasMat ? '' : '（答疑模式）') + '</h5><div style="white-space:pre-wrap">' + esc(t) + '</div>'
          + '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'
          + '<button class="aidBtn" data-in="' + esc(t) + '" type="button">并入补充信息</button>'
          + '<button class="aidBtn gh" data-cp="' + esc(t) + '" type="button">复制回答</button></div>';
        Array.prototype.forEach.call(last.querySelectorAll('[data-cp]'), function (el) {
          el.addEventListener('click', function () { copyText(this.getAttribute('data-cp')); });
        });
        Array.prototype.forEach.call(last.querySelectorAll('[data-in]'), function (el) {
          el.addEventListener('click', function () { aiAppendAns(this.getAttribute('data-in')); });
        });
        footNote(b);
      }).catch(function (e) {
        last.innerHTML = '<div style="color:#7eb3ff;font-size:11.5px;margin-bottom:4px">问：' + esc(q) + '</div>';
        errBox(last, e); footNote(b);
      });
    });
  }

  ensureUI();

  window.__llm = {
    maybeAuto: maybeAuto, autoDiagnose: autoDiagnose, openConfig: openConfig, aiAsk: aiAsk,
    aiGapFor: aiGapFor,
    chat: chat, cfg: cfg, mask: mask, unmask: unmask, jsonOf: jsonOf,
    close: closeDrawer, providers: PROVIDERS
  };
})();
