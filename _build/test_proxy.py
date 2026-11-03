# -*- coding: utf-8 -*-
"""本地代理 E2E：mock 上游 + 代理转发 + CORS 头 + 密钥透传。"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
MOCK_PORT = 8899
PROXY_PORT = 8787
res = []


def ck(name, v, extra=''):
    res.append((name, bool(v)))
    print(('PASS ' if v else 'FAIL ') + name + ('  ' + extra if extra else ''))


def req(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method or ('POST' if data else 'GET'))
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()


def main():
    mock = subprocess.Popen([PY, os.path.join(HERE, 'mock_llm.py'), str(MOCK_PORT)])
    proxy = subprocess.Popen([PY, os.path.join(HERE, 'llm_proxy.py'), str(PROXY_PORT)])
    time.sleep(2.0)
    try:
        # 1 健康检查
        try:
            s, h, b = req('http://127.0.0.1:%d/health' % PROXY_PORT)
            ck('1 代理健康检查通过', s == 200 and b'ok' in b, 'HTTP %s' % s)
        except Exception as e:
            ck('1 代理健康检查通过', False, str(e))

        # 2 OPTIONS 预检返回 CORS 头
        s, h, b = req('http://127.0.0.1:%d/v1/chat/completions' % PROXY_PORT, method='OPTIONS')
        ck('2 预检返回 204', s == 204, 'HTTP %s' % s)
        ck('3 带跨域允许头', h.get('Access-Control-Allow-Origin') == '*', str(h.get('Access-Control-Allow-Origin')))

        # 3 POST 转发到 mock 上游（用 X-Target-Base 指定）
        payload = json.dumps({
            'model': 'mock-model', 'stream': False, 'temperature': 0.3,
            'messages': [{'role': 'user', 'content': 'ping 测试'}]
        }).encode('utf-8')
        s, h, b = req('http://127.0.0.1:%d/v1/chat/completions' % PROXY_PORT, data=payload,
                      headers={'Content-Type': 'application/json',
                               'Authorization': 'Bearer sk-test-123456',
                               'X-Target-Base': 'http://127.0.0.1:%d/v1' % MOCK_PORT})
        ck('4 转发成功返回 200', s == 200, 'HTTP %s' % s)
        ck('5 返回体含模型输出', b'mock-model' in b or '收到' in b.decode('utf-8', 'replace'))

        # 4 上游确实收到了密钥与原文
        lp = os.path.join(HERE, 'mock_last.json')
        rec = json.load(open(lp, encoding='utf-8')) if os.path.exists(lp) else {}
        ck('6 密钥原样透传上游', rec.get('headers', {}).get('Authorization') == 'Bearer sk-test-123456')
        body_txt = ''
        try:
            body_txt = ((json.loads(rec.get('body') or '{}').get('messages') or [{}])[-1].get('content') or '')
        except Exception:
            pass
        ck('7 请求体原样转发', body_txt == 'ping 测试', repr(body_txt))
        ck('8 上游路径正确', rec.get('path') == '/v1/chat/completions', str(rec.get('path')))

        # 5 模型名路由（不存在的上游会报错，但能证明路由到了不同域名）
        #    用 X-Target-Base 缺失 + model=deepseek-chat 会真连 DeepSeek（无网时 502），这里只验证不崩
        s2, h2, b2 = req('http://127.0.0.1:%d/v1/chat/completions' % PROXY_PORT, data=payload,
                         headers={'Content-Type': 'application/json', 'Authorization': 'Bearer sk-x'})
        ck('9 缺省路由不崩溃（有网 401 / 无网 502）', s2 in (200, 400, 401, 403, 502, 504), 'HTTP %s' % s2)
    finally:
        proxy.terminate()
        mock.terminate()
        try:
            proxy.wait(timeout=5); mock.wait(timeout=5)
        except Exception:
            proxy.kill(); mock.kill()

    bad = len([1 for _, v in res if not v])
    print('结果：%d/%d 通过' % (len(res) - bad, len(res)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
