#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knowledge Decomposer —— 轻量编排器（移植自 TJ AI 知识地图核心能力）

设计依据：references/orchestration.md + references/search.md + 12 个原始 prompt
- LLM 底座：OpenAI 兼容 /v1/chat/completions，默认 DeepSeek
- 消息组装：[固定输出规则] + [固定 task/json_schema] + [本轮 volatile]
- 流程链：preview_topics → initial_map → grow_children → fp_layer → subdivide
- 搜索：Exa（HTTP 直连，mcporter 可选 fallback），缓存 7 天 TTL
- 双写：wiki（~/wiki/entities/<slug>.md） + 曼陀罗 inbox（MCP/HTTP）

用法：
    python3 decompose.py "AI Agent" --mode medium
    python3 decompose.py "AI Agent" --mode medium --write
    python3 decompose.py "AI Agent" --mode lite --provider openai --model gpt-4o-mini
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ---------- 路径常量 ----------
SCRIPT_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = SCRIPT_DIR.parent / "references" / "prompts"
WIKI_DIR = Path(os.path.expanduser("~/wiki/entities"))
SEARCH_CACHE = Path(os.path.expanduser("~/.cache/kd_search.json"))

# ---------- 档位配置（SKILL.md §输出契约） ----------
MODE_CONFIG = {
    "lite":    {"topics_min": 6,  "topics_max": 8,  "children_min": 3, "children_max": 4, "total_min": 24, "total_max": 32, "name": "Lite"},
    "medium":  {"topics_min": 8,  "topics_max": 11, "children_min": 4, "children_max": 6, "total_min": 36, "total_max": 50, "name": "Medium"},
    "zen":     {"topics_min": 10, "topics_max": 14, "children_min": 5, "children_max": 8, "total_min": 55, "total_max": 75, "name": "Zen"},
}

# ---------- LLM 底座 ----------
# 默认 DeepSeek（OpenAI 兼容），换 provider 只改 base_url + model + key
DEFAULT_PROVIDERS = {
    "deepseek":  {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat",         "key_env": "DEEPSEEK_API_KEY"},
    "openai":    {"base_url": "https://api.openai.com/v1",   "model": "gpt-4o-mini",           "key_env": "OPENAI_API_KEY"},
    "moonshot":  {"base_url": "https://api.moonshot.cn/v1",  "model": "moonshot-v1-8k",        "key_env": "MOONSHOT_API_KEY"},
    "siliconflow": {"base_url": "https://api.siliconflow.cn/v1", "model": "Qwen/Qwen2.5-7B-Instruct", "key_env": "SILICONFLOW_API_KEY"},
}


def load_prompt(name):
    """加载原始 prompt 文件（原样使用，勿改）。文件以 \\ 开头的第一行是转义符，跳过。"""
    p = PROMPTS_DIR / f"{name}.md"
    if not p.exists():
        raise FileNotFoundError(f"prompt 文件缺失：{p}")
    text = p.read_text(encoding="utf-8")
    # 文件首行是 '\' 转义符（保留字面量），跳过
    if text.startswith("\\\n"):
        text = text[2:]
    return text.strip()


def llm_chat(messages, provider="deepseek", model=None, api_key=None,
             base_url=None, temperature=0.7, max_tokens=4096, timeout=120):
    """
    OpenAI 兼容 /v1/chat/completions 调用。
    - 固定部分放首条消息（prompt 缓存友好）
    - 返回 content 字符串；失败抛异常
    """
    cfg = DEFAULT_PROVIDERS.get(provider, DEFAULT_PROVIDERS["deepseek"])
    base_url = base_url or cfg["base_url"]
    model = model or cfg["model"]
    if api_key is None:
        api_key = os.environ.get(cfg["key_env"], "")
    if not api_key:
        raise RuntimeError(f"未设置 {cfg['key_env']} 环境变量，且未通过 --api-key 传入")

    url = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},  # 强制 JSON 输出（DeepSeek/OpenAI 均支持）
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    # 沙箱代理：Java/urllib 都不自动用 HTTP_PROXY，需显式构建 opener
    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or \
                os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    if proxy_url:
        proxy_handler = urllib.request.ProxyHandler({
            "http": proxy_url,
            "https": proxy_url,
        })
        opener = urllib.request.build_opener(proxy_handler)
    else:
        opener = urllib.request.build_opener()

    try:
        with opener.open(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
        result = json.loads(body)
        content = result["choices"][0]["message"]["content"]
        # 缓存命中信息（DeepSeek 的 prompt_cache_hit_tokens 在 model_extra / usage 里）
        usage = result.get("usage", {})
        if usage.get("prompt_cache_hit_tokens"):
            sys.stderr.write(f"[cache] 命中 {usage['prompt_cache_hit_tokens']} tokens\n")
        return content
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM HTTP {e.code}: {err_body[:500]}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"LLM 网络错误: {e}") from None


