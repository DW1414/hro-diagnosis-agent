# -*- coding: utf-8 -*-
"""测试用假的大模型服务：记录收到的请求，返回固定 OpenAI 格式响应。"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
LAST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mock_last.json')


class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else b''
        rec = {
            'path': self.path,
            'headers': {k: v for k, v in self.headers.items()},
            'body': body.decode('utf-8', 'replace')
        }
        with open(LAST, 'w', encoding='utf-8') as f:
            json.dump(rec, f, ensure_ascii=False)
        body_txt = rec['body'] or ''
        GAP = json.dumps({'items': [
            {'code': 'A1', 'has': True, 'clue': '【客户】现场一线员工流失率偏高，近三个月离职 28 人',
             'ask': '近三个月离职 28 人中，主动离职与被动离职各多少？一线岗位占比？',
             'evidence': '调取离职台账与离职访谈记录，按岗位/入职时长分段统计'},
            {'code': 'B1', 'has': False, 'clue': '',
             'ask': '关键岗位从需求确认到到岗的实际周期是多少天？',
             'evidence': '查看招聘需求表与到岗记录，对比合同约定的交付周期'}
        ]}, ensure_ascii=False)
        RW = json.dumps({
            'fixes': [
                {'i': 0, 'items': [
                    {'act': '建立离职预警台账：班组长每周上报在岗与离职意向，人事周汇总并预警',
                     'accept': '连续 4 周台账完整，预警准确率≥80%'},
                    {'act': '关键岗位补员提速：需求确认后【客户】指定周期内出人选并到岗',
                     'accept': '连续两个月到岗及时率≥90%'}
                ]},
                {'i': 1, 'items': [
                    {'act': '考勤系统补录：把纸质签到改为电子打卡，班长每日核对异常',
                     'accept': '连续 30 天打卡率≥98%'}
                ]},
                {'i': 2, 'items': [
                    {'act': '考勤数据自动同步：电子打卡数据按周导出并归档，异常当日闭环',
                     'accept': '连续 4 周同步及时率 100%'}
                ]},
                {'i': 3, 'items': [
                    {'act': '待现场确认岗位清单后制定分层培训计划，班长带教并留痕',
                     'accept': '月度培训完成率≥90%，记录可查'}
                ]},
                {'i': 4, 'items': [
                    {'act': '宿舍与食堂问题清单化：每月收集员工反馈并公示整改进度',
                     'accept': '当月问题闭环率≥85%'}
                ]},
                {'i': 5, 'items': [
                    {'act': '排班模型按订单波峰波谷重排，加班提前一周审批',
                     'accept': '月加班时长下降至目标值以内'}
                ]},
                {'i': 6, 'items': [
                    {'act': '客诉 24 小时响应：责任班组当日出改善措施并回访',
                     'accept': '客诉响应及时率 100%'}
                ]},
                {'i': 7, 'items': [
                    {'act': '待现场确认后补建关键岗位继任者名单与培养档案',
                     'accept': '关键岗位继任覆盖率≥80%'}
                ]},
                {'i': 8, 'items': [
                    {'act': '现场通道与物料标识补齐，班组每日巡检拍照留痕',
                     'accept': '标识完整率 100%，巡检记录连续 4 周'}
                ]},
                {'i': 9, 'items': [
                    {'act': '数字化看板搭建：工时与出勤数据每日自动汇总上墙',
                     'accept': '看板日更新率 100%'}
                ]},
                {'i': 10, 'items': [
                    {'act': '电子签核推广：先试点一个班组，两周内全产线铺开',
                     'accept': '电子签覆盖率≥95%'}
                ]},
                {'i': 11, 'items': [
                    {'act': '待现场确认后建立员工风采展示墙并每月更新',
                     'accept': '每月更新 1 次，员工参与率≥60%'}
                ]},
                {'i': 12, 'items': [
                    {'act': '班组例会标准化：每日晨会通报质量与安全问题并留痕',
                     'accept': '晨会召开率 100%，记录可查'}
                ]},
                {'i': 13, 'items': [
                    {'act': '物料损耗台账建立：按班组每日登记并周分析',
                     'accept': '台账完整率≥95%，月度分析输出'}
                ]},
                {'i': 14, 'items': [
                    {'act': '交付及时率日跟踪：滞后订单当日上报并给追赶计划',
                     'accept': '滞后响应及时率 100%'}
                ]},
                {'i': 15, 'items': [
                    {'act': '待现场确认后补充应急预案并组织一次演练',
                     'accept': '半年内完成 1 次演练并留档'}
                ]}
            ],
            'summary': ('共性短板有两条主线：一是人员稳定性，【客户】现场一线流失集中在入职三个月内，'
                        '已传导为招聘交付压力与客户投诉；二是过程数据留痕，考勤依赖纸质签到，'
                        '缺少可核查的系统记录。改善优先顺序建议先建台账与打卡两条最小闭环，'
                        '再谈排班与加班治理，先易后难、先可视化后优化。')
        }, ensure_ascii=False)
        if '【我的问题】' in body_txt:
            content = ('根据材料：流失集中在入职 3 个月内的新员工（具体比例材料未体现）。\n'
                       '建议补充：① 分入职时段的流失数据；② 离职访谈记录；③ 同行业流失率对标。')
        elif '知识库标准措施卡' in body_txt or '整改行动项' in body_txt:
            content = RW
        elif '待补检的子项' in body_txt:
            content = '```json\n' + GAP + '\n```'
        elif '只回复两个字' in body_txt:
            content = '正常'
        else:
            content = '收到：' + (json.loads(body_txt or '{}').get('messages', [{}])[-1].get('content', '')[:40] or '')
        out = {
            'id': 'mock-1', 'object': 'chat.completion', 'created': 0, 'model': 'mock-model',
            'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}],
            'usage': {'prompt_tokens': 10, 'completion_tokens': 5, 'total_tokens': 15}
        }
        b = json.dumps(out, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)


if __name__ == '__main__':
    print('mock llm on', PORT)
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
