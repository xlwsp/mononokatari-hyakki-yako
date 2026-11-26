#!/bin/bash
# モノノカタリ -百鬼夜行- をインターネットに公開して、URLを知っている人なら誰でも遊べるようにする
#   使い方:  bash start_online.sh
#   止める:  Ctrl + C（サーバーと公開の両方が止まります）
#
# Cloudflare の無料トンネル（アカウント不要）を使います。
# tools/online.conf に ngrok の設定を書くと、ずっと同じURLで公開できます。
# 設定がないときは、起動するたびに https://〇〇〇.trycloudflare.com という新しいURLになります。
# URLを知っている人は誰でもアクセスできるので、共有する相手に注意してください。

cd "$(dirname "$0")"
PORT=${PORT:-8765}   # このゲーム専用（8000番はほかのテスト用サーバーとぶつかりやすい）
# 自動の見張り（tools/install_keep_online.sh）が動いているときは、そちらにまかせる
if launchctl print "gui/$(id -u)/com.mononokatari.keeponline" >/dev/null 2>&1; then
  echo "サーバーは自動の見張りで動いています（tools/keep_online.log を見てね）。作り直しを頼みました。"
  launchctl kickstart -k "gui/$(id -u)/com.mononokatari.keeponline"
  exit 0
fi
BIN=tools/bin/cloudflared

# すでにサーバーが動いていなければ起動（下の公開方法どちらでも共通）
start_server() {
  if ! pgrep -f "server.py $PORT" >/dev/null; then
    python3 server.py $PORT &
    SERVER_PID=$!
    sleep 1
  fi
}

# ---- ずっと同じURLで公開（ngrok。tools/online.conf に設定があるとき） ----
CONF=tools/online.conf
if [ -f "$CONF" ]; then
  NGROK_AUTHTOKEN=$(grep -E '^NGROK_AUTHTOKEN=' "$CONF" | cut -d= -f2- | tr -d ' "')
  NGROK_DOMAIN=$(grep -E '^NGROK_DOMAIN=' "$CONF" | cut -d= -f2- | tr -d ' "' | sed -e 's#^https://##' -e 's#/$##')
fi
if [ -n "$NGROK_AUTHTOKEN" ] && [ -n "$NGROK_DOMAIN" ]; then
  NG=tools/bin/ngrok
  if [ ! -x "$NG" ]; then
    case "$(uname -m)" in
      arm64) NPKG=ngrok-v3-stable-darwin-arm64.zip ;;
      *) NPKG=ngrok-v3-stable-darwin-amd64.zip ;;
    esac
    echo "ngrok をダウンロードします（初回のみ）..."
    mkdir -p tools/bin
    curl -fsSL -o tools/bin/ngrok.zip "https://bin.equinox.io/c/bNyj1mQVY4c/$NPKG" || { echo "ダウンロードに失敗しました"; exit 1; }
    unzip -o -q tools/bin/ngrok.zip -d tools/bin && rm tools/bin/ngrok.zip
    chmod +x "$NG"
  fi
  start_server
  trap '[ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null; exit 0' INT TERM
  echo ""
  echo "=========================================================="
  echo "  🌏 公開しました！ このURLはずっと同じです"
  echo ""
  echo "     https://$NGROK_DOMAIN"
  echo ""
  echo "  （止めるときは Ctrl + C）"
  echo "=========================================================="
  echo ""
  "$NG" http "127.0.0.1:$PORT" --url "https://$NGROK_DOMAIN" --authtoken "$NGROK_AUTHTOKEN" --log stdout --log-level warn
  [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null
  exit 0
fi

# ---- 設定がないときは、毎回URLが変わる Cloudflare の無料トンネル ----
# cloudflared が無ければ公式 GitHub から取得（このMacの種類に合わせる）
if [ ! -x "$BIN" ]; then
  ARCH=$(uname -m)
  case "$ARCH" in
    arm64) PKG=cloudflared-darwin-arm64.tgz ;;
    x86_64) PKG=cloudflared-darwin-amd64.tgz ;;
    *) echo "未対応のCPUです: $ARCH"; exit 1 ;;
  esac
  echo "cloudflared をダウンロードします（初回のみ）..."
  mkdir -p tools/bin
  curl -fsSL -o tools/bin/cf.tgz "https://github.com/cloudflare/cloudflared/releases/latest/download/$PKG" || { echo "ダウンロードに失敗しました"; exit 1; }
  tar xzf tools/bin/cf.tgz -C tools/bin && rm tools/bin/cf.tgz
  chmod +x "$BIN"
fi

start_server

cleanup() {
  bash tools/set_server_url.sh "" >/dev/null 2>&1   # GitHub 側に「止まっている」と書く
  [ -n "$TUNNEL_PID" ] && kill $TUNNEL_PID 2>/dev/null
  [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

LOG=$(mktemp)
"$BIN" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!

echo "公開用URLを準備中..."
URL=""
for i in $(seq 1 60); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "URLを取得できませんでした。ログ:"; cat "$LOG"; cleanup
fi

# GitHub Pages を使っているときは、今のURLを GitHub に書き込む（遊ぶ人はずっと同じURLでOK）
WSURL="wss://${URL#https://}/ws"
bash tools/set_server_url.sh "$WSURL"
PAGES=""
if [ -f tools/github.conf ]; then
  REPO=$(grep -E '^REPO=' tools/github.conf | cut -d= -f2- | tr -d ' "')
  PAGES="https://${REPO%%/*}.github.io/${REPO#*/}/"
fi

echo ""
echo "=========================================================="
if [ -n "$PAGES" ]; then
  echo "  🌏 公開しました！ このURLはずっと同じです"
  echo ""
  echo "     $PAGES"
else
  echo "  🌏 公開しました！ このURLを友達に送ってね"
  echo ""
  echo "     $URL"
fi
echo ""
echo "  （止めるときは Ctrl + C）"
echo "=========================================================="
echo ""
wait $TUNNEL_PID