def parse_json_response(text):
    """
    解析 LLM 返回的 JSON：
    - 去除可能的 markdown 包裹（```json ... ```）
    - 失败重试一次（容错）
    - relevance_score 钳制 1-3
    """
    text = text.strip()
    # 去 markdown 包裹
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    # 找第一个 { 到最后一个 }（防止前后有废话）
    first = text.find("{")
    last = text.rfind("}")
    if first >= 0 and last > first:
        text = text[first:last + 1]
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        # 尝试修复常见错误：尾随逗号
        text2 = re.sub(r",\s*([}\]])", r"\1", text)
        obj = json.loads(text2)
    # 递归钳制 relevance_score
    _clamp_relevance(obj)
    return obj


def _clamp_relevance(node):
    """relevance_score 钳制 1-3；relevance=True 默认 3，否则 2"""
    if isinstance(node, dict):
        if "relevance_score" in node:
            try:
                v = int(node["relevance_score"])
            except (TypeError, ValueError):
                v = 2
            v = max(1, min(3, v))
            node["relevance_score"] = v
            node.setdefault("relevance", v == 3)
        for v in node.values():
            _clamp_relevance(v)
    elif isinstance(node, list):
        for item in node:
            _clamp_relevance(item)


# ---------- 消息组装（核心：固定部分前置，缓存友好） ----------
def build_messages(prompt_text, volatile_data, json_schema_hint=None):
    """
    messages = [固定输出规则] + [固定 task/instructions/json_schema] + [本轮 volatile]

    实现：
    - system：固定输出规则（只输出 JSON + 防幻觉硬规则）
    - user[0]：固定 task prompt + json_schema 约束（每轮不变，缓存命中）
    - user[1]：本轮 volatile 数据（JSON dump，ensure_ascii=False）
    """
    fixed_output_rule = (
        "【输出硬规则】\n"
        "1. 只输出一个 JSON 对象，禁止输出任何其他文字、markdown、代码块标记\n"
        "2. 所有论断必须来自搜索结果或公认事实；没有来源的标注「（推断）」\n"
        "3. 引用格式：[来源N]，来源列表附在回答尾部\n"
        "4. 数字/日期/人物头衔必须有来源；搜索不到的显式说「未检索到」，禁止编造\n"
    )
    if json_schema_hint:
        fixed_output_rule += f"5. JSON 结构必须符合：{json_schema_hint}\n"

    volatile_json = json.dumps(volatile_data, ensure_ascii=False, indent=2)
    return [
        {"role": "system", "content": fixed_output_rule},
        {"role": "user", "content": prompt_text + "\n\n【本轮输入数据】\n" + volatile_json},
    ]


# ---------- Exa 搜索 ----------
def search_exa(query, num_results=5, site_whitelist=None, use_cache=True):
    """
    Exa 语义检索（防幻觉 + 省 token）。
    优先 mcporter，fallback 到 HTTP 直连（EXA_API_KEY 环境变量）。
    缓存：~/.cache/kd_search.json，TTL 7 天。
    """
    # 缓存查
    cache_key = hashlib.sha256(f"{query}|{site_whitelist or ''}".encode("utf-8")).hexdigest()
    cache = _load_search_cache() if use_cache else {}
    if cache_key in cache:
        entry = cache[cache_key]
        age = time.time() - entry.get("ts", 0)
        if age < 7 * 86400:
            sys.stderr.write(f"[search] 缓存命中：{query[:40]}\n")
            return entry["results"]

    full_query = query
    if site_whitelist:
        full_query = f"{query} site:{site_whitelist}"

    # 方式 1：mcporter（SKILL.md 推荐）
    results = _search_via_mcporter(full_query, num_results)
    # 方式 2：HTTP 直连 Exa
    if not results:
        results = _search_via_http(full_query, num_results)

    # 截断每条到 200 字（省 token）
    for r in results:
        if r.get("text") and len(r["text"]) > 200:
            r["text"] = r["text"][:200] + "..."

    # 写缓存
    if use_cache and results:
        cache[cache_key] = {"query": query, "ts": time.time(), "results": results}
        _save_search_cache(cache)

    return results


