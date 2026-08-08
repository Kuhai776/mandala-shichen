#!/usr/bin/env python3
"""
sync_server — 曼陀罗时辰 HTTP 同步服务器

桥接 PWA (HTTP fetch) 和 Hermes MCP (stdio 文件读写)，共享同一个 data.json。
- GET  /api/sync  → 返回 data.json 全部内容（PWA pullSync 拉取）
- POST /api/sync  → 接收 PWA payload，合并写入 data.json（PWA pushSync 上传）

合并策略（避免 Hermes 写的数据被 PWA 覆盖丢失）：
  actions/inbox/hermesNotes/longTasks → 按 id 合并去重（consumed 取 OR）
  tasks/done                          → 按日期合并（PWA 覆盖同名日期，保留 Hermes 独有）
  records/reviews/checklists/repeats  → PWA 覆盖（Hermes 不直接写这些）

公网部署：用 nginx/caddy 反代到 HTTPS（PWA 在 https 页面 fetch http 会被混合内容拦截）。
依赖：仅 Python 标准库（http.server + fcntl，复用 mandala-mcp.py 数据层）。
"""

import argparse
import importlib.util
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 复用 MCP 数据层（mandala-mcp.py 文件名带连字符，用 importlib 动态导入）
_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "mandala_mcp", os.path.join(_HERE, "mandala-mcp.py"))
_mcp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mcp)
_read_raw = _mcp._read_raw
_write_raw = _mcp._write_raw

DEFAULT_DATA = os.path.expanduser("~/.mandala/data.json")


# ---------- 合并逻辑 ----------
def _merge_by_id(server_list, client_list):
    """按 id 合并两个列表（inbox/hermesNotes/longTasks 用）。后到的(id 相同)不覆盖先到的。"""
    by_id = {}
    order = []
    for item in server_list + client_list:
        iid = item.get("id")
        if not iid:
            continue
        if iid not in by_id:
            by_id[iid] = dict(item)
            order.append(iid)
    return [by_id[i] for i in order]


def _merge_actions(server_list, client_list):
    """合并 actions 队列：按 id 去重，consumed 状态取 OR（任一方消费即标记消费）。"""
    by_id = {}
    order = []
    for item in server_list + client_list:
        aid = item.get("id")
        if not aid:
            continue
        if aid in by_id:
            by_id[aid]["consumed"] = bool(by_id[aid].get("consumed")) or bool(item.get("consumed"))
        else:
            by_id[aid] = dict(item)
            by_id[aid]["consumed"] = bool(item.get("consumed"))
            order.append(aid)
    return [by_id[i] for i in order]


def _merge_by_date(server_obj, client_obj):
    """按日期 key 合并 tasks/done：PWA(客户端)覆盖同名日期，保留服务器独有（Hermes 可能写的）。"""
    merged = dict(server_obj or {})
    merged.update(client_obj or {})
    return merged


def merge_payload(payload, data_path):
    """合并 PWA 上传的 payload 到 data.json，返回合并后的完整数据。"""
    current = _read_raw(data_path)
    # 按 id 合并（Hermes 写的不能丢）
    for key in ("inbox", "hermesNotes", "longTasks"):
        if key in payload:
            current[key] = _merge_by_id(current.get(key, []), payload[key])
    # actions 特殊合并（consumed 取 OR）
    if "actions" in payload:
        current["actions"] = _merge_actions(current.get("actions", []), payload["actions"])
    # 按日期合并（PWA 是当日主源，但保留 Hermes 独写的日期）
    for key in ("tasks", "done"):
        if key in payload:
            current[key] = _merge_by_date(current.get(key, {}), payload[key])
    # PWA 覆盖（Hermes 不直接写这些）
    for key in ("records", "reviews", "checklists", "repeats"):
        if key in payload:
            current[key] = payload[key]
    _write_raw(data_path, current)
    return current


# ---------- HTTP 处理器 ----------
class SyncHandler(BaseHTTPRequestHandler):
    data_path = DEFAULT_DATA

    def _cors(self):
        # PWA 与服务器可能跨域，放开通行
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] != "/api/sync":
            self.send_error(404, "Not Found")
            return
        data = _read_raw(self.data_path)
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/sync":
            self.send_error(404, "Not Found")
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return
        try:
            merge_payload(payload, self.data_path)
        except Exception as e:
            body = json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        body = json.dumps({"ok": True}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # 输出到 stderr，避免污染 MCP stdio 通道
        sys.stderr.write("[sync] %s - %s\n" % (self.address_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser(description="曼陀罗时辰 HTTP 同步服务器")
    ap.add_argument("--data", default=DEFAULT_DATA, help="数据文件路径（默认 ~/.mandala/data.json）")
    ap.add_argument("--port", type=int, default=8001, help="监听端口（默认 8001）")
    ap.add_argument("--host", default="0.0.0.0", help="监听地址（0.0.0.0=所有网卡，公网部署用）")
    args = ap.parse_args()
    data_path = os.path.expanduser(args.data)
    SyncHandler.data_path = data_path
    os.makedirs(os.path.dirname(data_path), exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), SyncHandler)
    sys.stderr.write(f"[sync] HTTP 同步服务器启动: http://{args.host}:{args.port}/api/sync\n")
    sys.stderr.write(f"[sync] 数据文件: {data_path}\n")
    sys.stderr.write("[sync] 公网部署请用 nginx/caddy 反代到 HTTPS（避免 PWA 混合内容拦截）\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("[sync] 已停止\n")
        server.shutdown()


if __name__ == "__main__":
    main()
