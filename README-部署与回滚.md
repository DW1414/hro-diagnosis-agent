# 项目运营诊断智能体 · 云端托管与回滚手册

> 一句话架构：**程序坐云端高铁，知识库骑本地自行车。** 程序随时热更、随时回滚；知识库与录入数据永远只在本机浏览器，不随版本漂移。

---

## 一、版本双轨制

| 轨 | 存放位置 | 版本号来源 | 更新方式 | 回滚方式 |
|---|---|---|---|---|
| **程序**（壳 / 引擎 / AI 模块 / 门禁） | GitHub Pages `docs/` | `_build/VERSION` 首行 | 热更新（页面弹条 或 自动刷新） | `?pin=` 钉旧版 / `git revert` / 手动重部署任一 tag |
| **知识库**（四维子项、措施卡、评分规则） | 本机 `localStorage['opsdiag.kb.v2']` + 本地归档中心 `_releases/` | `01_seed.js` 的 `meta.ver` | 后台「MD 文件库」上传 / 后台编辑 | 本地 `release.py rollback` / 后台导入旧 MD |

程序里的知识库种子（`meta.schema`）只是「出厂兜底」，**本机已有知识库时永远以本机为准**；热更新不会覆盖您改过的知识库。

---

## 二、首次上线（约 5 分钟）

> ✅ **已于 2026-11-06 完成**：仓库 `DW1414/hro-diagnosis-agent`，站点 https://dw1414.github.io/hro-diagnosis-agent/ （首次部署 Actions 一次通过，线上验收 7/7）。以下流程留作新环境复刻参考。

### 1. 建仓库
GitHub → New repository，名称建议 `hro-diagnosis-agent`，可见性 **Public**（免费账号的 Pages 只支持公开仓库），不要勾选初始化 README。

### 2. 推送
```bash
cd "D:/AI工具包/2026-10-16-17-30-15"
git init
git add .
git commit -m "feat: 云端托管首版 v2.3.0（热更新 + 版本回滚）"
git branch -M main
git remote add origin https://github.com/<你的账号>/hro-diagnosis-agent.git
git push -u origin main
```
首次推送会弹出 Git Credential Manager 授权窗口，浏览器点「Authorize」即可。

### 3. 开启 Pages
仓库 → Settings → Pages → **Source 选「GitHub Actions」**（不要选 Deploy from a branch）。
推送完成后 Actions 会自动跑 `Deploy Agent`，约 1 分钟出链接：

```
https://dw1414.github.io/hro-diagnosis-agent/
```

### 4. 打 tag（可选，便于整站回滚）
```bash
git tag v2.3.0 && git push --tags
```

---

## 三、日常发布（改完代码只需一条命令）

```bash
python _build/build.py --no-publish   # 重建程序壳 + version.json
python scripts/gen_site.py            # 生成 docs/ 站点（含历史版本归档）
git add -A && git commit -m "feat: 本次改了什么"
git push
```
推送后 CI 自动部署 **约 1~3 分钟**（GitHub Pages CDN 另有 ~10 分钟缓存，页面用 `?v=build` 穿透，用户感知为新版）。

> 本地想先看效果：`cd docs && python -m http.server 8901`，浏览器开 `http://127.0.0.1:8901/`。

---

## 四、热更新是怎么工作的

```
页面打开
  └─ 读 window.__APP_BUILD__ {ver, build, kbVer, kbSchema}   ← 构建时写入
  └─ GET version.json?t=<时间戳>（no-store）
        ├─ build 相同        → 什么都不做（静默）
        ├─ build 不同        → 底部弹「发现新版本」条
        │     ├─ 立即更新     → location.replace('?v=<新build>')  ★穿透 CDN 缓存
        │     ├─ 稍后         → 记住该 build，不再打扰（可手动清）
        │     └─ 自动更新     → 勾选后：仅当**没有任何录入内容**时自动刷新，不打断工作
        └─ kbSchema 不同     → 只提示「新版需新知识库结构」，禁止自动刷新
```

- `build` 指纹由全部源文件内容哈希得出：**不发布就不会误报**；内容没变重新构建也不提示。
- 打开本地文件（`file://`）、断网、`version.json` 缺失 → 全部**静默降级**，不影响离线使用。
- 每 30 分钟自动复查一次；标签页重新激活时也会复查。

---

## 五、程序回滚（三条路，按顺手程度排）

### 路线 A：`?pin=` 秒回滚（不改代码，最灵活）
```
https://dw1414.github.io/hro-diagnosis-agent/?pin=REL-011_v2.2.5
https://dw1414.github.io/hro-diagnosis-agent/?pin=v2.3.0-535f71018f2d8207
```
页面会探测历史目录并跳转，顶部黄条提示「当前为历史版本 · 回到最新版」。
历史版本清单：`docs/releases/index.json`。

### 路线 B：`git revert`（推荐给正式回退）
```bash
git log --oneline -10            # 找到要撤的提交
git revert <commit>              # 生成反向提交
git push                         # CI 自动重新部署
```