def _search_via_mcporter(query, num_results):
    """通过 mcporter call 'exa.web_search_exa(...)' 调用（SKILL.md 指定方式）"""
    try:
        cmd = ["mcporter", "call", f"exa.web_search_exa(query: {json.dumps(query)}, numResults: {num_results})"]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return []
        # mcporter 输出格式不确定，尝试解析 JSON
        out = r.stdout.strip()
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            # 尝试提取 JSON 数组
            m = re.search(r"\[.*\]", out, re.DOTALL)
            if m:
                return json.loads(m.group(0))
            return []
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []


def _search_via_http(query, num_results):
    """直接调 Exa HTTP API（mcporter 不可用时的 fallback）"""
    api_key = os.environ.get("EXA_API_KEY", "")
    if not api_key:
        sys.stderr.write(f"[search] 跳过搜索（无 EXA_API_KEY 也无 mcporter）：{query[:40]}\n")
        return []
    payload = {"query": query, "numResults": num_results, "contents": {"text": True}}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.exa.ai/search",
        data=data,
        headers={"Content-Type": "application/json", "x-api-key": api_key},
        method="POST",
    )
    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
    ) if proxy_url else urllib.request.build_opener()
    try:
        with opener.open(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return [
            {"title": r.get("title", ""), "url": r.get("url", ""), "text": r.get("text", "")}
            for r in body.get("results", [])
        ]
    except (urllib.error.URLError, json.JSONDecodeError) as e:
        sys.stderr.write(f"[search] Exa HTTP 失败：{e}\n")
        return []


def _load_search_cache():
    if not SEARCH_CACHE.exists():
        return {}
    try:
        return json.loads(SEARCH_CACHE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_search_cache(cache):
    SEARCH_CACHE.parent.mkdir(parents=True, exist_ok=True)
    SEARCH_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------- 流程链 ----------
def step_preview_topics(field, current_problem, background_text, mode, llm_kwargs):
    """步骤 1：AI 先出 4-6 个候选主题（标题+一句话）让用户确认"""
    cfg = MODE_CONFIG[mode]
    prompt = load_prompt("preview_topics_default")
    volatile = {
        "field": field,
        "current_problem": current_problem,
        "background_text": background_text,
        "mode_name": cfg["name"],
        "topics_min": cfg["topics_min"],
        "topics_max": cfg["topics_max"],
    }
    schema = '{"topics": [{"title": str, "summary": str}]}'
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, **llm_kwargs)
    return parse_json_response(raw)


def step_initial_map(field, current_problem, background_text, mode, llm_kwargs,
                     topics_override=None):
    """
    步骤 2：一次性生成两层知识地图。
    - topics_override：用户确认/覆盖后的主干标题列表，直接建主干不再调 AI 拆树
    - children 留空，由后续 grow_children 流式补齐
    """
    cfg = MODE_CONFIG[mode]
    prompt = load_prompt("initial_map_default")

    if topics_override:
        # 用户覆盖：直接建主干，children 留空
        topics = []
        for t in topics_override:
            title = t if isinstance(t, str) else t.get("title", "")
            summary = t.get("summary", "") if isinstance(t, dict) else ""
            topics.append({
                "id": _gen_id("n"),
                "title": title,
                "summary": summary,
                "parent_id": None,
                "children": [],
                "relevance": True,
                "relevance_score": 2,
            })
        return {"topics": topics, "mode": "override"}

    volatile = {
        "field": field,
        "current_problem": current_problem,
        "background_text": background_text,
        "mode_name": cfg["name"],
        "topics_min": cfg["topics_min"],
        "topics_max": cfg["topics_max"],
        "children_min": cfg["children_min"],
        "children_max": cfg["children_max"],
        "total_min": cfg["total_min"],
        "total_max": cfg["total_max"],
    }
    schema = (
        '{"topics": [{"id": str, "title": str, "summary": str, "parent_id": null, '
        '"children": [{"id": str, "title": str, "summary": str, "importance": int, '
        '"relevance_score": int, "difficulty": int}], "relevance_score": int}]}'
    )
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=8192, **llm_kwargs)
    result = parse_json_response(raw)
    # 补 id + parent_id
    for topic in result.get("topics", []):
        topic["id"] = topic.get("id") or _gen_id("n")
        topic["parent_id"] = None
        for child in topic.get("children", []):
            child["id"] = child.get("id") or _gen_id("n")
            child["parent_id"] = topic["id"]
    return result


