# -*- coding: utf-8 -*-
"""把 _build/01_seed.js / 02_app.js / 04_gate.html / 05_llm.js / 06_update.js 注入
   ops-diagnosis-agent.html（幂等）。

   构建产物：
     ① ops-diagnosis-agent.html   单文件程序壳（内嵌知识库种子兜底）
     ② version.json               云端热更新清单（build 指纹 / 程序版本 / 知识库版本）
     ③ 归档中心同步 + 本地留档（release.py snap，保留最近 10 期）

   程序版本：_build/VERSION（第一行版本号，其余行为更新说明）
   知识库版本：01_seed.js 的 meta.ver / meta.schema —— 两者解耦，
             程序可云端热更，知识库仍走本地回滚。

   用法：
     python build.py               构建 + 发布 + 留档
     python build.py --no-publish  只构建，不动归档中心
"""
import io, re, os, sys, shutil, subprocess, json, hashlib, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'ops-diagnosis-agent.html')
SEED = os.path.join(ROOT, '_build', '01_seed.js')
APP = os.path.join(ROOT, '_build', '02_app.js')
ADMIN = os.path.join(ROOT, '_build', '03_admin.js')
GATE = os.path.join(ROOT, '_build', '04_gate.html')
LLM = os.path.join(ROOT, '_build', '05_llm.js')
UPD = os.path.join(ROOT, '_build', '06_update.js')
VERF = os.path.join(ROOT, '_build', 'VERSION')
DEST = r'D:\A·W\AI-data\AI运营诊断智能体'


def read(p):
    return io.open(p, encoding='utf-8').read()


def app_meta():
    """程序版本与更新说明（_build/VERSION：首行版本号，其余为说明）"""
    if not os.path.exists(VERF):
        return '0.0.0', ''
    lines = [x.strip() for x in read(VERF).splitlines()]
    ver = lines[0] if lines else '0.0.0'
    note = ' '.join([x for x in lines[1:] if x])
    return ver or '0.0.0', note


def kb_meta():
    """知识库版本与结构版本（从种子 meta 读取，正则避免引入 JSON5 解析）"""
    s = read(SEED)
    mv = re.search(r'"ver"\s*:\s*"([^"]+)"', s)
    ms = re.search(r'"schema"\s*:\s*(\d+)', s)
    return (mv.group(1) if mv else '-'), int(ms.group(1)) if ms else 1


def build_stamp():
    """build 指纹：由全部源文件内容决定（不含 HTML 自身，避免自引用循环）
       内容不变 → 指纹不变 → 页面不会误报「有新版本」"""
    h = hashlib.sha256()
    for p in [SEED, APP, ADMIN, GATE, LLM, UPD, VERF]:
        h.update(read(p).encode('utf-8'))
    return h.hexdigest()[:16]


def inject(html, pattern, block, label):
    pat = re.compile(pattern, re.S)
    if pat.search(html):
        return pat.sub(lambda m: block, html, count=1), 1
    return html, 0


