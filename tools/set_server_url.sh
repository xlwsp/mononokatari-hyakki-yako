#!/bin/bash
# GitHub の server.json に、今のサーバーのURLを書き込む（GitHub Pages のゲームがここを見てつなぐ）
#   使い方: bash tools/set_server_url.sh wss://xxxx.trycloudflare.com/ws   （空にすると「止まっている」）
cd "$(dirname "$0")/.."
GH=tools/bin/gh
[ -f tools/github.conf ] || exit 0
REPO=$(grep -E '^REPO=' tools/github.conf | cut -d= -f2- | tr -d ' "')
[ -n "$REPO" ] && [ -x "$GH" ] || exit 0
WS="$1"
JSON=$(printf '{"ws":"%s","updated":"%s"}\n' "$WS" "$(date '+%Y-%m-%d %H:%M:%S')")
CONTENT=$(printf '%s' "$JSON" | base64 | tr -d '\n')
# ページ（main ブランチ）を作り直さなくていいよう、server ブランチに置く
BR=server
if ! "$GH" api "repos/$REPO/git/ref/heads/$BR" >/dev/null 2>&1; then
  MAIN=$("$GH" api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
  "$GH" api -X POST "repos/$REPO/git/refs" -f ref="refs/heads/$BR" -f sha="$MAIN" >/dev/null 2>&1
fi
SHA=$("$GH" api "repos/$REPO/contents/server.json?ref=$BR" --jq .sha 2>/dev/null)
if [ -n "$SHA" ]; then
  "$GH" api -X PUT "repos/$REPO/contents/server.json" -f message="サーバーのURLを更新" -f content="$CONTENT" -f sha="$SHA" -f branch="$BR" >/dev/null 2>&1
else
  "$GH" api -X PUT "repos/$REPO/contents/server.json" -f message="サーバーのURLを追加" -f content="$CONTENT" -f branch="$BR" >/dev/null 2>&1
fi && echo "GitHub にサーバーのURLを書き込みました"