def step_grow_children(field, current_problem, background_text, mode, llm_kwargs,
                       parent_topic):
    """
    步骤 3：为某个一级主干节点生成具体二级子节点（流式补齐）。
    - 搜索：先 Exa 检索该 topic，结果拼进 volatile 防幻觉
    """
    cfg = MODE_CONFIG[mode]
    prompt = load_prompt("expand_children_default")
    # 搜索该 topic
    search_results = search_exa(f"{field} {parent_topic['title']}", num_results=4)
    volatile = {
        "field": field,
        "current_problem": current_problem,
        "topic_title": parent_topic["title"],
        "topic_summary": parent_topic.get("summary", ""),
        "child_count": f"{cfg['children_min']}-{cfg['children_max']}",
        "search_results": search_results,
    }
    schema = (
        '{"children": [{"id": str, "title": str, "summary": str, "importance": int, '
        '"relevance_score": int, "difficulty": int, "prerequisites": [str]}]}'
    )
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=4096, **llm_kwargs)
    result = parse_json_response(raw)
    # 补 id + parent_id
    for child in result.get("children", []):
        child["id"] = child.get("id") or _gen_id("n")
        child["parent_id"] = parent_topic["id"]
    return result


def step_first_principles(field, current_problem, node, llm_kwargs, current_depth=2, max_depth=5):
    """
    步骤 4：首性原理层——找"要真正理解它，必须先掌握的更底层依赖"。
    - 已经是基础公理 → is_fundamental=true，返回空 children
    """
    prompt = load_prompt("first_principles_default")
    node_path = node.get("path", node["title"])
    volatile = {
        "field": field,
        "current_problem": current_problem,
        "node_title": node["title"],
        "node_summary": node.get("summary", ""),
        "node_path": node_path,
        "current_depth": current_depth,
        "max_depth": max_depth,
    }
    schema = (
        '{"children": [{"title": str, "summary": str, "relation": str, "why": str, '
        '"is_fundamental": bool}], "is_fundamental": bool, "reached_bottom": bool}'
    )
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=2048, **llm_kwargs)
    return parse_json_response(raw)


def step_subdivide(field, current_problem, node, existing_children_titles, llm_kwargs,
                   target_child_count=4):
    """
    步骤 5：细分节点——把当前节点拆成中间分支 + 具体子节点。
    - existing_children_titles 截断到 12 个（省 token）
    """
    prompt = load_prompt("subdivide_default")
    # 截断到 12 个（按标题排序）
    truncated = sorted(existing_children_titles)[:12]
    volatile = {
        "field": field,
        "current_problem": current_problem,
        "current_node": {"title": node["title"], "summary": node.get("summary", "")},
        "existing_paths_in_map": truncated,
        "target_child_count": target_child_count,
    }
    schema = (
        '{"middle_title": str, "middle_summary": str, "children": [{"id": str, "title": str, '
        '"summary": str, "importance": int, "relevance_score": int, "difficulty": int}], '
        '"reply": str, "next_actions": [{"kind": str, "label": str, "target_title": str, "payload": str}]}'
    )
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=4096, **llm_kwargs)
    return parse_json_response(raw)


def step_multi_angle_subdivide(field, current_problem, node, angles, llm_kwargs,
                               existing_titles=None, per_angle_child_count=4):
    """
    步骤 6：多角度细分——按用户指定的多个角度一次性把当前节点全部拆开。
    - angles: 角度短词数组，如 ['构成组成', '指标评估']
    - 输出 groups 数组，长度 = angles 长度，顺序对应
    - 每个 group 包含 middle_title + middle_summary + children[]
    """
    prompt = load_prompt("multi_angle_subdivide_default")
    volatile = {
        "field": field,
        "current_problem": current_problem,
        "current_node": {"title": node["title"], "summary": node.get("summary", "")},
        "angles": angles,
        "existing_titles": (existing_titles or [])[:12],  # 截断省 token
        "per_angle_child_count": per_angle_child_count,
    }
    schema = (
        '{"groups": [{"middle_title": str, "middle_summary": str, "children": '
        '[{"id": str, "title": str, "summary": str, "importance": int, '
        '"relevance_score": int, "difficulty": int}]}], "reply": str}'
    )
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=6144, **llm_kwargs)
    result = parse_json_response(raw)
    # 补 id + parent_id
    for group in result.get("groups", []):
        for child in group.get("children", []):
            child["id"] = child.get("id") or _gen_id("n")
            child["parent_id"] = node["id"]
    return result


