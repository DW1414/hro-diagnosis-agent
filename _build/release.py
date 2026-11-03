# -*- coding: utf-8 -*-
"""
运营诊断智能体 · 变更管理（版本留档 / 一键回滚）
------------------------------------------------
期限：保留最近 KEEP 期（默认 10 期）完整快照，每期同时含「程序」与「知识库文档」。

受控对象：
  程序    ops-diagnosis-agent.html
  源码    _build/01_seed.js、02_app.js、03_admin.js、build.py
  文档    知识库_v2_MD/*.md + _manifest.json
  表单    知识库结构梳理表.xlsx（存在则归档）

命令：
  python release.py snap  [--note "变更说明"]     建立一期快照（程序+源码+MD+表单）
  python release.py list                          查看版本台账
  python release.py rollback <REL-ID> [--target app|md|src|all] [--dest <目录>]
                                                  回滚（默认还原到工作区原位）
"""
import os, sys, json, shutil, hashlib, datetime, argparse

KEEP = 10
WS   = r"D:\AI工具包\2026-10-16-17-30-15"
DEST = r"D:\A·W\AI-data\AI运营诊断智能体"
REL  = os.path.join(DEST, "_releases")
IDX  = os.path.join(REL, "index.json")

APP  = ["ops-diagnosis-agent.html"]
SRC  = ["_build/01_seed.js", "_build/02_app.js", "_build/03_admin.js", "_build/build.py",
        "_build/release.py"]
XLSX = ["知识库结构梳理表.xlsx"]
XLSX_CANON = r"D:\A·W\知识库结构梳理表.xlsx"   # 主用：主人整理过的 5 页签版（与 MD 同名对应）


def xlsx_file():
    """梳理表优先取 D:\\A·W 的整理版，其次工作区版"""
    return XLSX_CANON if os.path.exists(XLSX_CANON) else os.path.join(WS, XLSX[0])


def md_files():
    d = os.path.join(WS, "知识库_v2_MD")
    if not os.path.isdir(d):
        return []
    return sorted(["知识库_v2_MD/" + f for f in os.listdir(d)
                   if f.endswith(".md") or f.endswith(".json")])


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def cur_version():
    """从构建产物里读知识库版本号 vX.Y.Z"""
    p = os.path.join(WS, "ops-diagnosis-agent.html")
    if os.path.exists(p):
        import re
        with open(p, encoding="utf-8", errors="ignore") as f:
            head = f.read(400000)
        m = re.search(r'"ver"\s*:\s*"([\d.]+)"', head)
        if m:
            return m.group(1)
    return "unknown"


def kb_head():
    """取知识库变更日志最新一条作为快照说明兜底"""
    seed = os.path.join(WS, "_build", "01_seed.js")
    try:
        import re
        s = open(seed, encoding="utf-8").read()
        tail = s[s.rfind('{"v":"'):]
        m = re.search(r'\{"v":"([\d.]+)","d":"([^"]+)","m":"(.*?)"\}', tail)
        nxt = tail.find('{"v":"', 1)
        m = re.findall(r'\{"v":"([\d.]+)","d":"([^"]+)","m":"(.*?)"\}', s)
        if m:
            v, d, msg = m[-1]
            return "v%s（%s）%s" % (v, d, msg)
    except Exception:
        pass
    return ""


def load_index():
    if os.path.exists(IDX):
        try:
            return json.load(open(IDX, encoding="utf-8"))
        except Exception:
            pass
    return {"keep": KEEP, "releases": []}


