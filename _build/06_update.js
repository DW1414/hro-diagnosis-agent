/* ============================================================================
   06_update.js —— 云端热更新 + 版本回滚（GitHub Pages 托管）
   设计原则（主人 2026-11-03 定）：
     · 程序壳云端热更：比对 version.json 的 build 指纹，有新版本时提示更新
     · 知识库仍在本机：热更只替换程序，不碰 localStorage 里的知识库与录入数据
     · 回滚双轨：程序走 ?pin=REL-xxx 钉住历史版本；知识库走本地快照（release.py）
     · 离线安全：file:// 打开、网络失败、version.json 缺失 → 一律静默跳过
     · 不打断录入：默认只提示不刷新；自动更新需用户显式开启，且仅在输入为空时自动执行
   ========================================================================== */
(function () {
  if (window.__hu) return;

  var B = window.__APP_BUILD__ || null;          /* 构建时由 build.py 注入 */
  var LS = 'opsdiag.hu';
  var STATE = { latest: null, state: 'idle', lastCheck: 0, auto: false };
  var PIN = (location.search.match(/[?&]pin=([\w.\-]+)/) || [])[1] || '';
  var isFile = location.protocol === 'file:';
  var isHttp = /^https?:$/.test(location.protocol);
  var TIMER = null;

  function cfg() {
    try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(o) {
    try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {}
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ---------------- 版本信息展示（顶部副标题后追加程序版本） ---------------- */
  function paintVer() {
    if (!B) return;
    var host = document.querySelector('.brand .sub');
    if (!host) return;
    if ($('appVer')) { $('appVer').textContent = '　· 程序 v' + B.ver; return; }
    var s = document.createElement('span');
    s.id = 'appVer';
    s.style.cssText = 'color:#7eb3ff;white-space:nowrap';
    s.textContent = '　· 程序 v' + B.ver;
    host.appendChild(s);
  }

  /* ---------------- 样式（幂等注入，沿用深色玻璃拟态） ---------------- */
  function style() {
    if ($('huStyle')) return;
    var s = document.createElement('style');
    s.id = 'huStyle';
    s.textContent = ''
      + '#huBar{position:fixed;left:50%;transform:translateX(-50%) translateY(28px);bottom:94px;z-index:9000;'
      + 'display:none;align-items:center;gap:10px;flex-wrap:wrap;max-width:min(92vw,720px);'
      + 'padding:11px 16px;border-radius:14px;background:rgba(10,20,32,.96);border:1px solid rgba(232,197,132,.45);'
      + 'box-shadow:0 18px 48px rgba(0,0,0,.55);color:#f4f7ff;font-size:12.5px;line-height:1.6;'
      + 'backdrop-filter:blur(14px);opacity:0;transition:opacity .25s,transform .25s}'
      + '#huBar.on{display:flex;opacity:1;transform:translateX(-50%) translateY(0)}'
      + '#huBar .hdot{width:8px;height:8px;border-radius:99px;background:#4ee3a0;box-shadow:0 0 10px #4ee3a0;flex:none}'
      + '#huBar b{color:#f6e2b8;font-weight:600}'
      + '#huBar .htxt{color:#9aabc4;flex:1 1 200px;min-width:0}'
      + '#huBar label{display:flex;align-items:center;gap:5px;color:#9aabc4;cursor:pointer;white-space:nowrap}'
      + '#huBar input[type=checkbox]{width:auto;margin:0}'
      + '#huBar button{cursor:pointer;border-radius:9px;padding:6px 12px;font-size:12px;font-family:inherit;'
      + 'border:1px solid rgba(232,197,132,.5);background:linear-gradient(180deg,#f3d9a4,#e8c584);color:#20180c;font-weight:600}'
      + '#huBar button.gh{background:transparent;color:#9aabc4;border-color:rgba(255,255,255,.18)}'
      + '#huPin{position:fixed;left:0;right:0;top:0;z-index:9001;display:none;align-items:center;justify-content:center;'
      + 'gap:10px;padding:7px 14px;background:rgba(255,193,74,.94);color:#241a05;font-size:12.5px;font-weight:600}'
      + '#huPin.on{display:flex}'
      + '#huPin a{color:#241a05;text-decoration:underline;cursor:pointer}'
      + '@media print{#huBar,#huPin{display:none!important}}';
    document.head.appendChild(s);
  }

  function bar(html) {
    style();
    var el = $('huBar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'huBar';
      document.body.appendChild(el);
    }
    el.innerHTML = html;
    el.classList.add('on');
    return el;
  }
  function hide() { var el = $('huBar'); if (el) el.classList.remove('on'); }

  /* ---------------- 顶部钉住历史版本横幅 ---------------- */
  function pinBanner(tip) {
    style();
    var el = $('huPin');
    if (!el) {
      el = document.createElement('div');
      el.id = 'huPin';
      document.body.appendChild(el);
    }
    el.innerHTML = '⚠️ 当前为历史版本 <b>' + esc(PIN) + '</b>　'
      + '<a id="huPinBack">回到最新版</a>　·　历史版本不再检查更新，知识库仍用本机数据'
      + (tip ? '　·　' + esc(tip) : '');
    el.classList.add('on');
    var a = $('huPinBack');
    if (a) a.onclick = function () {
      location.replace(location.pathname.replace(/releases\/[^\/]+\/(index\.html)?$/, '') + '?v=' + Date.now());
    };
    document.documentElement.style.paddingTop = '34px';
  }

  /* ?pin=REL-xxx：不在历史目录时先探测目录是否存在，存在则跳转（真正的回滚入口） */
  function pinRoute() {
    if (/\/releases\//.test(location.pathname)) { pinBanner(); return; }
    var target = 'releases/' + encodeURIComponent(PIN) + '/';
    fetch(target + 'index.html', { method: 'HEAD', cache: 'no-store' })
      .then(function (r) {
        if (r && r.ok) { location.replace(target + '?pin=' + encodeURIComponent(PIN)); return; }
        pinBanner('未找到该版本，已停留在最新版');
      })
      .catch(function () { pinBanner('版本目录不可达，已停留在最新版'); });
  }

  /* ---------------- 是否允许自动刷新（不打断录入） ---------------- */
  function idleEnough() {
    var ids = ['mName', 'tx', 'tx2', 'mHead', 'mConf'];
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (el && String(el.value || '').trim()) return false;
    }
    var doc = $('doc');
    if (doc && /<h4|<table/.test(doc.innerHTML || '')) return false;  /* 已有报告 */
    var mod = document.querySelector('.mbox');
    if (mod && mod.offsetParent) return false;                        /* 管理员后台开着 */
    return true;
  }

  function apply(latest) {
    var u = location.pathname + '?v=' + encodeURIComponent(latest.build || Date.now());
    if (PIN) u += '&pin=' + encodeURIComponent(PIN);
    location.replace(u);
  }

  function showUpdate(j) {
    STATE.latest = j;
    STATE.state = 'ready';
    var c = cfg();
    STATE.auto = !!c.auto;
    var notes = j.notes ? String(j.notes).slice(0, 90) : '';
    var el = bar(
      '<span class="hdot"></span><b>发现新版本 v' + esc(j.ver || '?') + '</b>'
      + '<span class="htxt">' + (notes ? esc(notes) : '程序已更新，知识库与本机数据不受影响')
      + (j.kbSchema && B && j.kbSchema !== B.kbSchema ? ' ⚠️ 新版需新的知识库结构，请先导出备份' : '') + '</span>'
      + '<label title="勾选后：仅在未录入内容时自动刷新"><input type="checkbox" id="huAuto"' + (STATE.auto ? ' checked' : '') + ' />自动更新</label>'
      + '<button id="huGo" type="button">立即更新</button>'
      + '<button class="gh" id="huNo" type="button">稍后</button>'
    );
    $('huGo').onclick = function () { apply(j); };
    $('huNo').onclick = function () {
      var c2 = cfg(); c2.skip = j.build || ''; save(c2); hide();
      STATE.state = 'skipped';
    };
    $('huAuto').onchange = function () {
      var c2 = cfg(); c2.auto = this.checked; save(c2); STATE.auto = this.checked;
      if (this.checked && idleEnough()) apply(j);
    };
    /* 已开自动更新且当前空闲 → 直接更新，不打扰 */
    if (STATE.auto && idleEnough() && !(j.kbSchema && B && j.kbSchema !== B.kbSchema)) {
      apply(j);
    }
  }

  /* ---------------- 版本检查 ---------------- */
  function check(force) {
    if (isFile || !isHttp || !B) return Promise.resolve(null);
    if (typeof fetch !== 'function') return Promise.resolve(null);   /* jsdom 等环境无 fetch */
    if (PIN) return Promise.resolve(null);              /* 钉住历史版本不检查 */
    var now = Date.now();
    if (!force && now - STATE.lastCheck < 10 * 60 * 1000) return Promise.resolve(STATE.latest);
    STATE.lastCheck = now;
    var url = 'version.json?t=' + now;
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.build) return null;
        var c = cfg();
        if (j.build === B.build) { STATE.state = 'current'; hide(); return j; }
        if (c.skip === j.build) { STATE.state = 'skipped'; return j; }
        if (j.kbSchema && B.kbSchema && j.kbSchema !== B.kbSchema) {
          /* 结构不兼容：只提示，不自动刷新 */
          showUpdate(j);
          return j;
        }
        showUpdate(j);
        return j;
      })
      .catch(function () { return null; });            /* 静默：断网/无文件不报错 */
  }

  function boot() {
    paintVer();
    if (PIN) { pinRoute(); return; }
    setTimeout(function () { check(false); }, 2000);
    TIMER = setInterval(function () { check(false); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 外部接口（测试与后台可调用） */
  window.__hu = {
    check: check, apply: apply, hide: hide, idleEnough: idleEnough,
    state: function () { return { state: STATE.state, latest: STATE.latest, build: B && B.build, pinned: PIN || '', file: isFile }; },
    build: function () { return B; }
  };
})();
