# -*- coding: utf-8 -*-
"""
AI 本地代理 —— 给「运营诊断智能体」破解浏览器跨域（CORS）用。

作用：浏览器不允许网页直接请求各家大模型官方 API（Kimi / DeepSeek / 豆包 等
      官方端点均未开放跨域）。本代理在本机转发请求并补上跨域响应头，
      于是页面里把「接口地址」填成 http://127.0.0.1:8787/v1 即可正常调用。

用法：
    1) 双击运行本文件（或运行 启动AI代理.bat），保持窗口开着；
    2) 智能体页面 → 管理员后台 → ✨ AI 增强：
         接口地址  http://127.0.0.1:8787/v1
         模型名    照填官方模型名（如 deepseek-chat、ep-xxx、moonshot-v1-32k）
         API Key   填官方真实密钥
    3) 代理会按模型名自动路由到对应官方端点，无需手填目标地址。

路由规则（按模型名前缀）：
    deepseek-  → https://api.deepseek.com/v1
    moonshot- / kimi → https://api.moonshot.cn/v1
    ep- / doubao-    → https://ark.cn-beijing.volces.com/api/v3
    qwen-      → https://dashscope.aliyuncs.com/compatible-mode/v1
    glm-       → https://open.bigmodel.cn/api/paas/v4
    hunyuan-   → https://api.hunyuan.cloud.tencent.com/v1
    其它       → 可用请求头 X-Target-Base 指定，缺省走 DeepSeek

零依赖：仅用 Python 标准库（Python 3.7+）。停止服务：关闭窗口或按 Ctrl+C。
"""
import json
import os
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PORT = 8787
UPSTREAM_TIMEOUT = 180  # 秒

ROUTES = [
    (("deepseek",), "https://api.deepseek.com/v1", "DeepSeek"),
    (("moonshot", "kimi"), "https://api.moonshot.cn/v1", "Kimi / Moonshot"),
    (("ep-", "doubao"), "https://ark.cn-beijing.volces.com/api/v3", "豆包 / 火山方舟"),
    (("qwen",), "https://dashscope.aliyuncs.com/compatible-mode/v1", "通义千问"),
    (("glm",), "https://open.bigmodel.cn/api/paas/v4", "智谱 GLM"),
    (("hunyuan",), "https://api.hunyuan.cloud.tencent.com/v1", "腾讯混元"),
]
DEFAULT_UPSTREAM = "https://api.deepseek.com/v1"


FORCE_TARGET = os.environ.get("LLM_FORCE_TARGET", "").strip()  # 设置后所有请求强制转发到此


def pick_upstream(model, headers):
    if FORCE_TARGET:
        return FORCE_TARGET.rstrip("/"), "强制目标（LLM_FORCE_TARGET）"
    m = (model or "").strip().lower()
    for keys, url, _name in ROUTES:
        for k in keys:
            if m.startswith(k):
                return url, _name
    tb = None
    for k, v in (headers or {}).items():
        if k.lower() == "x-target-base":
            tb = v
            break
    if tb:
        return tb.rstrip("/"), "自定义（X-Target-Base）"
    return DEFAULT_UPSTREAM, "缺省 DeepSeek"


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Target-Base",
    "Access-Control-Max-Age": "86400",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "LLMLocalProxy/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))
        sys.stdout.flush()

    def _cors(self):
        for k, v in CORS.items():
            self.send_header(k, v)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/").endswith("/health") or self.path == "/":
            body = json.dumps({"ok": True, "service": "llm-local-proxy",
                               "hint": "把页面里的接口地址填成 http://127.0.0.1:%d/v1" % PORT},
                              ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        model = ""
        try:
            model = (json.loads(raw.decode("utf-8")) or {}).get("model", "")
        except Exception:
            pass
        upstream, uname = pick_upstream(model, self.headers)
        url = upstream.rstrip("/") + "/chat/completions"
        print("[proxy] model=%s -> %s (%s)" % (model or "-", url, uname))

        headers = {"Content-Type": "application/json"}
        auth = self.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        req = Request(url, data=raw, headers=headers, method="POST")

        try:
            resp = urlopen(req, timeout=UPSTREAM_TIMEOUT)
            status = resp.status
            ctype = resp.headers.get("Content-Type", "application/json")
            body = resp.read()
        except HTTPError as e:
            status = e.code
            ctype = e.headers.get("Content-Type", "application/json") if e.headers else "application/json"
            body = e.read() or json.dumps({"error": {"message": "上游返回 %s" % e.code}}).encode()
        except (URLError, OSError) as e:
            status = 502
            ctype = "application/json; charset=utf-8"
            body = json.dumps({"error": {"message": "无法连接上游服务 %s：%s" % (upstream, e)}},
                              ensure_ascii=False).encode("utf-8")
        except Exception as e:  # noqa
            status = 500
            ctype = "application/json; charset=utf-8"
            body = json.dumps({"error": {"message": "代理内部错误：%s" % e}}, ensure_ascii=False).encode("utf-8")

        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass


def main():
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    print("=" * 62)
    print("  AI 本地代理已启动（Cross-Origin 转发）")
    print("  ------------------------------------------------------------")
    print("  请把智能体页面里的「接口地址」填成：")
    print("      http://127.0.0.1:%d/v1" % port)
    print("  模型名与 API Key 照填官方值，代理按模型名自动路由。")
    print("  支持：DeepSeek / Kimi / 豆包 / 通义 / 智谱 / 混元 / 自定义")
    print("  停止服务：关闭本窗口 或 按 Ctrl+C")
    if os.environ.get("LLM_FORCE_TARGET"):
        print("  强制转发目标：%s（忽略模型名路由）" % os.environ["LLM_FORCE_TARGET"])
    print("=" * 62)
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
        srv.shutdown()


if __name__ == "__main__":
    main()
