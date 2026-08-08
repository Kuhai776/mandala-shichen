#!/usr/bin/env bash
# 曼陀罗时辰 · MCP(stdio) + HTTP 同步服务器 合并启动
#
# 用法：
#   ./start.sh                              # 默认数据 ~/.mandala/data.json，端口 8001
#   ./start.sh --data /path/data.json --port 8001 --host 0.0.0.0
#   DATA=~/data.json PORT=8001 ./start.sh   # 环境变量也可
#
# 启动后：
#   - MCP(stdio) 供 Hermes 连接：hermes mcp add mandala --stdio -- ./start.sh
#   - HTTP 服务器供 PWA 连接：PWA 设置里填 https://你的域名/api/sync（公网需 nginx/caddy 反代 HTTPS）
#   - 两者共享同一个 data.json，PWA 写的 tasks Hermes 能读，Hermes 写的 actions PWA 能收

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DATA="${DATA:-$HOME/.mandala/data.json}"
PORT="${PORT:-8001}"
HOST="${HOST:-0.0.0.0}"

# 解析命令行参数（覆盖环境变量）
while [[ $# -gt 0 ]]; do
  case $1 in
    --data) DATA="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$DATA")"

# 启动 HTTP 同步服务器（后台）
echo "[start] 启动 HTTP 同步服务器: http://$HOST:$PORT/api/sync" >&2
python3 "$SCRIPT_DIR/mcp/sync_server.py" --data "$DATA" --port "$PORT" --host "$HOST" &
SYNC_PID=$!

# 退出时清理 HTTP 服务器
cleanup() {
  echo "[start] 关闭 HTTP 同步服务器 (PID $SYNC_PID)" >&2
  kill "$SYNC_PID" 2>/dev/null || true
  wait "$SYNC_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 启动 MCP（前台 stdio，供 Hermes 通过 stdin/stdout 通信）
echo "[start] 启动 MCP (stdio): data=$DATA" >&2
python3 "$SCRIPT_DIR/mcp/mandala-mcp.py" --data "$DATA"
