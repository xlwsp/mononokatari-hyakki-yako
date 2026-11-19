#!/bin/bash
# ゲームを更新する（毎回これを使う）
#   1. メンテナンス開始：遊んでいる人はロビーに戻り「メンテナンス中」になる（セーブは保存される）
#   2. GitHub Pages に新しいゲームを公開して、反映されるまで待つ
#   3. サーバーを新しい内容で起動し直す
#   4. メンテナンス終了：遊んでいる人の画面は自動で最新版に読み込み直される
#   使い方:  bash update.sh
cd "$(dirname "$0")"
PORT=${PORT:-8000}
GH=tools/bin/gh

echo "🔧 メンテナンスを開始します…"
touch tools/maintenance
sleep 2

echo "📦 GitHub に公開しています…"
if ! bash publish_github.sh; then
  echo "公開に失敗しました。メンテナンスを終了します"
  rm -f tools/maintenance
  exit 1
fi

# GitHub Pages に反映されるのを待つ（最大4分）
REPO=$(grep -E '^REPO=' tools/github.conf 2>/dev/null | cut -d= -f2-)
SHA=$(git rev-parse HEAD)
if [ -n "$REPO" ]; then
  echo "⏳ 公開ページへの反映を待っています…"
  for i in $(seq 1 48); do
    LINE=$("$GH" api "repos/$REPO/pages/builds/latest" --jq '.status + " " + .commit' 2>/dev/null)
    if [ "$LINE" = "built $SHA" ]; then echo "   反映されました"; break; fi
    sleep 5
  done
fi

echo "🔄 サーバーを起動し直しています…"
PID=$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null | head -1)
if [ -n "$PID" ]; then
  kill "$PID" 2>/dev/null
  for i in $(seq 1 50); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
fi
nohup python3 server.py "$PORT" >> tools/server.log 2>&1 &
for i in $(seq 1 25); do lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 0.2; done
sleep 1

rm -f tools/maintenance
echo "✅ 更新完了！ メンテナンスを終了しました（遊んでいる人の画面は自動で最新版になります）"
