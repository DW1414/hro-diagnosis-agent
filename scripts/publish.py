# -*- coding: utf-8 -*-
"""发布流水线：本地更新 → 本地验证 → 管理员确认 → 云端更新 → 自动部署

  Stage 1  build    本地更新：重建程序壳 + version.json（内容指纹驱动，无变更不误报）
  Stage 2  verify   本地验证：JS 语法 + 测试套件（fast/full 两档）+ 站点生成 + 一致性闸门
  Stage 3  confirm  管理员确认：展示版本差异 / 变更文件 / 测试统计，人点头才放行
  Stage 4  ship     云端更新：git add / commit / push / tag
  Stage 5  deploy   自动部署：push 触发 GitHub Actions（pages.yml）；
                    云主机部署为预留 hook —— 存在 scripts/deploy_remote.py 则自动调用

用法：
  python scripts/publish.py                 全流程（验证用 full 档）
  python scripts/publish.py --fast          快档验证（跳过浏览器端到端，约 40 秒）
  python scripts/publish.py --yes           跳过管理员确认（仅限 CI / 全自动场景）
  python scripts/publish.py --dry-run       演练：跑到确认前，只打印将要执行的动作
"""
import io, os, sys, json, subprocess, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

ARGS = set(sys.argv[1:])
FAST = '--fast' in ARGS
YES = '--yes' in ARGS or os.environ.get('CI') == 'true'
DRY = '--dry-run' in ARGS
REPORT = os.path.join(ROOT, '_build', 'verify_report.json')


def run(cmd, timeout=600, quiet=True):
    """执行命令，返回 (ok, output)。quiet=True 时不回显（输出进报告）"""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True,
                           encoding='utf-8', errors='replace',
                           timeout=timeout, cwd=ROOT,
                           shell=(os.name == 'nt' and isinstance(cmd, str)))
        out = (p.stdout or '') + (p.stderr or '')
        return p.returncode == 0, out
    except subprocess.TimeoutExpired:
        return False, '[timeout] %s' % cmd
    except Exception as e:
        return False, '[error] %s' % e


def sh(cmd, quiet=True, timeout=600):
    return run(cmd, quiet=quiet, timeout=timeout)


def tail(s, n=6):
    lines = [x for x in (s or '').strip().splitlines() if x.strip()]
    return '\n'.join(lines[-n:])


def stage(name):
    print('\n' + '=' * 66)
    print('▶ Stage · ' + name)
    print('=' * 66)


# ============================================================
results = {'time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
           'stages': {}, 'ok': False}

# ---------- Stage 1 本地更新 ----------
stage('1/5 本地更新（build.py：重建程序壳 + version.json）')
ok, out = sh([sys.executable, '_build/build.py', '--no-publish'])
results['stages']['build'] = {'ok': ok, 'out': tail(out, 4)}
print(tail(out, 4))
if not ok:
    io.open(REPORT, 'w', encoding='utf-8').write(json.dumps(results, ensure_ascii=False, indent=2))
    print('✗ 构建失败，流水线中止'); sys.exit(1)

vj = json.loads(io.open('version.json', encoding='utf-8').read())
results['ver'] = vj['ver']; results['build'] = vj['build']
print('程序 v%s ｜ build %s ｜ 知识库 v%s (schema %s)'
      % (vj['ver'], vj['build'], vj['kbVer'], vj['kbSchema']))

# ---------- Stage 2 本地验证 ----------
stage('2/5 本地验证（语法 → 测试套件 → 站点生成 → 端到端）')
checks = []
for f in ['01_seed.js', '02_app.js', '03_admin.js', '05_llm.js', '06_update.js']:
    ok, out = sh(['node', '--check', '_build/' + f])
    checks.append(('语法 ' + f, ok, ''))
    print(('  ✓ ' if ok else '  ✗ ') + '语法 ' + f)