### 路线 C：手动重部署任一 tag（不用改代码历史）
GitHub → Actions → `Deploy Agent` → **Run workflow** → `ref` 填 `v2.3.0` 或某个 commit → Run。

> 回滚只换程序，**本机知识库与录入数据不受影响**。若新版 `kbSchema` 变了，回滚后页面会用旧结构读知识库，建议先在后台导出备份。

---

## 六、知识库更新（半自动发版 · 主人 2026-11-06 定的甲方案）

知识库正文仍然**不进仓库、不上传云端**，靠"后台改 → 导出种子 → 发版"一条链把改动带到所有人手里：

```
① 后台（概览与总控 / 四维子项 / 评分项 / MD 文件库…）改完 → 保存（写本机 localStorage）
② 后台「概览与总控」→ 点【导出种子（发版用）】→ 得到 01_seed.js（已剔除明文密钥）
③ 把这个 01_seed.js 交给管理员，覆盖 _build/01_seed.js
④ python scripts/publish.py            # 构建 → 校验 → 确认 → 推送 → CI 部署
⑤ 所有人下次打开页面：热更提示「有新版本」，知识库随种子一起更新（本机录入数据不动）
```

要点：
- 导出种子 = **本机当前知识库全量**（含四维子项、评分项、措施卡、判定标准、写作要求、布局），不是摘要
- 种子里的 `meta.ver` / `meta.schema` 决定热更行为：`schema` 不变只提示更新；`schema` 变了会提示"需新知识库结构"，禁止自动刷新
- 发版前若改过 `meta.ver`，`version.json` 的 `kbVer` 会跟着变，方便确认"线上到底哪版知识库"
- 想回滚知识库：`release.py rollback REL-xxx --target md`（本地归档中心仍在，不动云端）

---

## 七、知识库回滚（始终在本地，不经过 GitHub）

### 日常备份 / 恢复
- 后台 →「MD 文件库」→ 导出当前知识库 MD（或整包 JSON）
- 恢复：同一入口上传旧 MD 覆盖即可（会写回本机 `localStorage`）

### 快照级回滚（本地留档中心，保留最近 10 期）
```bash
python _build/release.py list                                  # 看有哪些期
python _build/release.py rollback REL-011 --target md          # 只回滚知识库 MD
python _build/release.py rollback REL-011 --target app         # 只回滚程序
python _build/release.py rollback REL-011 --target all         # 全回滚
```
归档位置：`D:\A·W\AI-data\AI运营诊断智能体\_releases\REL-xxx…`

---

## 八、常见坑

| 现象 | 原因 | 处置 |
|---|---|---|
| 推送后页面没变 | Pages CDN 缓存约 10 分钟 | 手动加 `?v=<时间戳>`；或 Pages 设置里 Request a rebuild |
| 页面一直提示有新版本 | `version.json` 与页面 `build` 不一致 | 重新 `build.py` + `gen_site.py`，看 CI 冒烟检查报错 |
| Actions 报 `BUILD MISMATCH` | 只改了 `version.json` 没重建 | 跑 `python _build/build.py --no-publish` |
| 私有仓库没有 Pages 入口 | 免费账号限制 | 改 Public，或升级 GitHub Pro |
| 国内访问 github.io 慢/不通 | 网络环境 | 换自有域名 + CDN，或镜像到 Gitee/Cloudflare Pages（`docs/` 目录可直接搬） |
| 门禁密码忘了 | 哈希校验在页面内 | 重新构建并改 `04_gate.html` 里的 `GATE_OK` 哈希 |

---

## 九、安全提醒

- 仓库里的访问门禁是 **哈希校验**，源码不存明文密码，但**公开仓库意味着程序可被任何人下载**，门禁只是门槛、不是保险箱。敏感场景请用私有仓库 + 自建托管。
- **不要把 API Key、Token、密码提交进仓库**。`.gitignore` 已排除本地调试产物，但提交前请 `git status` 自查。
- 知识库与项目走访数据只在本机浏览器（`localStorage`），不上云、不进仓库 —— 这是本方案的设计前提，请勿改成"知识库也上传"。
- **管理员入口密钥只存 SHA-256 哈希**（`cfg.adminKeyHash`）：页面源码、导出 MD、导出种子三处都没有明文。升级到 2.3.2 后，本机若存过旧的明文密钥会**自动作废并删除**，统一回落到种子里的默认密钥（默认值由管理员另行告知，不写进任何文档）；进后台「概览与总控」可重设。
- 后台入口按钮对**所有通过门禁的人可见**，密钥是全局共享的一把。它是"软门槛"，不是账号体系；真要多角色/可审计，得上方案丙（Cloud service 登录）。
- 2026-11-06 已做一次**仓库历史重写**：清除了历史提交里的知识库正文与明文口令，并强推覆盖远端。此后若再误提交敏感文件，仅"删文件再提交"不够——历史里仍在，必须重写（或直接换仓库）。
