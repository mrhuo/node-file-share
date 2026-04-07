#!/bin/bash

# 文件共享平台启动脚本
# Example: ./start.sh 3000 0.0.0.0 http://your-domain.com

PORT=${1:-3000}
HOST=${2:-0.0.0.0}
BASE_URL=${3:-"http://$HOST:$PORT"}

cd "$(dirname "$0")"

echo "Starting File Share Platform..."
echo "Port: $PORT"
echo "Host: $HOST"
echo "Base URL: $BASE_URL"
echo "Running in background... (use ./stop.sh to stop)"

node index.js start \
  --port "$PORT" \
  --host "$HOST" \
  --base-url "$BASE_URL" \
  --daemon