suites = [
    ('核心功能 89 项',       ['node', '_build/test2.js'],      'tail'),
    ('访问门禁 15 项',       ['node', '_build/test_gate2.js'], 'tail'),
    ('密钥与种子 21 项',     ['node', '_build/test_ak.js'],    'tail'),
    ('AI 融合 31 项',        ['node', '_build/test_ai.js'],    'tail'),
    ('本地代理 9 项',        [sys.executable, '_build/test_proxy.py'], 'tail'),
]
if not FAST:
    suites += [
        ('AI 真实链路（Edge）', ['node', '_build/test_ai_ui.js'],   'tail'),
    ]

tests_ok = True
for name, cmd, mode in suites:
    ok, out = sh(cmd, timeout=420)
    # 汇总行
    summary = ''
    for line in reversed(out.strip().splitlines()):
        if ('通过' in line or 'PASS' in line or '失败' in line) and ('/' in line or '=====' in line):
            summary = line.strip(); break
    if not summary:
        summary = tail(out, 1) or ('ok' if ok else 'fail')
    tests_ok &= ok
    checks.append((name, ok, summary))
    print(('  ✓ ' if ok else '  ✗ ') + name + ('　' + summary if summary else ''))

# 站点生成（一致性闸门内置）
ok, out = sh([sys.executable, 'scripts/gen_site.py'])
site_ok = ok and '校验通过' in out
checks.append(('站点生成与一致性闸门', site_ok, tail(out, 1)))
print(('  ✓ ' if site_ok else '  ✗ ') + '站点生成与一致性闸门　' + (tail(out, 1) or ''))

# 热更新端到端（依赖 docs，放最后）
if not FAST:
    ok, out = sh(['node', '_build/test_update.js'], timeout=420)
    summary = ''
    for line in out.strip().splitlines():
        if line.startswith('结果：'):
            summary = line.strip(); break
    tests_ok &= ok
    checks.append(('热更新端到端 16 项', ok, summary))
    print(('  ✓ ' if ok else '  ✗ ') + '热更新端到端 16 项　' + (summary or ''))

results['stages']['verify'] = {
    'ok': all(c[1] for c in checks),
    'checks': [{'name': n, 'ok': bool(o), 'note': t} for n, o, t in checks],
}

bad = [c for c in checks if not c[1]]
print('\n—— 验证汇总：%d/%d 通过 ——' % (len(checks) - len(bad), len(checks)))
if bad:
    for n, _, t in bad:
        print('  ✗ ' + n + '　' + (t or ''))
    io.open(REPORT, 'w', encoding='utf-8').write(json.dumps(results, ensure_ascii=False, indent=2))
    print('✗ 验证未通过，流水线中止（不许带病上线）'); sys.exit(1)

# ---------- Stage 3 管理员确认 ----------
stage('3/5 管理员确认（人点头才放行）')

# 版本对比：HEAD 里的 version.json vs 工作区
old = {}
try:
    ok, out = sh(['git', 'show', 'HEAD:version.json'])
    if ok:
        old = json.loads(out)
except Exception:
    pass
ver_changed = (old.get('ver') != vj['ver'])      # 语义版本变化才打 tag
build_changed = (old.get('build') != vj['build'])  # build 变化=常规发布

ok, out = sh(['git', '-c', 'core.quotepath=false', 'status', '--short'])
changed = [l for l in out.strip().splitlines() if l.strip()]
print('  程序版本：%s → %s%s' % (old.get('ver', '（无）'), vj['ver'],
      ('　【语义版本变更，将打 tag v%s】' % vj['ver']) if ver_changed else '　（常规发布，build 指纹更新）'))
print('  build 指纹：%s → %s' % (old.get('build', '（无）')[:16], vj['build']))
print('  知识库：v%s (schema %s)　—— 热更不触碰本机知识库' % (vj['kbVer'], vj['kbSchema']))
print('  变更文件 %d 个：' % len(changed))
for l in changed[:12]:
    print('    ' + l)
if len(changed) > 12:
    print('    … 共 %d 个' % len(changed))

note = ''
if DRY:
    print('\n[dry-run] 演练到此为止：Stage 4/5 将执行 git add -A → commit → push →（版本变更时）tag')
    print('[dry-run] 确认对话已跳过。真实发布请去掉 --dry-run')
    results['ok'] = True; results['dry_run'] = True
    io.open(REPORT, 'w', encoding='utf-8').write(json.dumps(results, ensure_ascii=False, indent=2))
    sys.exit(0)

