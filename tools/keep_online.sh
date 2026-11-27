#!/bin/bash
# サーバーと公開URLを見張って、止まったり切れたりしたら自動で起動し直す。
# Mac にログインしている間ずっと動く（tools/install_keep_online.sh で登録。外すときは --remove）。
#   - サーバー（server.py）が動いていなければ起動
#   - 公開URL（Cloudflare）が切れていたら作り直して、GitHub の server.json を書きかえる
#   - 電源につないでいる間は、Mac がスリープしないようにする（ふたを閉じると止まります）
# 記録: tools/keep_online.log
cd "$(dirname "$0")/.."
PORT=${PORT:-8765}   # このゲーム専用（8000番はほかのテスト用サーバーとぶつかりやすい）
BIN=tools/bin/cloudflared
LOGF=tools/keep_online.log
URL=""; TPID=""; FAIL=0; WAIT=0; BACK=60

say() { echo "$(date '+%m/%d %H:%M:%S') $*" >> "$LOGF"; }
server_up() { pgrep -f "server.py $PORT" >/dev/null; }   # このゲームのサーバーが動いているか

start_server() {
  [ -f tools/maintenance ] && return 0   # update.sh で更新中は手を出さない
  if ! server_up; then
    nohup python3 server.py $PORT >> tools/server.log 2>&1 &
    say "サーバーを起動しました"
    sleep 4
  fi
}

start_tunnel() {
  [ -n "$TPID" ] && kill $TPID 2>/dev/null
  pkill -f "cloudflared tunnel" 2>/dev/null
  sleep 1
  local TL; TL=$(mktemp)
  "$BIN" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$TL" 2>&1 &
  TPID=$!
  URL=""
  for i in $(seq 1 40); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TL" | grep -v '//api\.' | head -1)
    [ -n "$URL" ] && break
    kill -0 $TPID 2>/dev/null || break
    sleep 1
  done
  if [ -z "$URL" ]; then
    say "公開URLを作れませんでした（$(grep -m1 -oE 'status [0-9]+' "$TL" || echo 'ネットにつながっていないかも')）"
    kill $TPID 2>/dev/null; TPID=""; rm -f "$TL"
    return 1
  fi
  rm -f "$TL"
  for i in $(seq 1 20); do   # 新しいURLが外から見えるようになるまで待つ
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/")" = 200 ] && break
    sleep 2
  done
  bash tools/set_server_url.sh "wss://${URL#https://}/ws" >/dev/null 2>&1
  echo "$URL" > tools/tunnel_url
  say "公開しました: $URL"
}

tunnel_ok() {
  [ -n "$URL" ] && [ -n "$TPID" ] && kill -0 $TPID 2>/dev/null &&
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL/")" = 200 ]
}

# 見張りが止まっても、公開URLはそのまま残す（見張りを再起動してもURLが変わらないように）
# 完全に止めるのは tools/install_keep_online.sh --remove
cleanup() {
  [ -n "$CAF" ] && kill $CAF 2>/dev/null
  say "見張りを止めました"
  exit 0
}
trap cleanup INT TERM

# 電源につないでいる間はスリープしない（バッテリーのときは普段どおり）
caffeinate -s -w $$ &
CAF=$!

# 前の見張りが作った公開URLがまだ生きていれば、それを使い続ける
if [ -f tools/tunnel_url ]; then
  OLD=$(cat tools/tunnel_url); OPID=$(pgrep -f "cloudflared tunnel" | head -1)
  if [ -n "$OPID" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$OLD/")" = 200 ]; then
    URL=$OLD; TPID=$OPID
  fi
fi
say "見張りを始めました${URL:+（今の公開URLを引きつぎ: $URL）}"
while true; do
  start_server
  if tunnel_ok; then FAIL=0; else FAIL=$((FAIL + 1)); fi
  # 2回つづけてダメなら作り直す（更新中の一瞬の再起動では作り直さない）
  if [ -z "$URL" ] || [ $FAIL -ge 2 ]; then
    if [ $WAIT -le 0 ]; then
      if start_tunnel; then FAIL=0; BACK=60; else WAIT=$BACK; BACK=$((BACK * 2 > 900 ? 900 : BACK * 2)); fi
    fi
  fi
  WAIT=$((WAIT - 30))
  sleep 30
done