def step_deep_reanswer(field, current_problem, original_user_message, node, llm_kwargs):
    """
    步骤 7：深度重答——基于深度搜索资料重新回答用户问题。
    - 先 Exa 深度搜索（5 条），把资料拼进 volatile
    - 综合成更可靠、更具体的回答，资料矛盾时指出不确定性
    - 顶层 reply 字段承载完整回答文本
    """
    prompt = load_prompt("deep_reanswer_default")
    # 深度搜索：节点标题 + 用户问题
    search_query = f"{field} {node['title']} {original_user_message}"
    search_results = search_exa(search_query, num_results=5)
    volatile = {
        "field": field,
        "current_problem": current_problem,
        "original_user_message": original_user_message,
        "current_node": {"title": node["title"], "summary": node.get("summary", "")},
        "deep_search_sources": search_results,
    }
    schema = '{"reply": str, "sources": [{"title": str, "url": str}]}'
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=3072, **llm_kwargs)
    return parse_json_response(raw)


def step_peek(field, current_problem, node, followup_question, background_text,
              mode, llm_kwargs, char_limit=400):
    """
    步骤 8：Peek Definition——快速定义/追问，把答案带到原文旁边。
    - 控制在 char_limit 字以内（Lite 短答，Zen 充分）
    - 严禁主语替换：必须围绕 followup_question 里的主语回答
    - 不知道就承认，不硬编数据
    """
    prompt = load_prompt("peek_default")
    cfg = MODE_CONFIG[mode]
    volatile = {
        "field": field,
        "current_problem": current_problem,
        "current_node": {"title": node["title"], "summary": node.get("summary", "")},
        "followup_question": followup_question,
        "learning_background": background_text,
        "char_limit": char_limit,
        "mode": cfg["name"],
    }
    schema = '{"answer": str, "sources": [{"title": str, "url": str}]}'
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=1024, **llm_kwargs)
    return parse_json_response(raw)


def step_explain(field, current_problem, node, background_text, mode, llm_kwargs,
                 existing_children=None, sibling_titles=None):
    """
    步骤 9：深入讲解——叶子节点的详细解释（Markdown）。
    - 分组节点(is_grouping_node=true)：只做导览，不展开 child 内容
    - 叶子节点(is_grouping_node=false)：按 A/B 规则讲（术语短答 vs 深入讨论）
    - 顶层 reply 字段承载完整回答，禁止用 answer/sections 等其他字段
    - 篇幅按档位：Lite 短答，Medium 充分，Zen 深度
    """
    prompt = load_prompt("explain_default")
    cfg = MODE_CONFIG[mode]
    # 判断是否分组节点：有 children 就是分组节点
    children = existing_children or node.get("children", [])
    is_grouping = bool(children)

    # 篇幅目标按档位
    char_targets = {
        "lite":   {"term": 200, "deep": 400,  "grouping": 300},
        "medium": {"term": 400, "deep": 800,  "grouping": 500},
        "zen":    {"term": 700, "deep": 1500, "grouping": 800},
    }
    targets = char_targets[mode]

    # 节点路径（从根到它）
    node_path = node.get("path", node["title"])

    volatile = {
        "field": field,
        "current_problem": current_problem,
        "current_node": {
            "title": node["title"],
            "summary": node.get("summary", ""),
            "is_grouping_node": is_grouping,
        },
        "node_path": node_path,
        "sibling_titles": (sibling_titles or [])[:8],
        "existing_child_titles": [c.get("title", c) if isinstance(c, dict) else c for c in children][:12],
        "existing_children_with_summary": [
            {"title": c.get("title", ""), "summary": c.get("summary", "")}
            for c in children if isinstance(c, dict)
        ][:12],
        "learning_background": background_text,
        "mode": cfg["name"],
        "is_grouping_node": is_grouping,
        "term_target": targets["term"],
        "deep_target": targets["deep"],
        "grouping_target": targets["grouping"],
    }
    schema = (
        '{"reply": str, "next_actions": [{"kind": str, "label": str, '
        '"target_title": str, "payload": str}]}'
    )
    messages = build_messages(prompt, volatile, schema)
    raw = llm_chat(messages, max_tokens=2048, **llm_kwargs)
    return parse_json_response(raw)