print()
if not YES:
    try:
        note = input('  输入发布说明（直接回车 = 取消发布）：').strip()
    except (EOFError, KeyboardInterrupt):
        note = ''
    if not note:
        print('✗ 已取消（未提交任何内容）')
        sys.exit(2)
    print('  管理员已确认 ✓')
else:
    note = 'CI 自动发布：验证 %d/%d 通过' % (len(checks), len(checks))
    print('  [CI 模式] 跳过人工确认')

results['note'] = note

# ---------- Stage 4 云端更新 ----------
stage('4/5 云端更新（git commit → push → tag）')
ok, out = sh(['git', 'add', '-A'])
msg = 'release v%s (%s)\n\n%s\n\n验证：%s' % (
    vj['ver'], vj['build'][:12], note,
    '；'.join('%s %s' % (n, '✓' if o else '✗') for n, o, _ in checks[:8]))
print('  git add -A ✓' if ok else '  ✗ git add 失败')

if DRY:
    print('  [dry-run] commit -m "' + msg.splitlines()[0] + '…"')
else:
    p = subprocess.run(['git', 'commit', '-m', msg], capture_output=True, text=True,
                       encoding='utf-8', errors='replace', cwd=ROOT)
    out = (p.stdout or '') + (p.stderr or '')
    if p.returncode == 0:
        print('  git commit ✓')
    elif 'nothing to commit' in out:
        print('  · 无变更可提交（跳过 commit）')
    else:
        print('  ✗ commit 失败：' + tail(out, 3)); sys.exit(1)

    if ver_changed:
        ok2, out2 = sh(['git', 'tag', '-f', 'v' + vj['ver']])
        print('  git tag v%s ✓' % vj['ver'] if ok2 else '  ⚠ tag 失败：' + tail(out2, 2))
    else:
        print('  （语义版本未变，不打新 tag）')
    ok3, out3 = sh(['git', 'push', 'origin', 'HEAD', '--tags'])
    if ok3:
        print('  git push ✓（已触发 GitHub Actions 自动部署）')
    else:
        print('  ✗ push 失败（检查网络 / 远端 / 凭据）：')
        print(tail(out3, 5))
        sys.exit(1)

# ---------- Stage 5 自动部署 ----------
stage('5/5 自动部署')
ok, url = sh(['git', 'remote', 'get-url', 'origin'])
if ok and url.strip():
    repo = url.strip()
    for pre in ('https://github.com/', 'git@github.com:'):
        if repo.startswith(pre):
            repo = repo[len(pre):]
    repo = repo.replace('.git', '')
    print('  GitHub Actions：https://github.com/%s/actions（push 已触发，约 1~3 分钟）' % repo)
    print('  站点地址　　　：https://%s.github.io/%s/' % tuple(repo.split('/')) if '/' in repo else '')
else:
    print('  ⚠ 未配置远端 origin：本地验证已全部通过，推送后即自动部署')

# 云主机预留 hook：存在 scripts/deploy_remote.py 则调用（暂无云主机，跳过）
hook = os.path.join(ROOT, 'scripts', 'deploy_remote.py')
if os.path.exists(hook):
    print('  [hook] 检测到 deploy_remote.py，调用云主机部署…')
    ok, out = sh([sys.executable, hook])
    print(tail(out, 4))
else:
    print('  [hook] 云主机部署未启用（scripts/deploy_remote.py 不存在）——')
    print('         GitHub Pages 已自动部署；将来上云主机时：')
    print('         ① 写 scripts/deploy_remote.py（scp/rsync + 重启服务）')
    print('         ② 流水线会自动调用，无需改本脚本')

results['ok'] = True
io.open(REPORT, 'w', encoding='utf-8').write(json.dumps(results, ensure_ascii=False, indent=2))
print('\n✅ 流水线完成：v%s (build %s) 已进入部署' % (vj['ver'], vj['build']))
print('   验证报告：_build/verify_report.json')