def main():
    html = read(TARGET)
    meta = app_meta()
    kbver, kbschema = kb_meta()
    stamp = build_stamp()

    # —— ① 程序版本信息块（幂等）——
    ab = ('<!--APPBUILD:START-->\n<script id="appbuild">window.__APP_BUILD__='
          + json.dumps({'ver': meta[0], 'build': stamp, 'kbVer': kbver, 'kbSchema': kbschema},
                       ensure_ascii=False, separators=(',', ':'))
          + ';</script>\n<!--APPBUILD:END-->')
    html, n0 = inject(html, r'<!--APPBUILD:START-->.*?<!--APPBUILD:END-->', ab, 'appbuild')

    # —— ② 访问门禁 ——
    gate = read(GATE).strip()
    html, n1 = inject(html, r'<!--GATE:START-->.*?<!--GATE:END-->',
                      '<!--GATE:START-->\n' + gate + '\n<!--GATE:END-->', 'gate')

    # —— ③ 知识库种子 / 引擎 / AI 模块 ——
    html, n2 = re.subn(r'(<script id="kb-seed">)(.*?)(</script>)',
                       lambda m: m.group(1) + '\n' + read(SEED).strip() + '\n' + m.group(3),
                       html, count=1, flags=re.S)
    html, n3 = re.subn(r'(<script id="app">)(.*?)(</script>)',
                       lambda m: m.group(1) + '\n' + read(APP).strip() + '\n' + m.group(3),
                       html, count=1, flags=re.S)
    html, n4 = re.subn(r'(<script id="llm">)(.*?)(</script>)',
                       lambda m: m.group(1) + '\n' + read(LLM).strip() + '\n' + m.group(3),
                       html, count=1, flags=re.S)

    # —— ④ 云端热更新模块 ——
    html, n5 = re.subn(r'(<script id="hotupdate">)(.*?)(</script>)',
                       lambda m: m.group(1) + '\n' + read(UPD).strip() + '\n' + m.group(3),
                       html, count=1, flags=re.S)

    if not n0 or not n1 or not n2 or not n3 or not n4 or not n5:
        print('INJECT FAILED  appbuild=%s gate=%s seed=%s app=%s llm=%s update=%s'
              % (n0, n1, n2, n3, n4, n5))
        sys.exit(1)

    io.open(TARGET, 'w', encoding='utf-8').write(html)
    print('build ok -> %d bytes | 程序 v%s | 知识库 v%s (schema %d) | build %s'
          % (len(html), meta[0], kbver, kbschema, stamp))

    # —— ⑤ version.json（云端热更新清单）——
    vj = {
        'ver': meta[0],
        'build': stamp,
        'time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'kbVer': kbver,
        'kbSchema': kbschema,
        'notes': meta[1],
        'minShell': meta[0],
        'size': len(html),
        'sha256': hashlib.sha256(html.encode('utf-8')).hexdigest(),
    }
    for p in [os.path.join(ROOT, 'version.json')]:
        io.open(p, 'w', encoding='utf-8').write(json.dumps(vj, ensure_ascii=False, indent=2))
    print('version.json -> ver %s / build %s' % (vj['ver'], vj['build']))

    if '--no-publish' in sys.argv:
        return
    publish()


def publish():
    """同步最新文件到归档中心并自动留档"""
    if not os.path.isdir(DEST):
        os.makedirs(DEST, exist_ok=True)
    pairs = [(TARGET, os.path.join(DEST, 'ops-diagnosis-agent.html')),
             (os.path.join(ROOT, 'version.json'), os.path.join(DEST, 'version.json')),
             (SEED, os.path.join(DEST, '_build', '01_seed.js')),
             (APP, os.path.join(DEST, '_build', '02_app.js')),
             (ADMIN, os.path.join(DEST, '_build', '03_admin.js')),
             (GATE, os.path.join(DEST, '_build', '04_gate.html')),
             (LLM, os.path.join(DEST, '_build', '05_llm.js')),
             (UPD, os.path.join(DEST, '_build', '06_update.js')),
             (VERF, os.path.join(DEST, '_build', 'VERSION')),
             (os.path.join(ROOT, '_build', 'llm_proxy.py'), os.path.join(DEST, '发布包', 'llm_proxy.py')),
             (os.path.join(ROOT, '_build', 'release.py'), os.path.join(DEST, '_build', 'release.py')),
             (build_py_path(), os.path.join(DEST, '_build', 'build.py')),
             (os.path.join(ROOT, '知识库结构梳理表.xlsx'), os.path.join(DEST, '知识库结构梳理表.xlsx'))]
    n = 0
    for s, d in pairs:
        if os.path.exists(s):
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copy2(s, d); n += 1
    md_src = os.path.join(ROOT, '知识库_v2_MD')
    md_dst = os.path.join(DEST, '知识库_MD')
    if os.path.isdir(md_src):
        os.makedirs(md_dst, exist_ok=True)
        for f in os.listdir(md_src):
            p = os.path.join(md_src, f)
            if os.path.isfile(p):
                shutil.copy2(p, os.path.join(md_dst, f)); n += 1
    print('publish -> %s（同步 %d 个文件）' % (DEST, n))

    try:
        subprocess.call([sys.executable, os.path.join(ROOT, '_build', 'release.py'), 'snap'])
    except Exception as e:
        print('[warn] 自动留档失败：', e)


def build_py_path():
    return os.path.abspath(__file__)


if __name__ == '__main__':
    main()