def save_index(ix):
    os.makedirs(REL, exist_ok=True)
    json.dump(ix, open(IDX, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def snapshot(note=""):
    ver = cur_version()
    now = datetime.datetime.now()
    ts = now.strftime("%Y%m%d-%H%M%S")
    ix = load_index()
    seq = len(ix["releases"]) + 1
    rid = "REL-%03d_v%s" % (seq, ver)
    pkg = os.path.join(REL, rid + "__" + ts)
    os.makedirs(pkg, exist_ok=True)

    groups = {"app": APP, "src": SRC, "md": md_files(), "xlsx": [xlsx_file()]}
    files = []
    missed = []
    for g, lst in groups.items():
        gd = os.path.join(pkg, g)
        os.makedirs(gd, exist_ok=True)
        for rel in lst:
            s = rel if os.path.isabs(rel) else os.path.join(WS, rel)
            if not os.path.exists(s):
                missed.append(rel)
                continue
            dst = os.path.join(gd, os.path.basename(rel))
            shutil.copy2(s, dst)
            files.append({"group": g, "name": os.path.basename(rel),
                          "bytes": os.path.getsize(s), "sha256": sha256(s)})

    if not note:
        note = kb_head() or "（未填写变更说明）"
    meta = {"id": rid, "seq": seq, "ver": ver, "time": now.isoformat(timespec="seconds"),
            "note": note, "files": files, "missing": missed}
    json.dump(meta, open(os.path.join(pkg, "manifest.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    ix["keep"] = KEEP
    ix["releases"].append(meta)
    # 保留最近 KEEP 期
    while len(ix["releases"]) > KEEP:
        old = ix["releases"].pop(0)
        d = [x for x in os.listdir(REL) if x.startswith(old["id"] + "__")]
        for x in d:
            shutil.rmtree(os.path.join(REL, x), ignore_errors=True)
    save_index(ix)
    write_ledger(ix)
    print("[snap] %s  %s  文件 %d 个（app %d / src %d / md %d / xlsx %d）"
          % (rid, note[:60], len(files),
             len([f for f in files if f["group"] == "app"]),
             len([f for f in files if f["group"] == "src"]),
             len([f for f in files if f["group"] == "md"]),
             len([f for f in files if f["group"] == "xlsx"])))
    if missed:
        print("[snap] 未纳入（文件不存在）：", ", ".join(missed))
    return meta


def write_ledger(ix):
    """生成人读台账 RELEASES.md"""
    lines = ["# 运营诊断智能体 · 版本台账",
             "",
             "保留策略：最近 **%d 期**完整快照（含程序 + 知识库 MD + 源码 + 表单），超出自动淘汰最旧一期。" % ix["keep"],
             "",
             "回滚：`python _build/release.py rollback REL-XXX --target app|md|src|all`",
             "",
             "| # | 版本 | 时间 | 文件数 | 变更说明 |",
             "|---|---|---|---|---|"]
    for r in ix["releases"]:
        lines.append("| %s | v%s | %s | %d | %s |" % (
            r["id"], r["ver"], r["time"][:19].replace("T", " "), len(r["files"]),
            r["note"].replace("|", "/")[:120]))
    lines += ["", "档案目录：`%s`" % REL, ""]
    open(os.path.join(DEST, "RELEASES.md"), "w", encoding="utf-8").write("\n".join(lines))


def do_list():
    ix = load_index()
    if not ix["releases"]:
        print("暂无快照。执行：python release.py snap")
        return
    print("保留策略：最近 %d 期｜现有 %d 期" % (ix["keep"], len(ix["releases"])))
    print("-" * 96)
    for r in ix["releases"]:
        g = {}
        for f in r["files"]:
            g[f["group"]] = g.get(f["group"], 0) + 1
        print("%s | v%-7s | %s | app %d / src %d / md %d / xlsx %d | %s"
              % (r["id"], r["ver"], r["time"][:19].replace("T", " "),
                 g.get("app", 0), g.get("src", 0), g.get("md", 0), g.get("xlsx", 0),
                 r["note"][:60]))


def do_rollback(rid, target="all", dest=None):
    ix = load_index()
    hit = [r for r in ix["releases"] if r["id"] == rid or rid.lower() in r["id"].lower()]
    if not hit:
        print("找不到快照：", rid, "（用 list 查看）")
        return 1
    r = hit[0]
    pkg = [x for x in os.listdir(REL) if x.startswith(r["id"] + "__")]
    if not pkg:
        print("快照目录缺失：", r["id"])
        return 1
    pkg = os.path.join(REL, sorted(pkg)[-1])
    if not dest:
        dest = WS  # 默认还原到工作区原位，随后重新构建即可生效

    want = {"app": ["app"], "src": ["src"], "md": ["md"], "all": ["app", "src", "md", "xlsx"]}[target]
    n = 0
    for f in r["files"]:
        if f["group"] not in want:
            continue
        s = os.path.join(pkg, f["group"], f["name"])
        if f["group"] == "md":
            d = os.path.join(dest, "知识库_v2_MD", f["name"])
        elif f["group"] == "src":
            d = os.path.join(dest, "_build", f["name"])
        else:
            d = os.path.join(dest, f["name"])
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy2(s, d)
        ok = sha256(d) == f["sha256"]
        print(("  ✓ " if ok else "  ✗ ") + d)
        n += 1
    print("[rollback] 已从 %s 恢复 %d 个文件（target=%s）→ %s" % (r["id"], n, target, dest))
    if target in ("all", "src", "app"):
        print("  提示：源码/程序还原后，执行 `cd _build && python build.py` 重新构建产物。")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["snap", "list", "rollback"])
    ap.add_argument("rid", nargs="?", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--target", default="all", choices=["app", "md", "src", "all"])
    ap.add_argument("--dest", default="")
    a = ap.parse_args()
    if a.cmd == "snap":
        snapshot(a.note)
    elif a.cmd == "list":
        do_list()
    else:
        sys.exit(do_rollback(a.rid, a.target, a.dest or None))
