#!/usr/bin/env python3
"""
mandala-mcp — 曼陀罗时辰 × Hermes 联动 MCP 参考实现（L3 能力层）

把曼陀罗时辰的 localStorage 数据模型暴露为 MCP 工具，供 Hermes 智能体调用。
Hermes 侧接入：hermes mcp add mandala --stdio -- python3 mandala-mcp.py --data ~/.mandala/data.json

数据契约（与 PWA localStorage 镜像一致）：
  data.json = {
    "tasks":   { "2026-08-08": { "1": ["写报告", "健身"], ... }, ... },  # 9时辰×9格
    "done":    { "2026-08-08": { "1": [{"task":"写报告","done":true}], ... } },
    "longTasks":[ {"id":"lt-xxx","title":"学完嵌入式","start":"2026-08-08","deadline":"2026-09-30","repeat":"weekly","progress":0,"eval":{...}}, ... ],
    "inbox":   [ {"id":"in-xxx","text":"...","created":"..."}, ... ]
  }

并发安全：fcntl 文件锁 + 写临时文件后 os.replace 原子替换（单写者模型）。
传输：stdio（同机信任，无需 OAuth）。
"""

import argparse
import fcntl
import json
import os
import sys
import tempfile
from datetime import datetime, date

# ---------- MCP 协议常量 ----------
PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "mandala-mcp"
SERVER_VERSION = "1.0.0"

DATA_PATH = os.path.expanduser("~/.mandala/data.json")


