# -*- coding: utf-8 -*-
"""测试辅助：拷贝 docs 站点到临时目录并起 http server（模拟 GitHub Pages）。
   用法：python site_sim.py <docs目录> <临时目录> <端口>
   为什么不用 Node 的 fs.cpSync：沙箱策略会拦截递归目录拷贝。"""
import os, sys, shutil, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

DOCS, TMP, PORT = sys.argv[1], sys.argv[2], int(sys.argv[3])
shutil.rmtree(TMP, ignore_errors=True)
shutil.copytree(DOCS, TMP)
os.chdir(TMP)


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')   # 模拟 Pages 时再加查询串穿透
        self.send_header('Access-Control-Allow-Origin', '*')
        SimpleHTTPRequestHandler.end_headers(self)


srv = ThreadingHTTPServer(('127.0.0.1', PORT), H)
print('site sim on %d root=%s' % (PORT, TMP), flush=True)
srv.serve_forever()
