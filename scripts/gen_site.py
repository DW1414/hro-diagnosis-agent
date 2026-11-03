# -*- coding: utf-8 -*-
"""生成 GitHub Pages 站点目录 docs/（CI 与本地通用）

产物结构：
    docs/
      index.html                 最新程序壳（单文件）
      version.json               热更新清单（页面启动时比对 build 指纹）
      releases/
        index.json               历史版本清单（供 ?pin= 选择）
        REL-011_v2.2.5/index.html
        REL-008_v2.2.4/index.html
      llm_proxy.py               AI 本地代理（可选下载）

要点：
  · 只发程序，不发知识库：知识库种子虽内嵌在 HTML 里作为「出厂兜底」，
    但用户本机的 localStorage 知识库永远优先，且不随版本回退。
  · 历史版本目录用于 ?pin=REL-xxx 程序回滚，来源是本地归档中心 _releases/。
"""
import io, os, sys, json, shutil, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
REL_OUT = os.path.join(DOCS, 'releases')
ARCHIVE = os.environ.get('REL_ARCHIVE', r'D:\A·W\AI-data\AI运营诊断智能体\_releases')
HTML = os.path.join(ROOT, 'ops-diagnosis-agent.html')
VER = os.path.join(ROOT, 'version.json')
PROXY = os.path.join(ROOT, '_build', 'llm_proxy.py')


def read(p):
    return io.open(p, encoding='utf-8').read()


def main():
    if not os.path.exists(HTML) or not os.path.exists(VER):
        print('缺少构建产物：请先运行 python _build/build.py --no-publish')
        sys.exit(1)

    html = read(HTML)
    vj = json.loads(read(VER))

    # —— 一致性闸门：页面内 build 指纹必须与 version.json 相同，否则拒绝发布 ——
    stamp = '"build":"%s"' % vj['build']
    if stamp not in html:
        print('BUILD MISMATCH：页面内 build 与 version.json 不一致，请重新构建')
        sys.exit(1)
    # 页内 appbuild 里的 ver 也要与 version.json 一致
    if ('"ver":"%s"' % vj['ver']) not in html:
        print('VERSION MISMATCH：页面内程序版本与 version.json 不一致')
        sys.exit(1)
    real = hashlib.sha256(html.encode('utf-8')).hexdigest()
    if vj.get('sha256') and real != vj['sha256']:
        print('SHA256 MISMATCH：%s != %s' % (real[:16], str(vj['sha256'])[:16]))
        sys.exit(1)
    print('校验通过：v%s / build %s / 知识库 v%s (schema %s)'
          % (vj['ver'], vj['build'], vj['kbVer'], vj['kbSchema']))

    os.makedirs(REL_OUT, exist_ok=True)
    shutil.copy2(HTML, os.path.join(DOCS, 'index.html'))
    shutil.copy2(VER, os.path.join(DOCS, 'version.json'))
    if os.path.exists(PROXY):
        shutil.copy2(PROXY, os.path.join(DOCS, 'llm_proxy.py'))

    # —— 历史版本归档 ——
    items = []

    # ① 当期版本自动归档（CI 也生效）：?pin=v2.3.0-aaa6de76 可回退到本次发布
    cur_id = 'v%s-%s' % (vj['ver'], vj['build'])
    cur_dir = os.path.join(REL_OUT, cur_id)
    os.makedirs(cur_dir, exist_ok=True)
    shutil.copy2(HTML, os.path.join(cur_dir, 'index.html'))
    items.append({'id': cur_id, 'ver': vj['ver'], 'build': vj['build'],
                  'time': vj.get('time', ''), 'bytes': len(html.encode('utf-8'))})

    # ② 本地归档中心的历史快照（有则导入）
    if os.path.isdir(ARCHIVE):
        n = 0
        for name in sorted(os.listdir(ARCHIVE)):
            src = os.path.join(ARCHIVE, name, 'app', 'ops-diagnosis-agent.html')
            if not os.path.isfile(src):
                continue
            rid = name.split('__')[0]                      # REL-011_v2.2.5
            dst_dir = os.path.join(REL_OUT, rid)
            os.makedirs(dst_dir, exist_ok=True)
            shutil.copy2(src, os.path.join(dst_dir, 'index.html'))
            items.append({'id': rid, 'ver': rid.split('_')[-1] if '_' in rid else '',
                          'time': name.split('__')[-1] if '__' in name else '',
                          'bytes': os.path.getsize(src)})
            n += 1
        print('历史版本（本地归档）-> %d 期' % n)
    else:
        print('[提示] 未找到归档中心 %s，跳过历史版本导入（CI 正常现象）' % ARCHIVE)

    # 合并仓库里已有的 releases（CI 场景：docs/releases 已入库）
    idxp = os.path.join(REL_OUT, 'index.json')
    if os.path.exists(idxp):
        try:
            old = json.loads(read(idxp)).get('releases', [])
        except Exception:
            old = []
        seen = {x['id'] for x in items}
        for x in old:
            if x.get('id') and x['id'] not in seen:
                items.append(x)
    items.sort(key=lambda x: x['id'])
    io.open(idxp, 'w', encoding='utf-8').write(
        json.dumps({'current': {'ver': vj['ver'], 'build': vj['build']}, 'releases': items},
                   ensure_ascii=False, indent=2))

    # —— 防止 Pages 把目录当 Jekyll 处理 ——
    io.open(os.path.join(DOCS, '.nojekyll'), 'w', encoding='utf-8').write('')

    total = sum(os.path.getsize(os.path.join(dp, f))
                for dp, _, fs in os.walk(DOCS) for f in fs)
    print('站点生成完成 -> %s（%d 期历史版本，%.1f MB）' % (DOCS, len(items), total / 1048576.0))


if __name__ == '__main__':
    main()