# ---------- 工具函数 ----------
def _gen_id(prefix="n"):
    return f"{prefix}-{int(time.time() * 1000) % 1000000}-{hash(str(time.time())) % 10000}"


def _slugify(text):
    """生成 wiki 文件名 slug（中文保留，空格转连字符）"""
    text = re.sub(r"[^\w\u4e00-\u9fff\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", text).strip("-")[:60]


# ---------- 双写 ----------
def write_wiki(field, knowledge_tree):
    """写 wiki：主题 → ~/wiki/entities/<slug>.md（frontmatter + wikilinks）"""
    WIKI_DIR.mkdir(parents=True, exist_ok=True)
    slug = _slugify(field)
    fp = WIKI_DIR / f"{slug}.md"

    frontmatter = {
        "title": field,
        "type": "knowledge-map",
        "created": datetime.now(timezone.utc).isoformat(),
        "mode": knowledge_tree.get("mode", "medium"),
    }
    lines = ["---"]
    for k, v in frontmatter.items():
        lines.append(f"{k}: {v}")
    lines += ["---", "", f"# {field}", ""]

    for topic in knowledge_tree.get("topics", []):
        lines.append(f"## {topic['title']}")
        if topic.get("summary"):
            lines.append(f"\n{topic['summary']}\n")
        for child in topic.get("children", []):
            lines.append(f"- [[{_slugify(child['title'])}|{child['title']}]] — {child.get('summary', '')}")
        lines.append("")

    fp.write_text("\n".join(lines), encoding="utf-8")
    sys.stderr.write(f"[wiki] 已写入：{fp}\n")
    return fp