# ---------- 数据层（fcntl 锁 + 原子写） ----------
def _read_raw(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_raw(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # 锁文件与数据文件同目录
    lock_path = path + ".lock"
    with open(lock_path, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)  # 排他锁，阻塞等待
        try:
            # 原子写：临时文件 → os.replace
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def today_str():
    return date.today().isoformat()


# ---------- 工具实现 ----------
def get_tasks(args, data):
    """获取指定日期的任务（默认今天）。返回 {时辰: [任务]} 映射。"""
    d = args.get("date", today_str())
    return {"date": d, "tasks": data.get("tasks", {}).get(d, {})}


def add_task(args, data):
    """向指定时辰格子添加任务。period=1-9, slot=0-8。返回更新后的格子任务列表。"""
    d = args.get("date", today_str())
    period = str(args.get("period", 1))
    text = args.get("text", "").strip()
    if not text:
        return {"error": "text 不能为空"}
    tasks = data.setdefault("tasks", {}).setdefault(d, {})
    slot = str(args.get("slot", len(tasks.get(period, []))))
    tasks.setdefault(period, []).append(text)
    _write_raw(DATA_PATH, data)
    return {"ok": True, "date": d, "period": period, "tasks": tasks[period]}


def complete_task(args, data):
    """标记任务完成。同时写入 done 记录。"""
    d = args.get("date", today_str())
    period = str(args.get("period", 1))
    idx = int(args.get("index", 0))
    tasks = data.get("tasks", {}).get(d, {}).get(period, [])
    if idx >= len(tasks):
        return {"error": "索引越界"}
    done_list = data.setdefault("done", {}).setdefault(d, {}).setdefault(period, [])
    done_list.append({"task": tasks[idx], "done": True, "at": datetime.now().isoformat()})
    _write_raw(DATA_PATH, data)
    return {"ok": True, "completed": tasks[idx]}


def get_long_tasks(args, data):
    """获取全部长期任务（含 7 维度评估）。"""
    return {"longTasks": data.get("longTasks", [])}


def score_eval(args, data):
    """为长期任务的某维度子项打分（1-5）。dim_code=Cl/Cp/B/L/Ev/P/Rh，sub_key 见 SKILL.md。"""
    tid = args.get("id")
    dim = args.get("dim_code")
    sub = args.get("sub_key")
    score = max(1, min(5, int(args.get("score", 3))))
    for t in data.get("longTasks", []):
        if t.get("id") == tid:
            t.setdefault("eval", {}).setdefault(dim, {})[sub] = score
            _write_raw(DATA_PATH, data)
            return {"ok": True, "id": tid, "dim": dim, "sub": sub, "score": score}
    return {"error": "长期任务不存在"}


def get_today_plan(args, data):
    """获取今日全时辰计划（晨间简报用）。返回 9 时辰的任务概览（含地支名）。"""
    d = today_str()
    # 9 时辰对应地支：1=卯 2=辰 3=巳 4=午 5=未 6=申 7=酉 8=戌 9=亥
    PERIOD_NAMES = ["卯时", "辰时", "巳时", "午时", "未时", "申时", "酉时", "戌时", "亥时"]
    PERIOD_RANGES = ["5-7", "7-9", "9-11", "11-13", "13-15", "15-17", "17-19", "19-21", "21-23"]
    tasks = data.get("tasks", {}).get(d, {})
    summary = []
    for p in range(1, 10):
        items = tasks.get(str(p), [])
        idx = p - 1
        summary.append({
            "period": p,
            "name": PERIOD_NAMES[idx],       # 如 "巳时"
            "range": PERIOD_RANGES[idx],      # 如 "9-11"
            "count": len(items),
            "tasks": items,
        })
    # 当前时辰
    now_hour = datetime.now().hour
    cur = 0
    for i, r in enumerate(PERIOD_RANGES):
        lo, hi = r.split("-")
        if int(lo) <= now_hour < int(hi):
            cur = i + 1
            break
    return {
        "date": d,
        "current_period": cur,
        "current_name": PERIOD_NAMES[cur - 1] if cur else None,
        "periods": summary,
        "total": sum(s["count"] for s in summary),
    }


def get_current_context(args, data):
    """获取当前时辰上下文：上一时辰汇总(含未完成) + 本时辰任务 + 下一时辰预告。
    供 Hermes 在时辰切换时生成"刚才漏了 X，接下来做 Y，再之后是 Z"的连贯对话。"""
    d = args.get("date", today_str())
    PERIOD_NAMES = ["卯时", "辰时", "巳时", "午时", "未时", "申时", "酉时", "戌时", "亥时"]
    PERIOD_RANGES = ["5-7", "7-9", "9-11", "11-13", "13-15", "15-17", "17-19", "19-21", "21-23"]
    now_hour = datetime.now().hour
    cur = 0
    for i, r in enumerate(PERIOD_RANGES):
        lo, hi = r.split("-")
        if int(lo) <= now_hour < int(hi):
            cur = i + 1
            break
    tasks_map = data.get("tasks", {}).get(d, {})
    done_map = data.get("done", {}).get(d, {})

    def period_summary(p):
        """返回某时辰的计划/完成/未完成明细。"""
        if p < 1 or p > 9:
            return None
        idx = p - 1
        planned = tasks_map.get(str(p), [])
        done_list = done_map.get(str(p), [])
        done_texts = {x.get("task") for x in done_list if x.get("done")}
        undone = [t for t in planned if t not in done_texts]
        return {
            "period": p,
            "name": PERIOD_NAMES[idx],
            "range": PERIOD_RANGES[idx],
            "planned_count": len(planned),
            "done_count": len(done_list),
            "undone_count": len(undone),
            "undone": undone,
            "tasks": planned,
        }

    return {
        "date": d,
        "current_period": cur,
        "current_name": PERIOD_NAMES[cur - 1] if cur else None,
        "current_range": PERIOD_RANGES[cur - 1] if cur else None,
        "prev": period_summary(cur - 1) if cur and cur > 1 else None,
        "current": period_summary(cur) if cur else None,
        "next": period_summary(cur + 1) if cur and cur < 9 else None,
    }


def trigger_action(args, data):
    """Hermes 触发 PWA 动作。写入 actions 队列，PWA 下次 pullSync 时消费执行。
    type: switch_realm(跳转页) / toast(弹提示) / pulse(时辰切换闪烁)。"""
    action_type = args.get("type", "toast")
    valid_types = {"switch_realm", "toast", "pulse"}
    if action_type not in valid_types:
        return {"error": f"type 必须是 {sorted(valid_types)}"}
    payload = args.get("payload", {}) or {}
    if action_type == "switch_realm":
        if payload.get("realm") not in ("plan", "record", "review"):
            return {"error": "payload.realm 必须是 plan/record/review"}
    now = datetime.now()
    action = {
        "id": "ac-" + str(int(now.timestamp() * 1000)),
        "type": action_type,
        "payload": payload,
        "message": args.get("message", ""),
        "created_at": now.isoformat(),
        "consumed": False,
    }
    acts = data.setdefault("actions", [])
    acts.append(action)
    # 仅保留最近 50 条，避免无限增长
    if len(acts) > 50:
        data["actions"] = acts[-50:]
    _write_raw(DATA_PATH, data)
    pending = sum(1 for a in data["actions"] if not a.get("consumed"))
    return {"ok": True, "action": action, "pending_count": pending}


def update_schedule(args, data):
    """晚间复盘写回：批量更新某日的任务（覆盖该日计划）。"""
    d = args.get("date", today_str())
    new_tasks = args.get("tasks", {})
    data.setdefault("tasks", {})[d] = new_tasks
    _write_raw(DATA_PATH, data)
    return {"ok": True, "date": d, "periods": len(new_tasks)}


def add_hermes_note(args, data):
    """Hermes 写入总结/规划/洞察文本（晨间简报、晚间复盘等），同步显示到曼陀罗对话区。"""
    import time as _t
    text = args.get("text", "").strip()
    if not text:
        return {"error": "text 不能为空"}
    note = {
        "id": "hn-" + str(int(_t.time() * 1000)),
        "type": args.get("type", "summary"),  # summary|plan|insight
        "text": text,
        "date": args.get("date", today_str()),
        "at": datetime.now().isoformat(),
    }
    data.setdefault("hermesNotes", []).append(note)
    # 仅保留最近 50 条，避免无限增长
    if len(data["hermesNotes"]) > 50:
        data["hermesNotes"] = data["hermesNotes"][-50:]
    _write_raw(DATA_PATH, data)
    return {"ok": True, "note": note}


def add_inbox_item(args, data):
    """Hermes 写入卡片型收集箱项（wiki 知识/微信文章总结/待读），0 token，前端渲染成卡片。"""
    import time as _t
    title = args.get("title", "").strip()
    if not title:
        return {"error": "title 不能为空"}
    item = {
        "id": "ic-" + str(int(_t.time() * 1000)),
        "kind": "card",  # 卡片型（区别于速记型）
        "type": args.get("type", "reading"),  # reading|wiki|summary
        "title": title,
        "summary": args.get("summary", "").strip(),
        "link": args.get("link", "").strip(),
        "source": args.get("source", "").strip(),
        "created": today_str(),
        "createdAt": int(_t.time() * 1000),
        "done": False,
    }
    data.setdefault("inbox", []).insert(0, item)  # 最新在前
    _write_raw(DATA_PATH, data)
    return {"ok": True, "item": item}


# ---------- MCP 工具注册表 ----------
TOOLS = [
    {"name": "get_tasks", "description": "获取指定日期的曼陀罗时辰任务（9时辰×9格）",
     "inputSchema": {"type": "object", "properties": {
         "date": {"type": "string", "description": "YYYY-MM-DD，默认今天"}}, "required": []}},
    {"name": "add_task", "description": "向某时辰格子添加任务",
     "inputSchema": {"type": "object", "properties": {
         "date": {"type": "string"}, "period": {"type": "integer", "minimum": 1, "maximum": 9},
         "slot": {"type": "integer"}, "text": {"type": "string"}}, "required": ["text"]}},
    {"name": "complete_task", "description": "标记任务完成并写记录",
     "inputSchema": {"type": "object", "properties": {
         "date": {"type": "string"}, "period": {"type": "integer"}, "index": {"type": "integer"}},
         "required": ["index"]}},
    {"name": "get_long_tasks", "description": "获取全部长期任务（含知识评估7维度）",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "score_eval", "description": "为长期任务的知识评估维度打分(1-5)",
     "inputSchema": {"type": "object", "properties": {
         "id": {"type": "string"}, "dim_code": {"type": "string", "enum": ["Cl","Cp","B","L","Ev","P","Rh"]},
         "sub_key": {"type": "string"}, "score": {"type": "integer", "minimum": 1, "maximum": 5}},
         "required": ["id", "dim_code", "sub_key", "score"]}},
    {"name": "get_today_plan", "description": "获取今日全时辰计划概览（晨间简报用）",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_current_context", "description": "获取当前时辰上下文：上一时辰汇总(含未完成) + 本时辰任务 + 下一时辰预告。时辰切换对话用，Hermes 可据此说\"刚才漏了X，接下来做Y\"",
     "inputSchema": {"type": "object", "properties": {
         "date": {"type": "string", "description": "YYYY-MM-DD，默认今天"}}, "required": []}},
    {"name": "trigger_action", "description": "Hermes 触发 PWA 动作：switch_realm(跳转计划/记录/复盘页) / toast(弹文字提示) / pulse(时辰切换闪烁)。PWA 下次 pullSync 时消费执行",
     "inputSchema": {"type": "object", "properties": {
         "type": {"type": "string", "enum": ["switch_realm", "toast", "pulse"]},
         "payload": {"type": "object", "description": "switch_realm 时必填 {realm: plan|record|review}"},
         "message": {"type": "string", "description": "可选文字提示，toast/pulse 时显示给用户"}},
         "required": ["type"]}},
    {"name": "update_schedule", "description": "批量更新某日任务计划（晚间复盘写回）",
     "inputSchema": {"type": "object", "properties": {
         "date": {"type": "string"}, "tasks": {"type": "object"}}, "required": ["tasks"]}},
    {"name": "add_hermes_note", "description": "Hermes 写入总结/规划/洞察文本（晨间简报、晚间复盘），同步显示到曼陀罗对话区",
     "inputSchema": {"type": "object", "properties": {
         "text": {"type": "string"}, "type": {"type": "string", "enum": ["summary", "plan", "insight"]},
         "date": {"type": "string"}}, "required": ["text"]}},
    {"name": "add_inbox_item", "description": "Hermes 写入卡片型收集箱项（wiki知识/微信文章总结/待读），0 token，前端渲染成卡片",
     "inputSchema": {"type": "object", "properties": {
         "title": {"type": "string"}, "type": {"type": "string", "enum": ["reading", "wiki", "summary"]},
         "summary": {"type": "string"}, "link": {"type": "string"}, "source": {"type": "string"}},
         "required": ["title"]}},
]

TOOL_FUNCS = {
    "get_tasks": get_tasks, "add_task": add_task, "complete_task": complete_task,
    "get_long_tasks": get_long_tasks, "score_eval": score_eval,
    "get_today_plan": get_today_plan, "get_current_context": get_current_context,
    "trigger_action": trigger_action, "update_schedule": update_schedule,
    "add_hermes_note": add_hermes_note, "add_inbox_item": add_inbox_item,
}


# ---------- MCP stdio 协议层 ----------
def send(msg):
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def handle(req, data_path):
    method = req.get("method", "")
    rid = req.get("id")
    params = req.get("params", {}) or {}

    if method == "initialize":
        send({"jsonrpc": "2.0", "id": rid, "result": {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            "capabilities": {"tools": {}}}})
    elif method == "notifications/initialized":
        pass  # 无需响应
    elif method == "tools/list":
        send({"jsonrpc": "2.0", "id": rid, "result": {"tools": TOOLS}})
    elif method == "tools/call":
        name = params.get("name")
        args = params.get("arguments", {}) or {}
        data = _read_raw(data_path)
        func = TOOL_FUNCS.get(name)
        if not func:
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"未知工具: {name}"}})
            return
        try:
            result = func(args, data)
            send({"jsonrpc": "2.0", "id": rid, "result": {
                "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}]}})
        except Exception as e:
            send({"jsonrpc": "2.0", "id": rid, "result": {
                "isError": True,
                "content": [{"type": "text", "text": f"工具执行出错: {e}"}]}})
    elif method == "shutdown":
        send({"jsonrpc": "2.0", "id": rid, "result": {}})


def main():
    global DATA_PATH
    ap = argparse.ArgumentParser(description="mandala-mcp: 曼陀罗时辰 MCP 服务")
    ap.add_argument("--data", default=DATA_PATH, help="数据文件路径（默认 ~/.mandala/data.json）")
    args = ap.parse_args()
    DATA_PATH = os.path.expanduser(args.data)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            handle(req, DATA_PATH)
        except json.JSONDecodeError:
            continue
        except BrokenPipeError:
            break


if __name__ == "__main__":
    main()