def write_mandala_inbox(field, knowledge_tree, mcp_data_file=None):
    """
    写曼陀罗 inbox：高亮卡片 → MCP add_inbox_item（type=wiki）
    - mcp_data_file：~/.mandala/data.json 路径，直接追加 inbox 项（绕过 MCP stdio）
    - 不传则跳过（仅 wiki）
    """
    if not mcp_data_file:
        sys.stderr.write("[mandala] 未指定 data.json 路径，跳过 inbox 双写\n")
        return 0

    data_path = Path(os.path.expanduser(mcp_data_file))
    if not data_path.exists():
        data_path.parent.mkdir(parents=True, exist_ok=True)
        data = {"inbox": []}
    else:
        try:
            data = json.loads(data_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {"inbox": []}
    data.setdefault("inbox", [])

    count = 0
    existing_ids = {i.get("id") for i in data["inbox"] if i.get("id")}
    for topic in knowledge_tree.get("topics", []):
        item_id = f"in-kd-{_slugify(topic['title'])}-{int(time.time())}"
        if item_id in existing_ids:
            continue
        data["inbox"].append({
            "id": item_id,
            "kind": "card",
            "type": "wiki",
            "title": f"【{field}】{topic['title']}",
            "summary": topic.get("summary", ""),
            "link": "",
            "source": "knowledge-decomposer",
            "createdAt": int(time.time() * 1000),
            "done": False,
        })
        count += 1

    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    sys.stderr.write(f"[mandala] 已写入 {count} 张卡片到 {data_path}\n")
    return count


# ---------- 主流程 ----------
def run_decompose(field, mode="medium", current_problem="", background_text="",
                  topics_override=None, do_write=False, mcp_data_file=None, llm_kwargs=None):
    """主编排流程：preview → initial_map → grow_children（所有 topic）→ fp_layer（首层）"""
    llm_kwargs = llm_kwargs or {}
    cfg = MODE_CONFIG[mode]
    sys.stderr.write(f"\n=== Knowledge Decomposer ===\n主题：{field}\n档位：{cfg['name']}\n\n")

    # 步骤 1：preview（CLI 模式直接跳过用户确认，用 AI 给的候选）
    sys.stderr.write("[1/4] 预览候选主题...\n")
    preview = step_preview_topics(field, current_problem or field, background_text, mode, llm_kwargs)
    topics_preview = preview.get("topics", [])
    sys.stderr.write(f"  候选 {len(topics_preview)} 个主题\n")
    for i, t in enumerate(topics_preview, 1):
        sys.stderr.write(f"    {i}. {t.get('title', '')}\n")

    # CLI 自动确认（不阻塞），用 preview 结果作为 override 加速 initial_map
    use_override = topics_preview if topics_override is None else topics_override

    # 步骤 2：initial_map（用 override 建主干，children 留空）
    sys.stderr.write("\n[2/4] 生成初始地图主干（children 待补）...\n")
    tree = step_initial_map(field, current_problem or field, background_text, mode, llm_kwargs,
                           topics_override=use_override)
    topics = tree.get("topics", [])
    sys.stderr.write(f"  主干 {len(topics)} 个节点\n")

    # 步骤 3：grow_children（为每个 topic 流式补齐 children）
    sys.stderr.write("\n[3/4] 为每个主干补齐 children...\n")
    for i, topic in enumerate(topics, 1):
        sys.stderr.write(f"  [{i}/{len(topics)}] {topic['title']}...\n")
        try:
            children_result = step_grow_children(
                field, current_problem or field, background_text, mode, llm_kwargs, topic
            )
            topic["children"] = children_result.get("children", [])
            sys.stderr.write(f"    → {len(topic['children'])} 个 children\n")
        except Exception as e:
            sys.stderr.write(f"    ✗ 失败：{e}\n")
            topic["children"] = []

    # 统计
    total = sum(len(t.get("children", [])) for t in topics) + len(topics)
    sys.stderr.write(f"\n  总节点数：{total}（目标 {cfg['total_min']}-{cfg['total_max']}）\n")

    # 步骤 4：首性原理层（对首层 topic 各做一次，找底层依赖）
    sys.stderr.write("\n[4/4] 首性原理层（找底层依赖）...\n")
    fp_layer = []
    for topic in topics[:3]:  # 只对前 3 个 topic 做，控制成本
        try:
            fp = step_first_principles(
                field, current_problem or field, topic, llm_kwargs,
                current_depth=1, max_depth=5
            )
            fp_layer.append({"topic": topic["title"], "first_principles": fp})
            sys.stderr.write(f"  {topic['title']} → {len(fp.get('children', []))} 个底层依赖\n")
        except Exception as e:
            sys.stderr.write(f"  {topic['title']} ✗ {e}\n")

    tree["first_principles_layer"] = fp_layer
    tree["mode"] = mode
    tree["field"] = field

    # 双写
    if do_write:
        sys.stderr.write("\n=== 双写产出 ===\n")
        write_wiki(field, tree)
        write_mandala_inbox(field, tree, mcp_data_file)

    return tree


def main():
    parser = argparse.ArgumentParser(
        description="Knowledge Decomposer —— 知识拆解器（移植自 TJ）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
示例：
  python3 decompose.py decompose "AI Agent" --mode medium
  python3 decompose.py decompose "AI Agent" --mode medium --write
  python3 decompose.py explain "AI Agent" --node "ReAct 模式" --mode medium
  python3 decompose.py peek "AI Agent" --node "ReAct" --question "ReAct 和 Reflexion 区别"
  python3 decompose.py subdivide "AI Agent" --node "工具调用" --existing "规划,执行"
  python3 decompose.py multi-angle "AI Agent" --node "工具调用" --angles "构成组成" "风险失败模式"
  python3 decompose.py deep-reanswer "AI Agent" --node "ReAct" --message "ReACT 的最新进展"
""",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # 公共参数函数
    def add_common(p):
        p.add_argument("field", help="主题")
        p.add_argument("--problem", "-p", default="", help="用户当前要解决的问题")
        p.add_argument("--background", "-b", default="", help="学习背景")
        p.add_argument("--provider", default="deepseek", choices=list(DEFAULT_PROVIDERS.keys()))
        p.add_argument("--model", default=None)
        p.add_argument("--api-key", default=None)
        p.add_argument("--base-url", default=None)
        p.add_argument("--output", "-o", default=None)

    # decompose：完整流程
    p_dec = sub.add_parser("decompose", help="完整拆解流程（preview→map→grow→fp）")
    add_common(p_dec)
    p_dec.add_argument("--mode", choices=["lite", "medium", "zen"], default="medium")
    p_dec.add_argument("--write", action="store_true")
    p_dec.add_argument("--mcp-data", default="~/.mandala/data.json")

    # peek：快速定义/追问
    p_peek = sub.add_parser("peek", help="Peek 快速定义/追问")
    add_common(p_peek)
    p_peek.add_argument("--mode", choices=["lite", "medium", "zen"], default="medium")
    p_peek.add_argument("--node", required=True, help="当前节点标题")
    p_peek.add_argument("--node-summary", default="")
    p_peek.add_argument("--question", required=True, help="追问问题")
    p_peek.add_argument("--char-limit", type=int, default=400)

    # explain：深入讲解
    p_exp = sub.add_parser("explain", help="深入讲解（Markdown）")
    add_common(p_exp)
    p_exp.add_argument("--mode", choices=["lite", "medium", "zen"], default="medium")
    p_exp.add_argument("--node", required=True, help="当前节点标题")
    p_exp.add_argument("--node-summary", default="")
    p_exp.add_argument("--children", nargs="*", default=[], help="已有 children 标题（逗号分隔或多个）")

    # subdivide：细分节点
    p_sub = sub.add_parser("subdivide", help="细分节点为中间分支+子节点")
    add_common(p_sub)
    p_sub.add_argument("--node", required=True, help="当前节点标题")
    p_sub.add_argument("--node-summary", default="")
    p_sub.add_argument("--existing", nargs="*", default=[], help="已有 children 标题")
    p_sub.add_argument("--target", type=int, default=4, help="目标 children 数量")

    # multi-angle：多角度细分
    p_ma = sub.add_parser("multi-angle", help="多角度一次性拆开")
    add_common(p_ma)
    p_ma.add_argument("--node", required=True, help="当前节点标题")
    p_ma.add_argument("--node-summary", default="")
    p_ma.add_argument("--angles", nargs="+", required=True, help="角度短词数组")
    p_ma.add_argument("--existing", nargs="*", default=[])
    p_ma.add_argument("--per-angle", type=int, default=4)

    # deep-reanswer：深度重答
    p_dr = sub.add_parser("deep-reanswer", help="基于深度搜索重新回答")
    add_common(p_dr)
    p_dr.add_argument("--node", required=True, help="当前节点标题")
    p_dr.add_argument("--node-summary", default="")
    p_dr.add_argument("--message", required=True, help="原始用户消息")

    args = parser.parse_args()

    llm_kwargs = {
        "provider": args.provider,
        "model": args.model,
        "api_key": args.api_key,
        "base_url": args.base_url,
    }

    try:
        if args.cmd == "decompose":
            result = run_decompose(
                field=args.field,
                mode=args.mode,
                current_problem=args.problem,
                background_text=args.background,
                do_write=args.write,
                mcp_data_file=os.path.expanduser(args.mcp_data) if args.write else None,
                llm_kwargs=llm_kwargs,
            )
        elif args.cmd == "peek":
            node = {"title": args.node, "summary": args.node_summary}
            result = step_peek(args.field, args.problem, node, args.question,
                               args.background, args.mode, llm_kwargs, args.char_limit)
        elif args.cmd == "explain":
            children = [{"title": c} for c in args.children] if args.children else []
            node = {"title": args.node, "summary": args.node_summary}
            result = step_explain(args.field, args.problem, node, args.background,
                                  args.mode, llm_kwargs, existing_children=children)
        elif args.cmd == "subdivide":
            node = {"title": args.node, "summary": args.node_summary}
            result = step_subdivide(args.field, args.problem, node, args.existing,
                                    llm_kwargs, target_child_count=args.target)
        elif args.cmd == "multi-angle":
            node = {"title": args.node, "summary": args.node_summary}
            result = step_multi_angle_subdivide(args.field, args.problem, node, args.angles,
                                                llm_kwargs, existing_titles=args.existing,
                                                per_angle_child_count=args.per_angle)
        elif args.cmd == "deep-reanswer":
            node = {"title": args.node, "summary": args.node_summary}
            result = step_deep_reanswer(args.field, args.problem, args.message, node, llm_kwargs)
        else:
            parser.error(f"未知子命令：{args.cmd}")
    except KeyboardInterrupt:
        sys.stderr.write("\n已中断\n")
        sys.exit(130)
    except Exception as e:
        sys.stderr.write(f"\n✗ 失败：{e}\n")
        sys.exit(1)

    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        sys.stderr.write(f"\n✓ 已输出到 {args.output}\n")
    else:
        print(output)


if __name__ == "__main__":
    main()
